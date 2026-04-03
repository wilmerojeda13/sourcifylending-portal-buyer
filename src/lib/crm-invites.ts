import type { SupabaseClient } from '@supabase/supabase-js'

export const CRM_INVITE_COOKIE = 'crm_invite'
export const CRM_INVITE_SOURCE = 'crm_dialer'

export const CRM_INVITE_TYPES = ['portal', 'pre_analyzer'] as const
export type CrmInviteType = (typeof CRM_INVITE_TYPES)[number]

export const CRM_INVITE_STATUSES = [
  'sent',
  'delivered',
  'opened',
  'clicked',
  'account_created',
  'analyzer_started',
  'analyzer_submitted',
] as const
export type CrmInviteStatus = (typeof CRM_INVITE_STATUSES)[number]

export interface CrmLeadInviteRow {
  id: string
  lead_id: string
  email: string
  invite_type: CrmInviteType
  resend_email_id: string | null
  status: CrmInviteStatus
  invited_user_id: string | null
  invited_profile_id: string | null
  sent_by_user_id: string | null
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  account_created_at: string | null
  analyzer_started_at: string | null
  analyzer_submitted_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CrmLeadInviteSummary {
  portal_invite_sent: boolean
  portal_invite_last_sent_at: string | null
  portal_invite_last_status: CrmInviteStatus | null
  pre_analyzer_invite_sent: boolean
  pre_analyzer_invite_last_sent_at: string | null
  pre_analyzer_invite_last_status: CrmInviteStatus | null
  account_created: boolean
  account_created_at: string | null
  analyzer_started: boolean
  analyzer_started_at: string | null
  analyzer_submitted: boolean
  analyzer_submitted_at: string | null
  latest_invite_id: string | null
}

const STATUS_PRIORITY: Record<CrmInviteStatus, number> = {
  sent: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  account_created: 4,
  analyzer_started: 5,
  analyzer_submitted: 6,
}

const INVITE_ACTIVITY: Record<CrmInviteStatus, { type: string; body: (inviteType: CrmInviteType, email: string) => string }> = {
  sent: {
    type: 'email',
    body: (inviteType, email) => `${formatInviteTypeLabel(inviteType)} invite sent to ${email}`,
  },
  delivered: {
    type: 'email',
    body: (inviteType, email) => `${formatInviteTypeLabel(inviteType)} invite delivered to ${email}`,
  },
  opened: {
    type: 'email',
    body: (inviteType, email) => `${formatInviteTypeLabel(inviteType)} invite opened by ${email}`,
  },
  clicked: {
    type: 'email',
    body: (inviteType, email) => `${formatInviteTypeLabel(inviteType)} invite clicked by ${email}`,
  },
  account_created: {
    type: 'note',
    body: (inviteType, email) => `Free account created from ${formatInviteTypeLabel(inviteType).toLowerCase()} invite for ${email}`,
  },
  analyzer_started: {
    type: 'note',
    body: (inviteType, email) => `Analyzer started from ${formatInviteTypeLabel(inviteType).toLowerCase()} invite for ${email}`,
  },
  analyzer_submitted: {
    type: 'note',
    body: (inviteType, email) => `Analyzer submitted from ${formatInviteTypeLabel(inviteType).toLowerCase()} invite for ${email}`,
  },
}

export function normalizeInviteEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? ''
}

export function getAppUrl(origin?: string) {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || origin || 'https://app.sourcifylending.com').replace(/\/$/, '')
}

export function formatInviteTypeLabel(inviteType: CrmInviteType) {
  return inviteType === 'portal' ? 'Portal' : 'Pre-Analyzer'
}

export function getInviteStatusPriority(status: CrmInviteStatus | null | undefined) {
  return status ? STATUS_PRIORITY[status] ?? -1 : -1
}

export function buildCrmInviteLink(inviteId: string, inviteType: CrmInviteType, origin?: string) {
  const base = getAppUrl(origin)
  const path = inviteType === 'portal' ? '/signup' : '/analyzer'
  return `${base}${path}?crm_invite=${encodeURIComponent(inviteId)}`
}

