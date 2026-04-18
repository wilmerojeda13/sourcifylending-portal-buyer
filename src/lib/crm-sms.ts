import type { SupabaseClient } from '@supabase/supabase-js'
import { createCrmLeadActivity, getAppUrl } from '@/lib/crm-invites'
const CRM_SMS_QUERY_CHUNK_SIZE = 200

export const CRM_TEXT_COOKIE = 'crm_text'
export const CRM_SMS_SOURCE = 'crm_dialer'

export const CRM_SMS_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'clicked',
  'account_created',
  'failed',
] as const

export type CrmSmsStatus = (typeof CRM_SMS_STATUSES)[number]

export interface CrmLeadSmsRow {
  id: string
  lead_id: string
  phone_number: string
  message_body: string
  direction: 'outbound' | 'inbound'
  twilio_message_sid: string | null
  status: CrmSmsStatus
  delivery_status: string | null
  clicked: boolean
  unread: boolean
  campaign_id: string | null
  parent_sms_id: string | null
  sent_by_user_id: string | null
  destination_url: string | null
  metadata: Record<string, unknown> | null
  sent_at: string | null
  delivered_at: string | null
  clicked_at: string | null
  account_created_at: string | null
  failed_at: string | null
  read_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface CrmLeadSmsSummary {
  sms_sent_count: number
  sms_delivered_count: number
  sms_clicked_count: number
  inbound_reply_count: number
  unread_conversation_count: number
  last_sms_sent_at: string | null
  last_sms_status: CrmSmsStatus | null
  last_sms_clicked_at: string | null
  last_inbound_reply_at: string | null
  sms_account_created: boolean
  sms_account_created_at: string | null
}

const STATUS_PRIORITY: Record<CrmSmsStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  clicked: 3,
  account_created: 4,
  failed: 5,
}

const SMS_ACTIVITY: Record<CrmSmsStatus, { type: string; body: (phone: string) => string }> = {
  queued: {
    type: 'sms',
    body: (phone) => `SMS queued for ${phone}`,
  },
  sent: {
    type: 'sms',
    body: (phone) => `SMS sent to ${phone}`,
  },
  delivered: {
    type: 'sms',
    body: (phone) => `SMS delivered to ${phone}`,
  },
  clicked: {
    type: 'sms',
    body: (phone) => `SMS link clicked by ${phone}`,
  },
  account_created: {
    type: 'sms',
    body: (phone) => `Free account created from SMS sent to ${phone}`,
  },
  failed: {
    type: 'sms',
    body: (phone) => `SMS failed for ${phone}`,
  },
}

function pickLatestIso(current: string | null, next: string | null | undefined) {
  if (!next) return current
  if (!current) return next
  return new Date(next) > new Date(current) ? next : current
}

export function getCrmPortalSignupUrl(origin?: string) {
  return `${getAppUrl(origin)}/signup`
}

export function buildCrmSmsTrackedLink(messageId: string, origin?: string) {
  return `${getAppUrl(origin)}/go/sms/${encodeURIComponent(messageId)}`
}

export function buildDefaultCrmSmsBody(firstName: string | null | undefined, origin?: string) {
  const safeFirstName = firstName?.trim() || 'there'
  return `Hi ${safeFirstName}, this is SourcifyLending. Here’s the link to get started in the portal: ${getCrmPortalSignupUrl(origin)}`
}

export function renderCrmSmsTemplate(template: string, vars: Record<string, string | null | undefined>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  })
}

export function injectTrackedPortalLink(message: string, trackedLink: string, origin?: string) {
  const canonicalPortalLink = getCrmPortalSignupUrl(origin)
  let nextMessage = message.trim()
  nextMessage = nextMessage.replaceAll('{{portal_link}}', trackedLink)
  nextMessage = nextMessage.replaceAll('[portal link]', trackedLink)
  nextMessage = nextMessage.replaceAll(canonicalPortalLink, trackedLink)

  if (!/https?:\/\//i.test(nextMessage)) {
    nextMessage = `${nextMessage} ${trackedLink}`.trim()
  }

  return nextMessage
}

