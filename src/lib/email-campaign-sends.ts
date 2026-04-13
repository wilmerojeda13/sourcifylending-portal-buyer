import { normalizeSignupEmail } from '@/lib/signup-security'
import { createServiceClient } from '@/lib/supabase/server'
import { validateCampaignSendAttempt } from '@/lib/campaign-send-gate'
import { sendCampaignEmail, sendTestEmail } from '@/lib/campaign-email-ses'

const STARTABLE_STATUSES = new Set(['scheduled', 'paused'])
const PROCESSABLE_STATUSES = new Set(['sending'])
const BATCH_STATUSES = ['pending', 'queued'] as const
const CLAIMED_STATUS = 'sending'
const SUCCESSFUL_SEND_STATUSES = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'] as const
const ACTIVE_SEND_STATUSES = ['pending', 'queued', 'sending'] as const

export interface CampaignSendTestInput {
  campaignId: string
  recipientEmail: string
}

export interface StartEmailCampaignSendInput {
  campaignId: string
}

export interface ProcessEmailCampaignSendBatchInput {
  campaignId: string
  limit: number
}

export interface CampaignSendServiceOptions {
  db?: any
  sesClient?: any
  env?: NodeJS.ProcessEnv
}

export interface EmailCampaignSendOutcome {
  success: boolean
  providerMessageId: string | null
  errorMessage: string | null
  reasons: string[]
}

export interface StartEmailCampaignSendResult {
  success: boolean
  campaign: CampaignSendCampaignRow | null
  errorMessage: string | null
}

export interface ProcessEmailCampaignSendBatchResult {
  success: boolean
  campaign: CampaignSendCampaignRow | null
  campaignId: string
  attempted: number
  processed: number
  sent: number
  blocked: number
  failed: number
  remaining: number
  errorMessage: string | null
}

export interface CampaignSendCampaignRow {
  id: string
  name: string
  subject: string
  html_body: string | null
  text_body: string | null
  from_email: string
  from_name: string | null
  status: string
  recipient_count: number
  sent_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  complained_count: number
  unsubscribed_count: number
  created_by: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
}

export interface CampaignSendRecipientRow {
  id: string
  campaign_id: string
  contact_id: string | null
  email: string
  first_name: string | null
  last_name: string | null
  send_status: string
  provider_message_id: string | null
  last_event_at: string | null
  created_at: string
  updated_at: string
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() || ''
}

function withCountSync(campaign: CampaignSendCampaignRow, recipientCount = campaign.recipient_count) {
  return {
    ...campaign,
    recipient_count: recipientCount,
    currentRecipientCount: recipientCount,
  }
}

async function loadCampaign(db: any, id: string) {
  const { data, error } = await db
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return { campaign: null, errorMessage: error.message as string }
  }

  if (!data) {
    return { campaign: null, errorMessage: 'campaign_not_found' }
  }

  return { campaign: data as CampaignSendCampaignRow, errorMessage: null }
}

async function updateCampaign(db: any, id: string, patch: Record<string, unknown>) {
  const { data, error } = await db
    .from('email_campaigns')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return { campaign: null as CampaignSendCampaignRow | null, errorMessage: error.message as string }
  }

  return { campaign: data as CampaignSendCampaignRow, errorMessage: null }
}

async function loadRecipientsForBatch(db: any, campaignId: string, limit: number) {
  const { data, error } = await db
    .from('email_campaign_recipients')
    .select('id, campaign_id, contact_id, email, first_name, last_name, send_status, provider_message_id, last_event_at, created_at, updated_at')
    .eq('campaign_id', campaignId)
    .in('send_status', BATCH_STATUSES)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    return { recipients: [] as CampaignSendRecipientRow[], errorMessage: error.message as string }
  }

  return { recipients: (data ?? []) as CampaignSendRecipientRow[], errorMessage: null }
}