export async function createCrmLeadActivity(
  supabase: SupabaseClient,
  leadId: string,
  type: string,
  body: string,
  createdBy: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from('crm_activities').insert({
    lead_id: leadId,
    type,
    body,
    metadata,
    created_by: createdBy,
  })
}

function pickLatestIso(current: string | null, next: string) {
  if (!current) return next
  return new Date(next) > new Date(current) ? next : current
}

export async function markCrmInviteEvent(
  supabase: SupabaseClient,
  opts: {
    inviteId: string
    status: CrmInviteStatus
    occurredAt?: string
    resendEmailId?: string | null
    invitedUserId?: string | null
    invitedProfileId?: string | null
    metadata?: Record<string, unknown>
    createdBy?: string
  },
) {
  const occurredAt = opts.occurredAt ?? new Date().toISOString()

  const { data: invite, error } = await supabase
    .from('crm_lead_invites')
    .select('*')
    .eq('id', opts.inviteId)
    .maybeSingle()

  if (error || !invite) {
    return { invite: null, changed: false }
  }

  const nextMetadata = {
    ...((invite.metadata as Record<string, unknown> | null) ?? {}),
    ...(opts.metadata ?? {}),
  }

  const update: Record<string, unknown> = {
    updated_at: occurredAt,
    metadata: nextMetadata,
  }

  if (opts.resendEmailId) update.resend_email_id = opts.resendEmailId
  if (opts.invitedUserId) update.invited_user_id = opts.invitedUserId
  if (opts.invitedProfileId) update.invited_profile_id = opts.invitedProfileId

  const nextPriority = getInviteStatusPriority(opts.status)
  const currentPriority = getInviteStatusPriority(invite.status as CrmInviteStatus)
  if (nextPriority >= currentPriority) {
    update.status = opts.status
  }

  if (opts.status === 'sent') update.sent_at = pickLatestIso(invite.sent_at, occurredAt)
  if (opts.status === 'opened') update.opened_at = pickLatestIso(invite.opened_at, occurredAt)
  if (opts.status === 'clicked') update.clicked_at = pickLatestIso(invite.clicked_at, occurredAt)
  if (opts.status === 'account_created') update.account_created_at = pickLatestIso(invite.account_created_at, occurredAt)
  if (opts.status === 'analyzer_started') update.analyzer_started_at = pickLatestIso(invite.analyzer_started_at, occurredAt)
  if (opts.status === 'analyzer_submitted') update.analyzer_submitted_at = pickLatestIso(invite.analyzer_submitted_at, occurredAt)

  const { data: updated, error: updateError } = await supabase
    .from('crm_lead_invites')
    .update(update)
    .eq('id', opts.inviteId)
    .select('*')
    .single()

  if (updateError || !updated) {
    return { invite: invite as CrmLeadInviteRow, changed: false }
  }

  const activity = INVITE_ACTIVITY[opts.status]
  await createCrmLeadActivity(
    supabase,
    updated.lead_id,
    activity.type,
    activity.body(updated.invite_type, updated.email),
    opts.createdBy ?? CRM_INVITE_SOURCE,
    {
      invite_id: updated.id,
      invite_type: updated.invite_type,
      status: opts.status,
      ...(opts.resendEmailId ? { resend_email_id: opts.resendEmailId } : {}),
      ...(opts.metadata ?? {}),
    },
  ).catch(() => {})

  return { invite: updated as CrmLeadInviteRow, changed: true }
}

export async function linkCrmInviteAccount(
  supabase: SupabaseClient,
  opts: {
    inviteId: string | null | undefined
    userId: string
    profileId?: string | null
    email: string | null | undefined
    createdBy?: string
    metadata?: Record<string, unknown>
  },
) {
  if (!opts.inviteId || !opts.email) return null
  const normalizedEmail = normalizeInviteEmail(opts.email)
  const { data: invite } = await supabase
    .from('crm_lead_invites')
    .select('*')
    .eq('id', opts.inviteId)
    .maybeSingle()

  if (!invite || normalizeInviteEmail(invite.email) !== normalizedEmail) {
    return null
  }

  return markCrmInviteEvent(supabase, {
    inviteId: opts.inviteId,
    status: 'account_created',
    invitedUserId: opts.userId,
    invitedProfileId: opts.profileId ?? opts.userId,
    createdBy: opts.createdBy,
    metadata: opts.metadata,
  })
}