export function mapTwilioSmsStatus(rawStatus: string | null | undefined): CrmSmsStatus {
  const status = (rawStatus ?? '').toLowerCase()
  if (status === 'delivered' || status === 'read') return 'delivered'
  if (status === 'clicked') return 'clicked'
  if (status === 'failed' || status === 'undelivered' || status === 'canceled') return 'failed'
  if (status === 'queued' || status === 'accepted' || status === 'scheduled') return 'queued'
  return 'sent'
}

export function normalizePhoneMatchCandidates(phone: string | null | undefined) {
  const raw = (phone ?? '').replace(/\D+/g, '')
  if (!raw) return []
  const values = new Set<string>()
  values.add(raw)
  if (raw.length === 11 && raw.startsWith('1')) values.add(raw.slice(1))
  if (raw.length === 10) values.add(`1${raw}`)
  return Array.from(values)
}

export async function markCrmSmsEvent(
  supabase: SupabaseClient,
  opts: {
    smsId: string
    status: CrmSmsStatus
    occurredAt?: string
    twilioMessageSid?: string | null
    deliveryStatus?: string | null
    errorMessage?: string | null
    unread?: boolean
    readAt?: string | null
    metadata?: Record<string, unknown>
    createdBy?: string
  },
) {
  const occurredAt = opts.occurredAt ?? new Date().toISOString()
  const { data: sms, error } = await supabase
    .from('crm_lead_sms')
    .select('*')
    .eq('id', opts.smsId)
    .maybeSingle()

  if (error || !sms) return { sms: null, changed: false }

  const currentStatus = sms.status as CrmSmsStatus
  const nextPriority = STATUS_PRIORITY[opts.status] ?? -1
  const currentPriority = STATUS_PRIORITY[currentStatus] ?? -1

  const update: Record<string, unknown> = {
    updated_at: occurredAt,
    metadata: {
      ...((sms.metadata as Record<string, unknown> | null) ?? {}),
      ...(opts.metadata ?? {}),
    },
  }

  if (opts.twilioMessageSid) update.twilio_message_sid = opts.twilioMessageSid
  if (opts.deliveryStatus) update.delivery_status = opts.deliveryStatus
  if (opts.errorMessage !== undefined) update.error_message = opts.errorMessage
  if (opts.unread !== undefined) update.unread = opts.unread
  if (opts.readAt !== undefined) update.read_at = opts.readAt

  if (nextPriority >= currentPriority || opts.status === 'failed') {
    update.status = opts.status
  }

  if (opts.status === 'sent') update.sent_at = pickLatestIso(sms.sent_at, occurredAt)
  if (opts.status === 'delivered') update.delivered_at = pickLatestIso(sms.delivered_at, occurredAt)
  if (opts.status === 'clicked') {
    update.clicked = true
    update.clicked_at = pickLatestIso(sms.clicked_at, occurredAt)
  }
  if (opts.status === 'account_created') update.account_created_at = pickLatestIso(sms.account_created_at, occurredAt)
  if (opts.status === 'failed') update.failed_at = pickLatestIso(sms.failed_at, occurredAt)

  const { data: updated, error: updateError } = await supabase
    .from('crm_lead_sms')
    .update(update)
    .eq('id', opts.smsId)
    .select('*')
    .single()

  if (updateError || !updated) {
    return { sms: sms as CrmLeadSmsRow, changed: false }
  }

  const activity = SMS_ACTIVITY[opts.status]
  await createCrmLeadActivity(
    supabase,
    updated.lead_id,
    activity.type,
    activity.body(updated.phone_number),
    opts.createdBy ?? CRM_SMS_SOURCE,
    {
      sms_id: updated.id,
      status: opts.status,
      twilio_message_sid: updated.twilio_message_sid,
      delivery_status: updated.delivery_status,
      ...(opts.metadata ?? {}),
    },
  ).catch(() => {})

  return { sms: updated as CrmLeadSmsRow, changed: true }
}