async function claimRecipientsForBatch(db: any, campaignId: string, recipientIds: string[]) {
  if (recipientIds.length === 0) {
    return { recipients: [] as CampaignSendRecipientRow[], errorMessage: null as string | null }
  }

  const { data, error } = await db
    .from('email_campaign_recipients')
    .update({ send_status: CLAIMED_STATUS })
    .eq('campaign_id', campaignId)
    .in('id', recipientIds)
    .in('send_status', BATCH_STATUSES)
    .select('id, campaign_id, contact_id, email, first_name, last_name, send_status, provider_message_id, last_event_at, created_at, updated_at')

  if (error) {
    return { recipients: [] as CampaignSendRecipientRow[], errorMessage: error.message as string }
  }

  return { recipients: (data ?? []) as CampaignSendRecipientRow[], errorMessage: null }
}

async function countRecipientsByStatus(db: any, campaignId: string, statuses: readonly string[]) {
  const { count, error } = await db
    .from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('send_status', statuses)

  return {
    count: count ?? 0,
    errorMessage: error ? (error.message as string) : null,
  }
}

async function refreshCampaignSendSummary(db: any, campaign: CampaignSendCampaignRow) {
  const [totalRes, successfulRes, activeRes] = await Promise.all([
    countRecipientsByStatus(db, campaign.id, ['pending', 'queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'blocked_unsubscribed', 'blocked_suppressed']),
    countRecipientsByStatus(db, campaign.id, SUCCESSFUL_SEND_STATUSES),
    countRecipientsByStatus(db, campaign.id, ACTIVE_SEND_STATUSES),
  ])

  if (totalRes.errorMessage) {
    return { campaign: null as CampaignSendCampaignRow | null, errorMessage: totalRes.errorMessage }
  }

  if (successfulRes.errorMessage) {
    return { campaign: null as CampaignSendCampaignRow | null, errorMessage: successfulRes.errorMessage }
  }

  if (activeRes.errorMessage) {
    return { campaign: null as CampaignSendCampaignRow | null, errorMessage: activeRes.errorMessage }
  }

  const nextStatus = activeRes.count === 0
    ? (successfulRes.count > 0 ? 'sent' : 'failed')
    : 'sending'

  const { campaign: updatedCampaign, errorMessage } = await updateCampaign(db, campaign.id, {
    status: nextStatus,
    sent_count: successfulRes.count,
    recipient_count: totalRes.count,
  })

  return {
    campaign: updatedCampaign,
    errorMessage,
    remainingCount: activeRes.count,
  }
}

function pickBlockedStatus(reasons: string[]) {
  if (reasons.includes('recipient_unsubscribed')) return 'blocked_unsubscribed'
  if (reasons.includes('recipient_suppressed')) return 'blocked_suppressed'
  return 'failed'
}

export async function sendEmailCampaignTest(
  input: CampaignSendTestInput,
  options: CampaignSendServiceOptions = {},
): Promise<EmailCampaignSendOutcome> {
  const db = options.db ?? (await createServiceClient())
  const campaignId = input.campaignId?.trim()
  const recipientEmail = normalizeSignupEmail(input.recipientEmail)

  if (!campaignId) {
    return { success: false, providerMessageId: null, errorMessage: 'campaign_id_missing', reasons: [] }
  }

  const campaignRes = await loadCampaign(db, campaignId)
  if (campaignRes.errorMessage || !campaignRes.campaign) {
    return { success: false, providerMessageId: null, errorMessage: campaignRes.errorMessage, reasons: [] }
  }

  if (!['draft', 'paused'].includes(campaignRes.campaign.status)) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'campaign_not_testable',
      reasons: [],
    }
  }

  const gateResult = await validateCampaignSendAttempt(
    {
      campaignId,
      recipientEmail,
      fromEmail: campaignRes.campaign.from_email,
      subject: campaignRes.campaign.subject,
      htmlBody: campaignRes.campaign.html_body ?? '',
      textBody: campaignRes.campaign.text_body ?? '',
      sendMode: 'test',
    },
    { db },
  )

  if (!gateResult.allowed) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'campaign_send_blocked',
      reasons: gateResult.reasons,
    }
  }

  const result = await sendTestEmail(
    {
      recipientEmail,
      subject: campaignRes.campaign.subject,
      htmlBody: campaignRes.campaign.html_body,
      textBody: campaignRes.campaign.text_body,
      fromEmail: campaignRes.campaign.from_email,
      fromName: campaignRes.campaign.from_name,
      configurationSetName: null,
    },
    { env: options.env, client: options.sesClient },
  )

  return {
    success: result.success,
    providerMessageId: result.providerMessageId,
    errorMessage: result.errorMessage,
    reasons: gateResult.reasons,
  }
}

