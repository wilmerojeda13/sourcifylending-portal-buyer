import { normalizeSignupEmail } from '@/lib/signup-security'
import { createServiceClient } from '@/lib/supabase/server'

const SUPPORTED_EVENT_TYPES = new Set(['delivered', 'opened', 'clicked', 'bounced', 'complained'])
const TERMINAL_RECIPIENT_STATUSES = new Set([
  'blocked_unsubscribed',
  'blocked_suppressed',
  'bounced',
  'complained',
])

type CampaignSesEventType = 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained'

interface CampaignSesPayloadRecord extends Record<string, unknown> {
  mail?: unknown
  delivery?: unknown
  open?: unknown
  click?: unknown
  bounce?: unknown
  complaint?: unknown
}

interface ResolvedRecipientRow {
  id: string
  campaign_id: string
  email: string
  send_status: string
  provider_message_id: string | null
}

export interface ProcessCampaignSesEventInput {
  payload: unknown
}

export interface ProcessCampaignSesEventResult {
  success: boolean
  skipped: boolean
  eventType: string | null
  normalizedEmail: string | null
  providerMessageId: string | null
  campaignId: string | null
  recipientId: string | null
  duplicateEvent: boolean
  errorMessage: string | null
}

export interface CampaignSesEventIngestionOptions {
  db?: any
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function maybeParseJson(value: unknown) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function unwrapCampaignSesPayload(payload: unknown): CampaignSesPayloadRecord | null {
  const parsed = maybeParseJson(payload)
  const record = toRecord(parsed)
  if (!record) return null

  const snsRecords = Array.isArray(record.Records) ? record.Records : null
  if (snsRecords?.length) {
    const firstRecord = toRecord(snsRecords[0])
    const sns = toRecord(firstRecord?.Sns)
    const snsMessage = maybeParseJson(sns?.Message)
    const snsRecord = toRecord(snsMessage)
    if (snsRecord) {
      return snsRecord as CampaignSesPayloadRecord
    }
  }

  const message = record.Message
  const notificationType = typeof record.Type === 'string' ? record.Type : null
  if (typeof message === 'string' && notificationType === 'Notification') {
    const parsedMessage = maybeParseJson(message)
    const parsedRecord = toRecord(parsedMessage)
    if (parsedRecord) {
      return parsedRecord as CampaignSesPayloadRecord
    }
  }

  return record as CampaignSesPayloadRecord
}

function normalizeEventType(rawValue: unknown): CampaignSesEventType | null {
  if (typeof rawValue !== 'string') return null
  const normalized = rawValue.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('delivery')) return 'delivered'
  if (normalized.includes('open')) return 'opened'
  if (normalized.includes('click')) return 'clicked'
  if (normalized.includes('complaint')) return 'complained'
  if (normalized.includes('bounce')) return 'bounced'
  return null
}

function extractEventType(payload: CampaignSesPayloadRecord) {
  return (
    normalizeEventType(payload.eventType) ||
    normalizeEventType(payload.event_type) ||
    normalizeEventType(payload.notificationType) ||
    normalizeEventType(payload.Type) ||
    normalizeEventType(payload.type)
  )
}