export function buildCrmInviteSummary(invites: CrmLeadInviteRow[]): CrmLeadInviteSummary {
  const summary: CrmLeadInviteSummary = {
    portal_invite_sent: false,
    portal_invite_last_sent_at: null,
    portal_invite_last_status: null,
    pre_analyzer_invite_sent: false,
    pre_analyzer_invite_last_sent_at: null,
    pre_analyzer_invite_last_status: null,
    account_created: false,
    account_created_at: null,
    analyzer_started: false,
    analyzer_started_at: null,
    analyzer_submitted: false,
    analyzer_submitted_at: null,
    latest_invite_id: null,
  }

  for (const invite of invites) {
    if (!summary.latest_invite_id || new Date(invite.updated_at) > new Date(invites.find(row => row.id === summary.latest_invite_id)?.updated_at ?? 0)) {
      summary.latest_invite_id = invite.id
    }

    if (invite.invite_type === 'portal') {
      summary.portal_invite_sent ||= Boolean(invite.sent_at)
      summary.portal_invite_last_sent_at = pickLatestIso(summary.portal_invite_last_sent_at, invite.sent_at ?? invite.created_at)
      if (!summary.portal_invite_last_status || getInviteStatusPriority(invite.status) >= getInviteStatusPriority(summary.portal_invite_last_status)) {
        summary.portal_invite_last_status = invite.status
      }
    }

    if (invite.invite_type === 'pre_analyzer') {
      summary.pre_analyzer_invite_sent ||= Boolean(invite.sent_at)
      summary.pre_analyzer_invite_last_sent_at = pickLatestIso(summary.pre_analyzer_invite_last_sent_at, invite.sent_at ?? invite.created_at)
      if (!summary.pre_analyzer_invite_last_status || getInviteStatusPriority(invite.status) >= getInviteStatusPriority(summary.pre_analyzer_invite_last_status)) {
        summary.pre_analyzer_invite_last_status = invite.status
      }
    }

    if (invite.account_created_at) {
      summary.account_created = true
      summary.account_created_at = pickLatestIso(summary.account_created_at, invite.account_created_at)
    }
    if (invite.analyzer_started_at) {
      summary.analyzer_started = true
      summary.analyzer_started_at = pickLatestIso(summary.analyzer_started_at, invite.analyzer_started_at)
    }
    if (invite.analyzer_submitted_at) {
      summary.analyzer_submitted = true
      summary.analyzer_submitted_at = pickLatestIso(summary.analyzer_submitted_at, invite.analyzer_submitted_at)
    }
  }

  return summary
}

export async function getCrmInviteSummaryMap(supabase: SupabaseClient, leadIds: string[]) {
  if (leadIds.length === 0) return new Map<string, CrmLeadInviteSummary>()

  const { data } = await supabase
    .from('crm_lead_invites')
    .select('*')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as CrmLeadInviteRow[]
  const grouped = new Map<string, CrmLeadInviteRow[]>()

  for (const row of rows) {
    const existing = grouped.get(row.lead_id) ?? []
    existing.push(row)
    grouped.set(row.lead_id, existing)
  }

  const summaries = new Map<string, CrmLeadInviteSummary>()
  for (const leadId of leadIds) {
    summaries.set(leadId, buildCrmInviteSummary(grouped.get(leadId) ?? []))
  }
  return summaries
}

export async function getCrmInviteRows(supabase: SupabaseClient, leadId: string) {
  const { data } = await supabase
    .from('crm_lead_invites')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  return (data ?? []) as CrmLeadInviteRow[]
}