export async function startEmailCampaignSend(
  input: StartEmailCampaignSendInput,
  options: CampaignSendServiceOptions = {},
): Promise<StartEmailCampaignSendResult> {
  const db = options.db ?? (await createServiceClient())
  const campaignId = input.campaignId?.trim()

  if (!campaignId) {
    return { success: false, campaign: null, errorMessage: 'campaign_id_missing' }
  }

  const campaignRes = await loadCampaign(db, campaignId)
  if (campaignRes.errorMessage || !campaignRes.campaign) {
    return { success: false, campaign: null, errorMessage: campaignRes.errorMessage }
  }

  if (!STARTABLE_STATUSES.has(campaignRes.campaign.status)) {
    return { success: false, campaign: withCountSync(campaignRes.campaign), errorMessage: 'campaign_not_startable' }
  }

  const updated = await updateCampaign(db, campaignId, { status: 'sending' })
  if (updated.errorMessage || !updated.campaign) {
    return { success: false, campaign: null, errorMessage: updated.errorMessage }
  }

  return {
    success: true,
    campaign: withCountSync(updated.campaign),
    errorMessage: null,
  }
}

export async function processEmailCampaignSendBatch(
  input: ProcessEmailCampaignSendBatchInput,
  options: CampaignSendServiceOptions = {},
): Promise<ProcessEmailCampaignSendBatchResult> {
  const db = options.db ?? (await createServiceClient())
  const campaignId = input.campaignId?.trim()
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(Math.floor(input.limit), 50)) : 25

  if (!campaignId) {
    return {
      success: false,
      campaign: null,
      campaignId: '',
      attempted: 0,
      processed: 0,
      sent: 0,
      blocked: 0,
      failed: 0,
      remaining: 0,
      errorMessage: 'campaign_id_missing',
    }
  }

  const campaignRes = await loadCampaign(db, campaignId)
  if (campaignRes.errorMessage || !campaignRes.campaign) {
    return {
      success: false,
      campaign: null,
      campaignId,
      attempted: 0,
      processed: 0,
      sent: 0,
      blocked: 0,
      failed: 0,
      remaining: 0,
      errorMessage: campaignRes.errorMessage,
    }
  }

  if (!PROCESSABLE_STATUSES.has(campaignRes.campaign.status)) {
    return {
      success: false,
      campaign: withCountSync(campaignRes.campaign),
      campaignId,
      attempted: 0,
      processed: 0,
      sent: 0,
      blocked: 0,
      failed: 0,
      remaining: 0,
      errorMessage: 'campaign_not_sending',
    }
  }

  const batchRes = await loadRecipientsForBatch(db, campaignId, limit)
  if (batchRes.errorMessage) {
    return {
      success: false,
      campaign: withCountSync(campaignRes.campaign),
      campaignId,
      attempted: 0,
      processed: 0,
      sent: 0,
      blocked: 0,
      failed: 0,
      remaining: 0,
      errorMessage: batchRes.errorMessage,
    }
  }

  const claimedRes = await claimRecipientsForBatch(
    db,
    campaignId,
    batchRes.recipients.map((recipient) => recipient.id),
  )

  if (claimedRes.errorMessage) {
    return {
      success: false,
      campaign: withCountSync(campaignRes.campaign),
      campaignId,
      attempted: batchRes.recipients.length,
      processed: 0,
      sent: 0,
      blocked: 0,
      failed: 0,
      remaining: batchRes.recipients.length,
      errorMessage: claimedRes.errorMessage,
    }
  }

  const recipients = claimedRes.recipients
  if (recipients.length === 0) {
    const summary = await refreshCampaignSendSummary(db, campaignRes.campaign)

    return {
      success: !summary.errorMessage,
      campaign: summary.campaign ? withCountSync(summary.campaign, summary.campaign.recipient_count) : withCountSync(campaignRes.campaign),
      campaignId,
      attempted: 0,
      processed: 0,
      sent: 0,
      blocked: 0,
      failed: 0,
      remaining: summary.remainingCount ?? 0,
      errorMessage: summary.errorMessage,
    }
  }

  const now = new Date().toISOString()
  if (!campaignRes.campaign.sent_at) {
    const sentAtPatch = await updateCampaign(db, campaignId, { sent_at: now })
    if (sentAtPatch.errorMessage || !sentAtPatch.campaign) {
      return {
        success: false,
        campaign: null,
        campaignId,
        attempted: recipients.length,
        processed: 0,
        sent: 0,
        blocked: 0,
        failed: 0,
        remaining: recipients.length,
        errorMessage: sentAtPatch.errorMessage,
      }
    }
    campaignRes.campaign = sentAtPatch.campaign
  }

  let processed = 0
  let sent = 0
  let blocked = 0
  let failed = 0

  for (const recipient of recipients) {
    const gateResult = await validateCampaignSendAttempt(
      {
        campaignId,
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        fromEmail: campaignRes.campaign.from_email,
        subject: campaignRes.campaign.subject,
        htmlBody: campaignRes.campaign.html_body ?? '',
        textBody: campaignRes.campaign.text_body ?? '',
        sendMode: 'campaign',
      },
      { db },
    )

    processed += 1

    if (!gateResult.allowed) {
      blocked += 1
      const blockedStatus = pickBlockedStatus(gateResult.reasons)
      const { error } = await db
        .from('email_campaign_recipients')
        .update({
          send_status: blockedStatus,
          last_event_at: now,
        })
        .eq('id', recipient.id)

      if (error) {
        return {
          success: false,
          campaign: withCountSync(campaignRes.campaign),
          campaignId,
          attempted: recipients.length,
          processed,
          sent,
          blocked,
          failed,
          remaining: recipients.length - processed,
          errorMessage: error.message,
        }
      }

      continue
    }

    const sendResult = await sendCampaignEmail(
      {
        recipientEmail: normalizeSignupEmail(recipient.email),
        subject: campaignRes.campaign.subject,
        htmlBody: campaignRes.campaign.html_body,
        textBody: campaignRes.campaign.text_body,
        fromEmail: campaignRes.campaign.from_email,
        fromName: campaignRes.campaign.from_name,
        configurationSetName: null,
      },
      { env: options.env, client: options.sesClient },
    )

    const nextStatus = sendResult.success ? 'sent' : 'failed'
    if (sendResult.success) {
      sent += 1
    } else {
      failed += 1
    }

    const { error } = await db
      .from('email_campaign_recipients')
      .update({
        send_status: nextStatus,
        provider_message_id: sendResult.providerMessageId,
        last_event_at: now,
      })
      .eq('id', recipient.id)

    if (error) {
      return {
        success: false,
        campaign: withCountSync(campaignRes.campaign),
        campaignId,
        attempted: recipients.length,
        processed,
        sent,
        blocked,
        failed,
        remaining: recipients.length - processed,
        errorMessage: error.message,
      }
    }
  }

  const summary = await refreshCampaignSendSummary(db, campaignRes.campaign)

  return {
    success: !summary.errorMessage,
    campaign: summary.campaign ? withCountSync(summary.campaign, summary.campaign.recipient_count) : withCountSync(campaignRes.campaign),
    campaignId,
    attempted: recipients.length,
    processed,
    sent,
    blocked,
    failed,
    remaining: summary.remainingCount ?? 0,
    errorMessage: summary.errorMessage,
  }
}