function extractProviderMessageId(payload: CampaignSesPayloadRecord) {
  const mail = toRecord(payload.mail)
  const commonHeaders = toRecord(mail?.commonHeaders)

  return (
    (typeof mail?.messageId === 'string' && mail.messageId.trim()) ||
    (typeof commonHeaders?.messageId === 'string' && commonHeaders.messageId.trim()) ||
    (typeof commonHeaders?.messageID === 'string' && commonHeaders.messageID.trim()) ||
    (typeof payload.messageId === 'string' && payload.messageId.trim()) ||
    (typeof payload.message_id === 'string' && payload.message_id.trim()) ||
    null
  )
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractRecipientEmail(payload: CampaignSesPayloadRecord) {
  const mail = toRecord(payload.mail)
  const commonHeaders = toRecord(mail?.commonHeaders)
  const delivery = toRecord(payload.delivery)
  const open = toRecord(payload.open)
  const click = toRecord(payload.click)
  const bounce = toRecord(payload.bounce)
  const complaint = toRecord(payload.complaint)

  const bouncedRecipients = Array.isArray(bounce?.bouncedRecipients) ? bounce.bouncedRecipients : []
  const complainedRecipients = Array.isArray(complaint?.complainedRecipients) ? complaint.complainedRecipients : []

  return firstString([
    ...(Array.isArray(mail?.destination) ? mail.destination : []),
    ...(Array.isArray(commonHeaders?.to) ? commonHeaders.to : []),
    ...(Array.isArray(delivery?.recipients) ? delivery.recipients : []),
    ...(Array.isArray(open?.recipients) ? open.recipients : []),
    ...(Array.isArray(click?.recipients) ? click.recipients : []),
    firstString(bouncedRecipients.map((item) => toRecord(item)?.emailAddress)),
    firstString(complainedRecipients.map((item) => toRecord(item)?.emailAddress)),
    typeof payload.email === 'string' ? payload.email : null,
  ])
}

function extractOccurredAt(payload: CampaignSesPayloadRecord) {
  const mail = toRecord(payload.mail)
  const delivery = toRecord(payload.delivery)
  const open = toRecord(payload.open)
  const click = toRecord(payload.click)
  const bounce = toRecord(payload.bounce)
  const complaint = toRecord(payload.complaint)

  return firstString([
    typeof payload.timestamp === 'string' ? payload.timestamp : null,
    typeof payload.occurredAt === 'string' ? payload.occurredAt : null,
    typeof payload.occurred_at === 'string' ? payload.occurred_at : null,
    typeof delivery?.timestamp === 'string' ? delivery.timestamp : null,
    typeof open?.timestamp === 'string' ? open.timestamp : null,
    typeof click?.timestamp === 'string' ? click.timestamp : null,
    typeof bounce?.timestamp === 'string' ? bounce.timestamp : null,
    typeof complaint?.timestamp === 'string' ? complaint.timestamp : null,
    typeof mail?.timestamp === 'string' ? mail.timestamp : null,
  ]) ?? new Date().toISOString()
}

function isHardBounce(payload: CampaignSesPayloadRecord) {
  const bounce = toRecord(payload.bounce)
  const bounceType = typeof bounce?.bounceType === 'string'
    ? bounce.bounceType
    : typeof bounce?.bounce_type === 'string'
      ? bounce.bounce_type
      : null

  return (bounceType?.trim().toUpperCase() ?? '') === 'PERMANENT'
}

function isUniqueViolation(error: any) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
  return error?.code === '23505' || message.includes('duplicate') || message.includes('unique')
}

function getBounceSuppressionNotes(payload: CampaignSesPayloadRecord, providerMessageId: string | null) {
  const bounce = toRecord(payload.bounce)
  const bounceType = typeof bounce?.bounceType === 'string' ? bounce.bounceType : typeof bounce?.bounce_type === 'string' ? bounce.bounce_type : null
  const bounceSubType = typeof bounce?.bounceSubType === 'string' ? bounce.bounceSubType : typeof bounce?.bounce_sub_type === 'string' ? bounce.bounce_sub_type : null
  return [bounceType, bounceSubType, providerMessageId].filter(Boolean).join(' | ') || null
}

function getComplaintSuppressionNotes(payload: CampaignSesPayloadRecord, providerMessageId: string | null) {
  const complaint = toRecord(payload.complaint)
  const complaintFeedbackType = typeof complaint?.complaintFeedbackType === 'string'
    ? complaint.complaintFeedbackType
    : typeof complaint?.complaint_feedback_type === 'string'
      ? complaint.complaint_feedback_type
      : null
  const complaintSubType = typeof complaint?.complaintSubType === 'string'
    ? complaint.complaintSubType
    : typeof complaint?.complaint_sub_type === 'string'
      ? complaint.complaint_sub_type
      : null
  return [complaintFeedbackType, complaintSubType, providerMessageId].filter(Boolean).join(' | ') || null
}

async function resolveRecipient(db: any, providerMessageId: string | null, normalizedEmail: string | null) {
  if (providerMessageId) {
    const byMessageId = await db
      .from('email_campaign_recipients')
      .select('id, campaign_id, email, send_status, provider_message_id')
      .eq('provider_message_id', providerMessageId)
      .maybeSingle()

    if (byMessageId?.data) {
      return byMessageId.data as ResolvedRecipientRow
    }
  }

  if (!normalizedEmail) return null

  const byEmail = await db
    .from('email_campaign_recipients')
    .select('id, campaign_id, email, send_status, provider_message_id')
    .ilike('email', normalizedEmail)
    .maybeSingle()

  if (byEmail.error || !byEmail.data) {
    return null
  }

  return byEmail.data as ResolvedRecipientRow
}

