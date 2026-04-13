import { normalizeSignupEmail } from '@/lib/signup-security'
import { createServiceClient } from '@/lib/supabase/server'

const EMAIL_ALLOWED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CAMPAIGN_SEND_STATUSES = new Set(['scheduled', 'sending'])
const TEST_SEND_STATUSES = new Set(['draft', 'paused'])

export type CampaignSendMode = 'test' | 'campaign'

export interface CampaignSendEligibilityInput {
  campaignId: string
  recipientEmail: string
  recipientId?: string
  fromEmail: string
  subject: string
  htmlBody: string
  textBody: string
  sendMode?: CampaignSendMode
}

export interface CampaignSendEligibilityResult {
  allowed: boolean
  normalizedEmail: string
  reasons: string[]
}

export interface CampaignSendGateOptions {
  db?: any
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() || ''
}

function isUsableEmail(email: string) {
  return EMAIL_ALLOWED.test(email)
}

function hasUnsubscribeLink(htmlBody: string) {
  return /<a\b[^>]*href\s*=\s*["'][^"']*unsubscribe[^"']*["'][^>]*>/i.test(htmlBody) ||
    /\{\{\s*unsubscribe(?:_url)?\s*\}\}/i.test(htmlBody) ||
    /\[\[\s*unsubscribe(?:_url)?\s*\]\]/i.test(htmlBody)
}

function getUtcDayWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

async function maybeSingle(query: any) {
  const { data, error } = await query.maybeSingle()
  return { data, error }
}

async function countRows(query: any) {
  const { count, error } = await query
  return { count: count ?? 0, error }
}

function appendDbError(reasons: string[], stage: string, error: unknown) {
  const suffix = error instanceof Error && error.message ? `: ${error.message}` : ''
  reasons.push(`${stage}_lookup_failed${suffix}`)
}

function campaignStatusAllowed(status: string | null | undefined, sendMode: CampaignSendMode) {
  if (!status) return false
  return sendMode === 'test'
    ? TEST_SEND_STATUSES.has(status)
    : CAMPAIGN_SEND_STATUSES.has(status)
}

export async function validateCampaignSendAttempt(
  input: CampaignSendEligibilityInput,
  options: CampaignSendGateOptions = {},
): Promise<CampaignSendEligibilityResult> {
  const reasons: string[] = []
  const normalizedEmail = normalizeSignupEmail(input.recipientEmail)
  const fromEmail = normalizeText(input.fromEmail)
  const subject = normalizeText(input.subject)
  const htmlBody = normalizeText(input.htmlBody)
  const textBody = normalizeText(input.textBody)
  const sendMode: CampaignSendMode = input.sendMode ?? 'campaign'

  if (!normalizedEmail) {
    reasons.push('recipient_email_missing')
  } else if (!isUsableEmail(normalizedEmail)) {
    reasons.push('recipient_email_invalid')
  }

  if (!fromEmail) {
    reasons.push('from_email_missing')
  } else if (!isUsableEmail(normalizeSignupEmail(fromEmail))) {
    reasons.push('from_email_invalid')
  }

  if (!subject) reasons.push('subject_missing')
  if (!htmlBody) reasons.push('html_body_missing')
  if (!textBody) reasons.push('text_body_missing')
  if (htmlBody && !hasUnsubscribeLink(htmlBody)) {
    reasons.push('unsubscribe_link_missing')
  }

  if (!input.campaignId?.trim()) {
    reasons.push('campaign_id_missing')
  }

  const db = options.db ?? (await createServiceClient())

  let campaignStatus: string | null = null
  let campaignSentCount: number | null = null
  let sendSettings: {
    sending_enabled: boolean | null
    daily_send_cap: number | null
    per_campaign_send_cap: number | null
  } | null = null

  if (input.campaignId?.trim()) {
    const campaignRes = await maybeSingle(
      db
        .from('email_campaigns')
        .select('id, status, sent_count')
        .eq('id', input.campaignId.trim()),
    )

    if (campaignRes.error) {
      appendDbError(reasons, 'email_campaigns', campaignRes.error)
    } else if (!campaignRes.data) {
      reasons.push('campaign_not_found')
    } else {
      campaignStatus = campaignRes.data.status ?? null
      campaignSentCount = Number.isFinite(Number(campaignRes.data.sent_count))
        ? Number(campaignRes.data.sent_count)
        : 0
    }
  }

  const settingsRes = await maybeSingle(
    db
      .from('email_send_settings')
      .select('sending_enabled, daily_send_cap, per_campaign_send_cap')
      .eq('settings_key', 'default'),
  )

  if (settingsRes.error) {
    appendDbError(reasons, 'email_send_settings', settingsRes.error)
  } else if (!settingsRes.data) {
    reasons.push('send_settings_missing')
  } else {
    sendSettings = {
      sending_enabled: settingsRes.data.sending_enabled ?? null,
      daily_send_cap: Number.isFinite(Number(settingsRes.data.daily_send_cap))
        ? Number(settingsRes.data.daily_send_cap)
        : null,
      per_campaign_send_cap: Number.isFinite(Number(settingsRes.data.per_campaign_send_cap))
        ? Number(settingsRes.data.per_campaign_send_cap)
        : null,
    }
  }

  if (normalizedEmail && isUsableEmail(normalizedEmail)) {
    const unsubscribeRes = await maybeSingle(
      db
        .from('email_unsubscribes')
        .select('id')
        .ilike('email', normalizedEmail),
    )

    if (unsubscribeRes.error) {
      appendDbError(reasons, 'email_unsubscribes', unsubscribeRes.error)
    } else if (unsubscribeRes.data) {
      reasons.push('recipient_unsubscribed')
    }

    const suppressionRes = await maybeSingle(
      db
        .from('email_suppressions')
        .select('id')
        .ilike('email', normalizedEmail),
    )

    if (suppressionRes.error) {
      appendDbError(reasons, 'email_suppressions', suppressionRes.error)
    } else if (suppressionRes.data) {
      reasons.push('recipient_suppressed')
    }

    const duplicateRes = await maybeSingle(
      input.recipientId?.trim()
        ? db
            .from('email_campaign_recipients')
            .select('id, send_status')
            .eq('campaign_id', input.campaignId?.trim() || '')
            .ilike('email', normalizedEmail)
            .neq('id', input.recipientId.trim())
        : db
            .from('email_campaign_recipients')
            .select('id, send_status')
            .eq('campaign_id', input.campaignId?.trim() || '')
            .ilike('email', normalizedEmail),
    )

    if (duplicateRes.error) {
      appendDbError(reasons, 'email_campaign_recipients', duplicateRes.error)
    } else if (duplicateRes.data && duplicateRes.data.send_status !== 'failed') {
      reasons.push('duplicate_campaign_recipient')
    }
  }

  if (sendSettings) {
    if (sendSettings.sending_enabled !== true) {
      reasons.push('sending_disabled')
    }

    if (campaignStatus && !campaignStatusAllowed(campaignStatus, sendMode)) {
      reasons.push(sendMode === 'test' ? 'campaign_status_not_testable' : 'campaign_status_not_eligible')
    }

    if (sendMode === 'campaign' && sendSettings.per_campaign_send_cap !== null && campaignSentCount !== null) {
      if (campaignSentCount >= sendSettings.per_campaign_send_cap) {
        reasons.push('per_campaign_send_cap_exceeded')
      }
    }

    if (sendSettings.daily_send_cap !== null) {
      const { start, end } = getUtcDayWindow()
      const dailyCountRes = await countRows(
        db
          .from('email_campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', start)
          .lt('created_at', end)
          .neq('send_status', 'blocked_unsubscribed')
          .neq('send_status', 'blocked_suppressed'),
      )

      if (dailyCountRes.error) {
        appendDbError(reasons, 'email_campaign_recipients_daily_count', dailyCountRes.error)
      } else if (dailyCountRes.count >= sendSettings.daily_send_cap) {
        reasons.push('daily_send_cap_exceeded')
      }
    }
  }

  return {
    allowed: reasons.length === 0,
    normalizedEmail,
    reasons,
  }
}
