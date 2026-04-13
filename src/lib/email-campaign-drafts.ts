import { normalizeSignupEmail } from '@/lib/signup-security'
import { createServiceClient } from '@/lib/supabase/server'

const EMAIL_ALLOWED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EDITABLE_CAMPAIGN_STATUSES = new Set(['draft', 'paused'])

export interface EmailCampaignDraftInput {
  name: string
  subject: string
  html_body?: string | null
  text_body?: string | null
  from_email: string
  from_name?: string | null
  created_by: string
}

export interface EmailCampaignDraftUpdateInput {
  id: string
  name?: string | null
  subject?: string | null
  html_body?: string | null
  text_body?: string | null
  from_email?: string | null
  from_name?: string | null
}

export interface AttachCampaignRecipientsInput {
  campaign_id: string
  recipients: Array<{
    contact_id?: string | null
    email: string
    first_name?: string | null
    last_name?: string | null
  }>
}

export interface EmailCampaignDraftRow {
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

export interface EmailCampaignDraftWithCount extends EmailCampaignDraftRow {
  currentRecipientCount: number
}

export interface EmailCampaignDraftResult {
  success: boolean
  campaign: EmailCampaignDraftWithCount | null
  errorMessage: string | null
}

export interface AttachCampaignRecipientsResult {
  success: boolean
  campaign: EmailCampaignDraftWithCount | null
  campaign_id: string
  attempted: number
  inserted: number
  skipped_duplicates: number
  skipped_invalid: number
  recipient_count: number | null
  errorMessage: string | null
}

export interface CampaignDraftServiceOptions {
  db?: any
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeRequiredText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function isValidEmail(value: string) {
  return EMAIL_ALLOWED.test(value)
}

function isUniqueViolation(error: any) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
  return error?.code === '23505' || message.includes('duplicate') || message.includes('unique')
}

function withCurrentRecipientCount(campaign: EmailCampaignDraftRow): EmailCampaignDraftWithCount {
  return {
    ...campaign,
    currentRecipientCount: campaign.recipient_count,
  }
}

function toInsertRecipient(recipient: AttachCampaignRecipientsInput['recipients'][number], campaignId: string) {
  return {
    campaign_id: campaignId,
    contact_id: recipient.contact_id?.trim() || null,
    email: normalizeSignupEmail(recipient.email),
    first_name: normalizeText(recipient.first_name),
    last_name: normalizeText(recipient.last_name),
    send_status: 'pending',
  }
}

async function getEditableCampaign(db: any, id: string) {
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

  if (!EDITABLE_CAMPAIGN_STATUSES.has(data.status)) {
    return { campaign: data as EmailCampaignDraftRow, errorMessage: 'campaign_not_editable' }
  }

  return { campaign: data as EmailCampaignDraftRow, errorMessage: null }
}

function buildCreatePayload(input: EmailCampaignDraftInput) {
  const name = normalizeRequiredText(input.name)
  const subject = normalizeRequiredText(input.subject)
  const fromEmail = normalizeRequiredText(input.from_email)
  const fromName = normalizeText(input.from_name)

  if (!name) return { errorMessage: 'name_missing' }
  if (!subject) return { errorMessage: 'subject_missing' }
  if (!fromEmail) return { errorMessage: 'from_email_missing' }
  if (!isValidEmail(normalizeSignupEmail(fromEmail))) return { errorMessage: 'from_email_invalid' }
  if (!input.created_by?.trim()) return { errorMessage: 'created_by_missing' }

  return {
    payload: {
      name,
      subject,
      html_body: normalizeText(input.html_body),
      text_body: normalizeText(input.text_body),
      from_email: normalizeSignupEmail(fromEmail),
      from_name: fromName,
      created_by: input.created_by.trim(),
      status: 'draft',
    },
    errorMessage: null,
  }
}

function buildUpdatePayload(input: EmailCampaignDraftUpdateInput) {
  const update: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const value = normalizeRequiredText(input.name)
    if (!value) return { errorMessage: 'name_missing' }
    update.name = value
  }

  if (input.subject !== undefined) {
    const value = normalizeRequiredText(input.subject)
    if (!value) return { errorMessage: 'subject_missing' }
    update.subject = value
  }

  if (input.html_body !== undefined) {
    update.html_body = normalizeText(input.html_body)
  }

  if (input.text_body !== undefined) {
    update.text_body = normalizeText(input.text_body)
  }

  if (input.from_email !== undefined) {
    const value = normalizeRequiredText(input.from_email)
    if (!value) return { errorMessage: 'from_email_missing' }
    if (!isValidEmail(normalizeSignupEmail(value))) return { errorMessage: 'from_email_invalid' }
    update.from_email = normalizeSignupEmail(value)
  }

  if (input.from_name !== undefined) {
    update.from_name = normalizeText(input.from_name)
  }

  if (Object.keys(update).length === 0) {
    return { errorMessage: 'no_update_fields' }
  }

  return { payload: update, errorMessage: null }
}