async function eventAlreadyProcessed(
  db: any,
  recipientId: string | null,
  providerMessageId: string | null,
  normalizedEmail: string,
  eventType: string,
) {
  let query = db.from('email_events').select('id', { count: 'exact', head: true }).eq('event_type', eventType)

  if (recipientId) {
    query = query.eq('recipient_id', recipientId)
  } else if (providerMessageId) {
    query = query.eq('provider_message_id', providerMessageId)
  } else {
    query = query.ilike('email', normalizedEmail)
  }

  const { count, error } = await query
  return { duplicateEvent: (count ?? 0) > 0, error }
}

async function writeSuppression(
  db: any,
  normalizedEmail: string,
  suppressionType: 'bounce' | 'complaint',
  source: string,
  notes: string | null,
) {
  const { error } = await db.from('email_suppressions').insert({
    email: normalizedEmail,
    suppression_type: suppressionType,
    source,
    notes,
  })

  if (error && !isUniqueViolation(error)) {
    return error.message as string
  }

  return null
}

function shouldUpdateRecipientStatus(currentStatus: string, eventType: CampaignSesEventType) {
  if (TERMINAL_RECIPIENT_STATUSES.has(currentStatus) && eventType !== 'delivered') {
    return false
  }
  return true
}

function buildRecipientPatch(
  recipient: ResolvedRecipientRow,
  eventType: CampaignSesEventType,
  providerMessageId: string | null,
  occurredAt: string,
) {
  const patch: Record<string, unknown> = {
    last_event_at: occurredAt,
  }

  if (providerMessageId && !recipient.provider_message_id) {
    patch.provider_message_id = providerMessageId
  }

  if (eventType === 'delivered' && shouldUpdateRecipientStatus(recipient.send_status, eventType)) {
    patch.send_status = 'delivered'
  }

  if (eventType === 'bounced' && recipient.send_status !== 'blocked_unsubscribed' && recipient.send_status !== 'blocked_suppressed') {
    patch.send_status = 'bounced'
  }

  if (eventType === 'complained' && recipient.send_status !== 'blocked_unsubscribed' && recipient.send_status !== 'blocked_suppressed') {
    patch.send_status = 'complained'
  }

  return patch
}

async function countCampaignEvents(db: any, campaignId: string, eventType: CampaignSesEventType) {
  const { count, error } = await db
    .from('email_events')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('event_type', eventType)

  return {
    count: count ?? 0,
    errorMessage: error ? (error.message as string) : null,
  }
}

async function refreshCampaignEventCounters(db: any, campaignId: string) {
  const [delivered, opened, clicked, bounced, complained] = await Promise.all([
    countCampaignEvents(db, campaignId, 'delivered'),
    countCampaignEvents(db, campaignId, 'opened'),
    countCampaignEvents(db, campaignId, 'clicked'),
    countCampaignEvents(db, campaignId, 'bounced'),
    countCampaignEvents(db, campaignId, 'complained'),
  ])

  const firstError = delivered.errorMessage || opened.errorMessage || clicked.errorMessage || bounced.errorMessage || complained.errorMessage
  if (firstError) {
    return { errorMessage: firstError }
  }

  const { error } = await db
    .from('email_campaigns')
    .update({
      delivered_count: delivered.count,
      opened_count: opened.count,
      clicked_count: clicked.count,
      bounced_count: bounced.count,
      complained_count: complained.count,
    })
    .eq('id', campaignId)

  return { errorMessage: error ? (error.message as string) : null }
}