export async function linkCrmSmsAccount(
  supabase: SupabaseClient,
  opts: {
    smsId: string | null | undefined
    userId: string
    profileId?: string | null
    email?: string | null
    createdBy?: string
    metadata?: Record<string, unknown>
  },
) {
  if (!opts.smsId) return null

  return markCrmSmsEvent(supabase, {
    smsId: opts.smsId,
    status: 'account_created',
    createdBy: opts.createdBy,
    metadata: {
      invited_user_id: opts.userId,
      invited_profile_id: opts.profileId ?? opts.userId,
      ...(opts.email ? { invited_email: opts.email } : {}),
      ...(opts.metadata ?? {}),
    },
  })
}

export function buildCrmSmsSummary(rows: CrmLeadSmsRow[]): CrmLeadSmsSummary {
  return rows.reduce<CrmLeadSmsSummary>((summary, row) => {
    if (row.direction === 'outbound' && row.sent_at) {
      summary.sms_sent_count += 1
      summary.last_sms_sent_at = pickLatestIso(summary.last_sms_sent_at, row.sent_at)
      if (!summary.last_sms_status || STATUS_PRIORITY[row.status] >= STATUS_PRIORITY[summary.last_sms_status]) {
        summary.last_sms_status = row.status
      }
    }
    if (row.direction === 'outbound' && (row.delivered_at || row.status === 'delivered' || row.status === 'clicked' || row.status === 'account_created')) {
      summary.sms_delivered_count += 1
    }
    if (row.direction === 'outbound' && (row.clicked_at || row.clicked || row.status === 'clicked' || row.status === 'account_created')) {
      summary.sms_clicked_count += 1
      summary.last_sms_clicked_at = pickLatestIso(summary.last_sms_clicked_at, row.clicked_at ?? row.updated_at)
    }
    if (row.direction === 'inbound') {
      summary.inbound_reply_count += 1
      summary.last_inbound_reply_at = pickLatestIso(summary.last_inbound_reply_at, row.sent_at ?? row.created_at)
      if (row.unread) summary.unread_conversation_count += 1
    }
    if (row.account_created_at || row.status === 'account_created') {
      summary.sms_account_created = true
      summary.sms_account_created_at = pickLatestIso(summary.sms_account_created_at, row.account_created_at ?? row.updated_at)
    }
    return summary
  }, {
    sms_sent_count: 0,
    sms_delivered_count: 0,
    sms_clicked_count: 0,
    inbound_reply_count: 0,
    unread_conversation_count: 0,
    last_sms_sent_at: null,
    last_sms_status: null,
    last_sms_clicked_at: null,
    last_inbound_reply_at: null,
    sms_account_created: false,
    sms_account_created_at: null,
  })
}

export async function getCrmSmsRows(supabase: SupabaseClient, leadId: string) {
  const { data } = await supabase
    .from('crm_lead_sms')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  return (data ?? []) as CrmLeadSmsRow[]
}

export async function getCrmSmsSummaryMap(supabase: SupabaseClient, leadIds: string[]) {
  if (leadIds.length === 0) return new Map<string, CrmLeadSmsSummary>()
  const rows: CrmLeadSmsRow[] = []

  for (let index = 0; index < leadIds.length; index += CRM_SMS_QUERY_CHUNK_SIZE) {
    const chunk = leadIds.slice(index, index + CRM_SMS_QUERY_CHUNK_SIZE)
    const { data } = await supabase
      .from('crm_lead_sms')
      .select('*')
      .in('lead_id', chunk)
      .order('created_at', { ascending: false })

    rows.push(...((data ?? []) as CrmLeadSmsRow[]))
  }
  const grouped = new Map<string, CrmLeadSmsRow[]>()

  for (const row of rows) {
    const existing = grouped.get(row.lead_id) ?? []
    existing.push(row)
    grouped.set(row.lead_id, existing)
  }

  const summaries = new Map<string, CrmLeadSmsSummary>()
  for (const leadId of leadIds) {
    summaries.set(leadId, buildCrmSmsSummary(grouped.get(leadId) ?? []))
  }
  return summaries
}