function buildRecipientEmailSet(rows: Array<{ email: string }>) {
  return new Set(rows.map((row) => normalizeSignupEmail(row.email)))
}

async function countCampaignRecipients(db: any, campaignId: string) {
  const { count, error } = await db
    .from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  return {
    count: count ?? 0,
    errorMessage: error ? (error.message as string) : null,
  }
}

async function insertRecipientsWithRetry(db: any, campaignId: string, recordsToInsert: Array<Record<string, unknown>>) {
  if (recordsToInsert.length === 0) {
    return { inserted: 0, errorMessage: null as string | null }
  }

  const attemptInsert = async (records: Array<Record<string, unknown>>) => {
    const { error } = await db
      .from('email_campaign_recipients')
      .insert(records)

    return error ?? null
  }

  let error = await attemptInsert(recordsToInsert)
  if (!error) {
    return { inserted: recordsToInsert.length, errorMessage: null }
  }

  if (!isUniqueViolation(error)) {
    return { inserted: 0, errorMessage: error.message as string }
  }

  const existingRecipientsRes = await db
    .from('email_campaign_recipients')
    .select('email')
    .eq('campaign_id', campaignId)

  if (existingRecipientsRes.error) {
    return { inserted: 0, errorMessage: existingRecipientsRes.error.message as string }
  }

  const existingEmails = buildRecipientEmailSet((existingRecipientsRes.data ?? []) as Array<{ email: string }>)
  const retryRecords = recordsToInsert.filter((record) => {
    const email = typeof record.email === 'string' ? normalizeSignupEmail(record.email) : ''
    return email && !existingEmails.has(email)
  })

  if (retryRecords.length === 0) {
    return { inserted: 0, errorMessage: null }
  }

  error = await attemptInsert(retryRecords)
  if (error) {
    return { inserted: 0, errorMessage: error.message as string }
  }

  return { inserted: retryRecords.length, errorMessage: null }
}

export async function createEmailCampaignDraft(
  input: EmailCampaignDraftInput,
  options: CampaignDraftServiceOptions = {},
): Promise<EmailCampaignDraftResult> {
  const db = options.db ?? (await createServiceClient())
  const prepared = buildCreatePayload(input)

  if (prepared.errorMessage) {
    return { success: false, campaign: null, errorMessage: prepared.errorMessage }
  }

  const { data, error } = await db
    .from('email_campaigns')
    .insert(prepared.payload)
    .select('*')
    .single()

  if (error) {
    return { success: false, campaign: null, errorMessage: error.message }
  }

  return {
    success: true,
    campaign: withCurrentRecipientCount(data as EmailCampaignDraftRow),
    errorMessage: null,
  }
}

export async function updateEmailCampaignDraft(
  input: EmailCampaignDraftUpdateInput,
  options: CampaignDraftServiceOptions = {},
): Promise<EmailCampaignDraftResult> {
  const db = options.db ?? (await createServiceClient())

  if (!input.id?.trim()) {
    return { success: false, campaign: null, errorMessage: 'id_missing' }
  }

  const campaignLookup = await getEditableCampaign(db, input.id.trim())
  if (campaignLookup.errorMessage) {
    return { success: false, campaign: campaignLookup.campaign ? withCurrentRecipientCount(campaignLookup.campaign) : null, errorMessage: campaignLookup.errorMessage }
  }

  const prepared = buildUpdatePayload(input)
  if (prepared.errorMessage) {
    return { success: false, campaign: campaignLookup.campaign ? withCurrentRecipientCount(campaignLookup.campaign) : null, errorMessage: prepared.errorMessage }
  }

  const { data, error } = await db
    .from('email_campaigns')
    .update(prepared.payload)
    .eq('id', input.id.trim())
    .select('*')
    .single()

  if (error) {
    return { success: false, campaign: null, errorMessage: error.message }
  }

  return {
    success: true,
    campaign: withCurrentRecipientCount(data as EmailCampaignDraftRow),
    errorMessage: null,
  }
}

export async function getEmailCampaignDraft(
  input: { id: string },
  options: CampaignDraftServiceOptions = {},
): Promise<EmailCampaignDraftResult> {
  const db = options.db ?? (await createServiceClient())

  if (!input.id?.trim()) {
    return { success: false, campaign: null, errorMessage: 'id_missing' }
  }

  const { data, error } = await db
    .from('email_campaigns')
    .select('*')
    .eq('id', input.id.trim())
    .maybeSingle()

  if (error) {
    return { success: false, campaign: null, errorMessage: error.message }
  }

  if (!data) {
    return { success: false, campaign: null, errorMessage: 'campaign_not_found' }
  }

  return {
    success: true,
    campaign: withCurrentRecipientCount(data as EmailCampaignDraftRow),
    errorMessage: null,
  }
}