export async function processCampaignSesEvent(
  input: ProcessCampaignSesEventInput,
  options: CampaignSesEventIngestionOptions = {},
): Promise<ProcessCampaignSesEventResult> {
  const db = options.db ?? (await createServiceClient())
  const rawPayload = maybeParseJson(input.payload)
  const payload = unwrapCampaignSesPayload(rawPayload)

  if (!payload) {
    return {
      success: false,
      skipped: true,
      eventType: null,
      normalizedEmail: null,
      providerMessageId: null,
      campaignId: null,
      recipientId: null,
      duplicateEvent: false,
      errorMessage: 'invalid_payload',
    }
  }

  const eventType = extractEventType(payload)
  if (!eventType || !SUPPORTED_EVENT_TYPES.has(eventType)) {
    return {
      success: true,
      skipped: true,
      eventType: eventType ?? null,
      normalizedEmail: null,
      providerMessageId: extractProviderMessageId(payload),
      campaignId: null,
      recipientId: null,
      duplicateEvent: false,
      errorMessage: null,
    }
  }

  const providerMessageId = extractProviderMessageId(payload)
  const rawEmail = extractRecipientEmail(payload)
  const normalizedEmail = rawEmail ? normalizeSignupEmail(rawEmail) : null
  if (!normalizedEmail) {
    return {
      success: false,
      skipped: true,
      eventType,
      normalizedEmail: null,
      providerMessageId,
      campaignId: null,
      recipientId: null,
      duplicateEvent: false,
      errorMessage: 'recipient_email_missing',
    }
  }

  const recipient = await resolveRecipient(db, providerMessageId, normalizedEmail)
  const campaignId = recipient?.campaign_id ?? null
  const recipientId = recipient?.id ?? null
  const occurredAt = extractOccurredAt(payload)

  const duplicateRes = await eventAlreadyProcessed(db, recipientId, providerMessageId, normalizedEmail, eventType)
  if (duplicateRes.error) {
    return {
      success: false,
      skipped: false,
      eventType,
      normalizedEmail,
      providerMessageId,
      campaignId,
      recipientId,
      duplicateEvent: false,
      errorMessage: duplicateRes.error.message,
    }
  }

  if (!duplicateRes.duplicateEvent) {
    const { error: insertError } = await db.from('email_events').insert({
      campaign_id: campaignId,
      recipient_id: recipientId,
      email: normalizedEmail,
      event_type: eventType,
      provider_message_id: providerMessageId,
      payload: rawPayload,
      occurred_at: occurredAt,
    })

    if (insertError) {
      return {
        success: false,
        skipped: false,
        eventType,
        normalizedEmail,
        providerMessageId,
        campaignId,
        recipientId,
        duplicateEvent: false,
        errorMessage: insertError.message,
      }
    }
  }

  if (recipient) {
    const recipientPatch = buildRecipientPatch(recipient, eventType, providerMessageId, occurredAt)
    const { error: recipientUpdateError } = await db
      .from('email_campaign_recipients')
      .update(recipientPatch)
      .eq('id', recipient.id)

    if (recipientUpdateError) {
      return {
        success: false,
        skipped: false,
        eventType,
        normalizedEmail,
        providerMessageId,
        campaignId,
        recipientId: recipient.id,
        duplicateEvent: duplicateRes.duplicateEvent,
        errorMessage: recipientUpdateError.message,
      }
    }
  }

  if (normalizedEmail && eventType === 'bounced' && isHardBounce(payload)) {
    const suppressionError = await writeSuppression(
      db,
      normalizedEmail,
      'bounce',
      'ses_campaign_event',
      getBounceSuppressionNotes(payload, providerMessageId),
    )

    if (suppressionError) {
      return {
        success: false,
        skipped: false,
        eventType,
        normalizedEmail,
        providerMessageId,
        campaignId,
        recipientId,
        duplicateEvent: duplicateRes.duplicateEvent,
        errorMessage: suppressionError,
      }
    }
  }

  if (normalizedEmail && eventType === 'complained') {
    const suppressionError = await writeSuppression(
      db,
      normalizedEmail,
      'complaint',
      'ses_campaign_event',
      getComplaintSuppressionNotes(payload, providerMessageId),
    )

    if (suppressionError) {
      return {
        success: false,
        skipped: false,
        eventType,
        normalizedEmail,
        providerMessageId,
        campaignId,
        recipientId,
        duplicateEvent: duplicateRes.duplicateEvent,
        errorMessage: suppressionError,
      }
    }
  }

  if (campaignId) {
    const counterUpdate = await refreshCampaignEventCounters(db, campaignId)
    if (counterUpdate.errorMessage) {
      return {
        success: false,
        skipped: false,
        eventType,
        normalizedEmail,
        providerMessageId,
        campaignId,
        recipientId,
        duplicateEvent: duplicateRes.duplicateEvent,
        errorMessage: counterUpdate.errorMessage,
      }
    }
  }

  return {
    success: true,
    skipped: false,
    eventType,
    normalizedEmail,
    providerMessageId,
    campaignId,
    recipientId,
    duplicateEvent: duplicateRes.duplicateEvent,
    errorMessage: null,
  }
}