export async function attachRecipientsToCampaign(
  input: AttachCampaignRecipientsInput,
  options: CampaignDraftServiceOptions = {},
): Promise<AttachCampaignRecipientsResult> {
  const db = options.db ?? (await createServiceClient())
  const recipients = Array.isArray(input.recipients) ? input.recipients : []

  if (!input.campaign_id?.trim()) {
    return {
      success: false,
      campaign: null,
      campaign_id: '',
      attempted: recipients.length,
      inserted: 0,
      skipped_duplicates: 0,
      skipped_invalid: 0,
      recipient_count: null,
      errorMessage: 'campaign_id_missing',
    }
  }

  const campaignLookup = await getEditableCampaign(db, input.campaign_id.trim())
  if (campaignLookup.errorMessage || !campaignLookup.campaign) {
    return {
      success: false,
      campaign: campaignLookup.campaign ? withCurrentRecipientCount(campaignLookup.campaign) : null,
      campaign_id: input.campaign_id.trim(),
      attempted: recipients.length,
      inserted: 0,
      skipped_duplicates: 0,
      skipped_invalid: 0,
      recipient_count: campaignLookup.campaign ? campaignLookup.campaign.recipient_count : null,
      errorMessage: campaignLookup.errorMessage ?? 'campaign_not_found',
    }
  }

  if (recipients.length === 0) {
    return {
      success: true,
      campaign: withCurrentRecipientCount(campaignLookup.campaign),
      campaign_id: input.campaign_id.trim(),
      attempted: 0,
      inserted: 0,
      skipped_duplicates: 0,
      skipped_invalid: 0,
      recipient_count: campaignLookup.campaign.recipient_count,
      errorMessage: null,
    }
  }

  const existingRecipientsRes = await db
    .from('email_campaign_recipients')
    .select('email')
    .eq('campaign_id', input.campaign_id.trim())

  if (existingRecipientsRes.error) {
    return {
      success: false,
      campaign: withCurrentRecipientCount(campaignLookup.campaign),
      campaign_id: input.campaign_id.trim(),
      attempted: input.recipients.length,
      inserted: 0,
      skipped_duplicates: 0,
      skipped_invalid: 0,
      recipient_count: campaignLookup.campaign.recipient_count,
      errorMessage: existingRecipientsRes.error.message,
    }
  }

  const existingRows = (existingRecipientsRes.data ?? []) as Array<{ email: string }>
  const existingEmails = buildRecipientEmailSet(existingRows)
  const seenEmails = new Set<string>()
  const recordsToInsert: Array<Record<string, unknown>> = []

  let skippedInvalid = 0
  let skippedDuplicates = 0

  for (const recipient of recipients) {
    const normalizedEmail = normalizeSignupEmail(recipient.email)

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      skippedInvalid += 1
      continue
    }

    if (seenEmails.has(normalizedEmail) || existingEmails.has(normalizedEmail)) {
      skippedDuplicates += 1
      continue
    }

    seenEmails.add(normalizedEmail)
    recordsToInsert.push(toInsertRecipient(recipient, input.campaign_id.trim()))
  }

  const insertRes = await insertRecipientsWithRetry(db, input.campaign_id.trim(), recordsToInsert)
  if (insertRes.errorMessage) {
    return {
      success: false,
      campaign: withCurrentRecipientCount(campaignLookup.campaign),
      campaign_id: input.campaign_id.trim(),
      attempted: recipients.length,
      inserted: 0,
      skipped_duplicates: skippedDuplicates,
      skipped_invalid: skippedInvalid,
      recipient_count: campaignLookup.campaign.recipient_count,
      errorMessage: insertRes.errorMessage,
    }
  }

  const inserted = insertRes.inserted
  const recipientCountRes = await countCampaignRecipients(db, input.campaign_id.trim())
  if (recipientCountRes.errorMessage) {
    return {
      success: false,
      campaign: withCurrentRecipientCount(campaignLookup.campaign),
      campaign_id: input.campaign_id.trim(),
      attempted: recipients.length,
      inserted,
      skipped_duplicates: skippedDuplicates,
      skipped_invalid: skippedInvalid,
      recipient_count: campaignLookup.campaign.recipient_count,
      errorMessage: recipientCountRes.errorMessage,
    }
  }

  const recipientCount = recipientCountRes.count
  const { error: updateError } = await db
    .from('email_campaigns')
    .update({ recipient_count: recipientCount })
    .eq('id', input.campaign_id.trim())

  if (updateError) {
    return {
      success: false,
      campaign: withCurrentRecipientCount({
        ...campaignLookup.campaign,
        recipient_count: recipientCount,
      }),
      campaign_id: input.campaign_id.trim(),
      attempted: recipients.length,
      inserted,
      skipped_duplicates: skippedDuplicates,
      skipped_invalid: skippedInvalid,
      recipient_count: recipientCount,
      errorMessage: updateError.message,
    }
  }

  return {
    success: true,
    campaign: withCurrentRecipientCount({
      ...campaignLookup.campaign,
      recipient_count: recipientCount,
    }),
    campaign_id: input.campaign_id.trim(),
    attempted: recipients.length,
    inserted,
    skipped_duplicates: skippedDuplicates,
    skipped_invalid: skippedInvalid,
    recipient_count: recipientCount,
    errorMessage: null,
  }
}
