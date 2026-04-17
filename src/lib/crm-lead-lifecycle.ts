import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnalyzerInput, AnalyzerResult } from '@/types'
import { inferLeadPhoneIntelligence } from '@/lib/crm-call-compliance'
import { createCrmLeadActivity, getAppUrl } from '@/lib/crm-invites'
import { logPortalEvent } from '@/lib/portal-events'
import { formatComplianceSnapshotLines, type ComplianceSnapshot } from '@/lib/public-form-compliance'

type JsonRecord = Record<string, unknown>

type CrmLeadRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  phone_e164?: string | null
  business_name: string | null
  source: string | null
  stage: string | null
  notes: string | null
  lead_temperature?: 'cold' | 'warm' | 'hot' | null
  assigned_to_user_id?: string | null
  assigned_to_name?: string | null
  analyzer_submitted?: boolean | null
  analyzer_submitted_at?: string | null
  account_created?: boolean | null
  account_created_at?: string | null
  readiness_score?: number | null
  readiness_status?: string | null
  assigned_program?: string | null
  estimated_funding_range?: string | null
  risk_flags?: string[] | null
  analyzer_summary?: string | null
  analyzer_answers?: JsonRecord | null
  analyzer_score_breakdown?: JsonRecord | null
  analyzer_result_payload?: JsonRecord | null
  duplicate_review_required?: boolean | null
  duplicate_review_reason?: string | null
  updated_at?: string | null
  created_at?: string | null
}

type LeadMatchResult = {
  primary: CrmLeadRow | null
  emailMatches: CrmLeadRow[]
  phoneMatches: CrmLeadRow[]
  duplicateRisk: boolean
  duplicateReason: string | null
}

type NotificationKind = 'analyzer_submitted' | 'account_created_after_analyzer'

export type AnalyzerLifecycleResult = {
  leadId: string
  action: 'created' | 'updated'
  duplicateRisk: boolean
  taskCreated: boolean
  notificationSent: boolean
}

export type SignupLifecycleResult = {
  leadId: string
  action: 'created' | 'updated'
  duplicateRisk: boolean
  mergedWithAnalyzer: boolean
  notificationSent: boolean
}

type AnalyzerLeadRecord = {
  id: string
  email: string
  phone: string | null
  business_name: string | null
  full_name: string
  assigned_program?: string | null
  readiness_status?: string | null
  readiness_score?: number | null
  estimated_funding_range?: string | null
  risk_flags?: string[] | null
  analyzer_answers?: JsonRecord | null
  summary?: string | null
  score_breakdown?: JsonRecord | null
  raw_result_payload?: JsonRecord | null
  submitted_at?: string | null
}

type NotificationRecipient = {
  email: string
  name: string | null
}

const ANALYZER_SOURCE = 'free_business_analyzer'
const ANALYZER_TASK_TYPE = 'Analyzer Follow-Up'
const ANALYZER_PRIORITY_THRESHOLD = 70
const CRM_LEAD_SELECT = [
  'id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'phone_e164',
  'business_name',
  'source',
  'stage',
  'notes',
  'lead_temperature',
  'assigned_to_user_id',
  'assigned_to_name',
  'analyzer_submitted',
  'analyzer_submitted_at',
  'account_created',
  'account_created_at',
  'readiness_score',
  'readiness_status',
  'assigned_program',
  'estimated_funding_range',
  'risk_flags',
  'analyzer_summary',
  'analyzer_answers',
  'analyzer_score_breakdown',
  'analyzer_result_payload',
  'duplicate_review_required',
  'duplicate_review_reason',
  'updated_at',
  'created_at',
].join(', ')

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? (fullName.trim() || 'Unknown'),
    lastName: parts.slice(1).join(' '),
  }
}

export function normalizeLeadEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? ''
}

export function normalizeLeadPhone(phone: string | null | undefined) {
  const digits = `${phone ?? ''}`.replace(/\D+/g, '')
  if (!digits) return null
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (`${phone ?? ''}`.trim().startsWith('+')) return `${phone}`.trim()
  return digits
}

async function safeInferPhoneIntelligence(phone: string | null | undefined) {
  if (!phone) return null
  try {
    return await inferLeadPhoneIntelligence(phone)
  } catch (error) {
    console.error('[crm-lead-lifecycle] phone intelligence fallback triggered', error)
    const normalized = normalizeLeadPhone(phone)
    return {
      phone_e164: normalized,
      likely_timezone: null,
      timezone_confidence: 'unknown',
      timezone_source: 'unknown_invalid',
      last_timezone_checked_at: new Date().toISOString(),
    }
  }
}

function deriveLeadTemperature(score: number | null | undefined): 'cold' | 'warm' | 'hot' {
  if ((score ?? 0) >= 70) return 'hot'
  if ((score ?? 0) >= 45) return 'warm'
  return 'cold'
}

function mergeLeadTemperature(
  current: 'cold' | 'warm' | 'hot' | null | undefined,
  next: 'cold' | 'warm' | 'hot',
): 'cold' | 'warm' | 'hot' {
  const rank = { cold: 0, warm: 1, hot: 2 } as const
  const currentValue = current ?? 'cold'
  return rank[next] > rank[currentValue] ? next : currentValue
}

export function buildAnalyzerScoreBreakdown(result: AnalyzerResult): JsonRecord {
  return {
    readiness_score: result.readiness_score,
    readiness_status: result.readiness_status,
    estimated_funding_range: result.estimated_funding_range,
    top_blockers: result.top_blockers,
    risk_flags: result.risk_flags,
    recommendation: result.recommendation,
    recommended_next_step: result.recommended_next_step,
    upgrade_cta: result.upgrade_cta,
  }
}

function buildAnalyzerDetailLines(input: AnalyzerInput, result: AnalyzerResult, complianceSnapshot?: ComplianceSnapshot) {
  return [
    `Readiness score: ${result.readiness_score}/100`,
    `Readiness status: ${result.readiness_status}`,
    `Estimated funding range: ${result.estimated_funding_range}`,
    `Recommended program: ${result.assigned_program}`,
    result.summary ? `Summary: ${result.summary}` : null,
    result.top_blockers.length > 0 ? `Top blockers: ${result.top_blockers.join(', ')}` : null,
    result.risk_flags.length > 0 ? `Risk flags: ${result.risk_flags.join(', ')}` : null,
    input.business_name ? `Business: ${input.business_name}` : null,
    input.business_age ? `Business age: ${input.business_age}` : null,
    input.entity_type ? `Entity type: ${input.entity_type}` : null,
    input.industry ? `Industry: ${input.industry}` : null,
    input.monthly_revenue_range ? `Monthly revenue: ${input.monthly_revenue_range}` : null,
    input.monthly_deposit_range ? `Monthly deposits: ${input.monthly_deposit_range}` : null,
    input.credit_score_range ? `Credit score: ${input.credit_score_range}` : null,
    input.utilization_range ? `Utilization: ${input.utilization_range}` : null,
    input.inquiry_count_last_90_days ? `Recent inquiries: ${input.inquiry_count_last_90_days}` : null,
    input.business_credit_reporting_status ? `Business credit status: ${input.business_credit_reporting_status}` : null,
    complianceSnapshot ? formatComplianceSnapshotLines(complianceSnapshot, 'Analyzer Consent Compliance').join(' | ') : null,
  ].filter(Boolean) as string[]
}

function appendStructuredNote(existing: string | null, sectionLabel: string, lines: string[]) {
  const section = [`[${sectionLabel}]`, ...lines, `[/${sectionLabel}]`].join('\n')
  if (!existing?.trim()) return section
  if (existing.includes(`[${sectionLabel}]`)) {
    const pattern = new RegExp(`\\[${sectionLabel}\\][\\s\\S]*?\\[\\/${sectionLabel}\\]`, 'm')
    return existing.replace(pattern, section)
  }
  return `${section}\n\n${existing.trim()}`
}

async function queryLeadMatches(supabase: SupabaseClient, email: string, phoneCandidates: string[]) {
  const [emailRes, phoneRes] = await Promise.all([
    email
      ? supabase
          .from('crm_leads')
          .select(CRM_LEAD_SELECT)
          .eq('email', email)
          .order('updated_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null } as const),
    phoneCandidates.length > 0
      ? supabase
          .from('crm_leads')
          .select(CRM_LEAD_SELECT)
          .or(phoneCandidates.map((candidate) => `phone_e164.eq.${candidate},phone.eq.${candidate.replace(/^\+1/, '').replace(/^\+/, '')}`).join(','))
          .order('updated_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null } as const),
  ])

  if (emailRes.error) throw emailRes.error
  if (phoneRes.error) throw phoneRes.error

  return {
    emailMatches: (emailRes.data ?? []) as unknown as CrmLeadRow[],
    phoneMatches: (phoneRes.data ?? []) as unknown as CrmLeadRow[],
  }
}

export async function findMatchingCrmLead(
  supabase: SupabaseClient,
  opts: { email?: string | null; phone?: string | null },
): Promise<LeadMatchResult> {
  const email = normalizeLeadEmail(opts.email)
  const normalizedPhone = normalizeLeadPhone(opts.phone)
  const phoneCandidates = Array.from(
    new Set([
      normalizedPhone,
      normalizedPhone?.replace(/^\+1/, ''),
      opts.phone?.trim() ?? null,
    ].filter(Boolean) as string[])
  )

  const { emailMatches, phoneMatches } = await queryLeadMatches(supabase, email, phoneCandidates)
  const uniqueIds = Array.from(new Set([...emailMatches, ...phoneMatches].map((row) => row.id)))
  const duplicateRisk =
    uniqueIds.length > 1 ||
    emailMatches.length > 1 ||
    phoneMatches.length > 1

  let duplicateReason: string | null = null
  if (uniqueIds.length > 1) duplicateReason = 'email_and_phone_matched_multiple_crm_contacts'
  else if (emailMatches.length > 1) duplicateReason = 'normalized_email_matched_multiple_crm_contacts'
  else if (phoneMatches.length > 1) duplicateReason = 'normalized_phone_matched_multiple_crm_contacts'

  const primary = emailMatches[0] ?? phoneMatches[0] ?? null
  return {
    primary,
    emailMatches,
    phoneMatches,
    duplicateRisk,
    duplicateReason,
  }
}

async function getNotificationRecipients(supabase: SupabaseClient, assignedToUserId?: string | null) {
  const [adminsRes, assignedRes] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name').eq('is_admin', true),
    assignedToUserId
      ? supabase.from('profiles').select('id, email, full_name').eq('id', assignedToUserId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ])

  if (adminsRes.error) throw adminsRes.error
  if (assignedRes.error) throw assignedRes.error

  const recipients = new Map<string, NotificationRecipient>()
  for (const admin of adminsRes.data ?? []) {
    if (!admin.email) continue
    recipients.set(admin.email.toLowerCase(), { email: admin.email, name: admin.full_name ?? null })
  }

  if (assignedRes.data?.email) {
    recipients.set(assignedRes.data.email.toLowerCase(), {
      email: assignedRes.data.email,
      name: assignedRes.data.full_name ?? null,
    })
  }

  return Array.from(recipients.values())
}

async function sendLeadLifecycleNotificationEmail(opts: {
  supabase: SupabaseClient
  lead: CrmLeadRow
  kind: NotificationKind
  fullName: string
  businessName?: string | null
  email: string
  phone?: string | null
  analyzerSubmittedAt?: string | null
  result?: AnalyzerResult | null
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const recipients = await getNotificationRecipients(opts.supabase, opts.lead.assigned_to_user_id ?? null)
  if (recipients.length === 0) {
    return { success: false, error: 'No admin or assigned rep recipients configured' }
  }

  const crmUrl = `${getAppUrl()}/admin/crm/${opts.lead.id}`
  const readinessScore = opts.result?.readiness_score ?? opts.lead.readiness_score ?? null
  const summary = opts.result?.summary ?? opts.lead.analyzer_summary ?? null
  const analyzerDate = opts.analyzerSubmittedAt ?? opts.lead.analyzer_submitted_at ?? null
  const title =
    opts.kind === 'analyzer_submitted'
      ? `Analyzer submitted: ${opts.fullName || opts.email}`
      : `Analyzer lead created account: ${opts.fullName || opts.email}`

  const rows = [
    ['Name', opts.fullName || 'Unknown'],
    ['Email', opts.email],
    ['Phone', opts.phone || opts.lead.phone || '—'],
    ['Business', opts.businessName || opts.lead.business_name || '—'],
    ['Readiness Score', readinessScore != null ? `${readinessScore}/100` : '—'],
    ['Summary', summary || '—'],
    ['Analyzer Submitted', analyzerDate ? new Date(analyzerDate).toLocaleString('en-US') : '—'],
    ['Assigned Rep', opts.lead.assigned_to_name || 'Unassigned'],
  ]
    .map(([label, value]) => `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:160px;vertical-align:top">${label}</td><td style="padding:6px 0;font-size:13px;color:#111827">${value}</td></tr>`)
    .join('')

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#14532d;padding:24px 28px;border-radius:12px 12px 0 0">
        <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${title}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px;background:#ffffff">
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <p style="margin:20px 0 0"><a href="${crmUrl}" style="color:#16a34a;text-decoration:underline">Open CRM contact</a></p>
      </div>
    </div>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SourcifyLending Portal <no-reply@ai.sourcifylending.com>',
      to: recipients.map((recipient) => recipient.email),
      subject: `[SourcifyLending] ${title}`,
      html,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    return { success: false, error: `Resend ${response.status}: ${errorText}` }
  }

  return { success: true, recipients: recipients.map((recipient) => recipient.email) }
}

function getNextBusinessDate(now: Date) {
  const next = new Date(now)
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

export function computeAnalyzerFollowUpDueDate(now = new Date()) {
  const candidate = new Date(now)
  const cutoffHour = 15
  if (candidate.getDay() === 0 || candidate.getDay() === 6 || candidate.getHours() >= cutoffHour) {
    candidate.setDate(candidate.getDate() + 1)
  }
  const nextBusiness = getNextBusinessDate(candidate)
  nextBusiness.setHours(now.getHours() < cutoffHour ? 17 : 10, 0, 0, 0)
  return nextBusiness.toISOString()
}

async function ensureAnalyzerFollowUpTask(opts: {
  supabase: SupabaseClient
  lead: CrmLeadRow
  readinessScore: number
  createdByUserId?: string | null
}) {
  const { data: existingTask, error: existingTaskError } = await opts.supabase
    .from('crm_tasks')
    .select('id')
    .eq('lead_id', opts.lead.id)
    .eq('task_type', ANALYZER_TASK_TYPE)
    .neq('status', 'Done')
    .limit(1)
    .maybeSingle()

  if (existingTaskError) throw existingTaskError
  if (existingTask) return false

  const dueAt = computeAnalyzerFollowUpDueDate()
  const priority = opts.readinessScore >= ANALYZER_PRIORITY_THRESHOLD ? 'High' : 'Medium'
  const title = `Analyzer follow-up: ${[opts.lead.first_name, opts.lead.last_name].filter(Boolean).join(' ') || opts.lead.email || 'lead'}`

  const { data: task, error } = await opts.supabase
    .from('crm_tasks')
    .insert({
      lead_id: opts.lead.id,
      title,
      task_type: ANALYZER_TASK_TYPE,
      priority,
      status: 'To Do',
      due_at: dueAt,
      owner_user_id: opts.lead.assigned_to_user_id ?? null,
      owner_name: opts.lead.assigned_to_name ?? null,
      notes: `Auto-created from analyzer submission. Readiness score: ${opts.readinessScore}/100.`,
      created_by_user_id: opts.createdByUserId ?? null,
    })
    .select('id')
    .single()

  if (error) throw error

  await createCrmLeadActivity(
    opts.supabase,
    opts.lead.id,
    'follow_up_set',
    `Analyzer follow-up task created for ${new Date(dueAt).toLocaleString('en-US')}`,
    'lead_tracking',
    {
      task_id: task.id,
      task_type: ANALYZER_TASK_TYPE,
      priority,
      due_at: dueAt,
    },
  ).catch(() => {})

  return true
}

async function logNotificationEvent(opts: {
  kind: NotificationKind
  success: boolean
  leadId: string
  userId?: string | null
  metadata?: JsonRecord
  error?: string | null
}) {
  await logPortalEvent({
    userId: opts.userId ?? undefined,
    eventType: opts.success ? 'notification_sent' : 'notification_failed',
    category: 'leads',
    severity: opts.success ? 'success' : 'warning',
    title: opts.success ? 'Lead notification sent' : 'Lead notification failed',
    message: opts.success ? `Notification ${opts.kind} sent for CRM contact ${opts.leadId}.` : `Notification ${opts.kind} failed for CRM contact ${opts.leadId}.`,
    metadata: {
      lead_id: opts.leadId,
      notification_kind: opts.kind,
      ...(opts.error ? { error: opts.error } : {}),
      ...(opts.metadata ?? {}),
    },
  })
}

function createSignupNote(opts: {
  source: string
  suspicious: boolean
  riskScore?: number | null
  reasons?: string[]
  complianceSnapshot?: ComplianceSnapshot
}) {
  const lines = [
    `Created: ${new Date().toISOString()}`,
    `Source: ${opts.source}`,
    `Suspicious: ${opts.suspicious ? 'Yes' : 'No'}`,
    opts.suspicious && typeof opts.riskScore === 'number' ? `Risk Score: ${opts.riskScore}` : null,
    opts.suspicious && opts.reasons && opts.reasons.length > 0 ? `Risk Reasons: ${opts.reasons.join(', ')}` : null,
    ...(opts.complianceSnapshot ? formatComplianceSnapshotLines(opts.complianceSnapshot, 'Public Signup Compliance') : []),
  ].filter(Boolean) as string[]

  return appendStructuredNote(null, 'Portal Signup', lines)
}

async function fetchLatestAnalyzerLeadRecord(supabase: SupabaseClient, email: string, phone?: string | null) {
  const normalizedEmail = normalizeLeadEmail(email)
  const phoneCandidates = Array.from(
    new Set([
      normalizeLeadPhone(phone),
      phone?.trim() ?? null,
    ].filter(Boolean) as string[])
  )

  let query = supabase
    .from('leads')
    .select('id, email, phone, business_name, full_name, assigned_program, readiness_status, readiness_score, estimated_funding_range, risk_flags, analyzer_answers, summary, score_breakdown, raw_result_payload, submitted_at')
    .eq('source', 'free_analyzer')
    .order('submitted_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (normalizedEmail) {
    query = query.eq('email', normalizedEmail)
  } else if (phoneCandidates.length > 0) {
    query = query.in('phone', phoneCandidates)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return (data as AnalyzerLeadRecord | null) ?? null
}

function analyzerRecordToResult(record: AnalyzerLeadRecord): AnalyzerResult | null {
  if (
    typeof record.readiness_score !== 'number' ||
    !record.readiness_status ||
    !record.assigned_program ||
    !record.estimated_funding_range
  ) {
    return null
  }

  const payload = (record.raw_result_payload as AnalyzerResult | null) ?? null
  if (payload?.assigned_program && typeof payload.readiness_score === 'number') {
    return payload
  }

  return {
    readiness_score: record.readiness_score,
    readiness_status: record.readiness_status as AnalyzerResult['readiness_status'],
    assigned_program: record.assigned_program as AnalyzerResult['assigned_program'],
    estimated_funding_range: record.estimated_funding_range,
    risk_flags: record.risk_flags ?? [],
    top_blockers: Array.isArray(record.score_breakdown?.top_blockers) ? (record.score_breakdown?.top_blockers as string[]) : [],
    summary: record.summary ?? '',
    recommendation: typeof record.score_breakdown?.recommendation === 'string' ? record.score_breakdown.recommendation : '',
    recommended_next_step: typeof record.score_breakdown?.recommended_next_step === 'string' ? record.score_breakdown.recommended_next_step : '',
    upgrade_cta: typeof record.score_breakdown?.upgrade_cta === 'string' ? record.score_breakdown.upgrade_cta : 'Continue',
    disclaimer: '',
  }
}

export async function syncAnalyzerLeadLifecycle(opts: {
  supabase: SupabaseClient
  fullName: string
  email: string
  phone?: string | null
  businessName?: string | null
  input: AnalyzerInput
  result: AnalyzerResult
  rawResultPayload?: JsonRecord | null
  complianceSnapshot?: ComplianceSnapshot
  userId?: string | null
}) : Promise<AnalyzerLifecycleResult> {
  const submittedAt = new Date().toISOString()
  const normalizedEmail = normalizeLeadEmail(opts.email)
  const { firstName, lastName } = splitName(opts.fullName)
  const phoneInfo = await safeInferPhoneIntelligence(opts.phone)
  const phoneE164 = phoneInfo?.phone_e164 ?? normalizeLeadPhone(opts.phone)
  const match = await findMatchingCrmLead(opts.supabase, {
    email: normalizedEmail,
    phone: phoneE164 ?? opts.phone ?? null,
  })

  const basePayload: Record<string, unknown> = {
    first_name: match.primary?.first_name || firstName,
    last_name: match.primary?.last_name || lastName,
    email: normalizedEmail,
    phone: match.primary?.phone || opts.phone || 'Pending',
    business_name: opts.businessName?.trim() || opts.input.business_name || match.primary?.business_name || null,
    source: ANALYZER_SOURCE,
    lead_temperature: mergeLeadTemperature(match.primary?.lead_temperature, deriveLeadTemperature(opts.result.readiness_score)),
    readiness_score: opts.result.readiness_score,
    readiness_status: opts.result.readiness_status,
    assigned_program: opts.result.assigned_program,
    estimated_funding_range: opts.result.estimated_funding_range,
    risk_flags: opts.result.risk_flags,
    analyzer_answers: opts.input,
    analyzer_summary: opts.result.summary,
    analyzer_score_breakdown: buildAnalyzerScoreBreakdown(opts.result),
    analyzer_result_payload: opts.rawResultPayload ?? opts.result,
    analyzer_submitted: true,
    analyzer_submitted_at: submittedAt,
    duplicate_review_required: match.duplicateRisk,
    duplicate_review_reason: match.duplicateReason,
    updated_at: submittedAt,
  }

  if (phoneInfo) {
    basePayload.phone_e164 = phoneInfo.phone_e164
    basePayload.likely_timezone = phoneInfo.likely_timezone
    basePayload.timezone_confidence = phoneInfo.timezone_confidence
    basePayload.timezone_source = phoneInfo.timezone_source
    basePayload.last_timezone_checked_at = phoneInfo.last_timezone_checked_at
  }

  basePayload.notes = appendStructuredNote(
    match.primary?.notes ?? null,
    'Free Business Analyzer',
    buildAnalyzerDetailLines(opts.input, opts.result, opts.complianceSnapshot),
  )

  let lead: CrmLeadRow
  let action: 'created' | 'updated'

  if (match.primary) {
    const { data, error } = await opts.supabase
      .from('crm_leads')
      .update(basePayload)
      .eq('id', match.primary.id)
      .select(CRM_LEAD_SELECT)
      .single()
    if (error) throw error
    lead = data as unknown as CrmLeadRow
    action = 'updated'
  } else {
    const { data, error } = await opts.supabase
      .from('crm_leads')
      .insert({
        ...basePayload,
        stage: 'new',
        close_probability: opts.result.readiness_score >= ANALYZER_PRIORITY_THRESHOLD ? 65 : 30,
      })
      .select(CRM_LEAD_SELECT)
      .single()
    if (error) throw error
    lead = data as unknown as CrmLeadRow
    action = 'created'
  }

  await createCrmLeadActivity(
    opts.supabase,
    lead.id,
    'note',
    `Analyzer submitted with readiness score ${opts.result.readiness_score}/100.`,
    'lead_tracking',
    {
      event_type: 'analyzer_submitted',
      readiness_score: opts.result.readiness_score,
      readiness_status: opts.result.readiness_status,
      assigned_program: opts.result.assigned_program,
      duplicate_review_required: match.duplicateRisk,
    },
  ).catch(() => {})

  if (match.duplicateRisk) {
    await createCrmLeadActivity(
      opts.supabase,
      lead.id,
      'note',
      `Duplicate review required: ${match.duplicateReason ?? 'potential duplicate detected'}.`,
      'lead_tracking',
      {
        event_type: 'duplicate_risk_flagged',
        duplicate_review_reason: match.duplicateReason,
        matched_contact_ids: Array.from(new Set([...match.emailMatches, ...match.phoneMatches].map((row) => row.id))),
      },
    ).catch(() => {})
  }

  await logPortalEvent({
    userId: opts.userId ?? undefined,
    eventType: action === 'created' ? 'crm_contact_created' : 'crm_contact_updated',
    category: 'leads',
    severity: 'success',
    title: action === 'created' ? 'CRM contact created from analyzer' : 'CRM contact updated from analyzer',
    message: normalizedEmail,
    metadata: {
      lead_id: lead.id,
      source: ANALYZER_SOURCE,
      readiness_score: opts.result.readiness_score,
      duplicate_review_required: match.duplicateRisk,
    },
  })

  await logPortalEvent({
    userId: opts.userId ?? undefined,
    eventType: 'analyzer_submitted',
    category: 'leads',
    severity: 'success',
    title: 'Analyzer submitted',
    message: normalizedEmail,
    metadata: {
      lead_id: lead.id,
      readiness_score: opts.result.readiness_score,
      analyzer_submitted_at: submittedAt,
      source: ANALYZER_SOURCE,
    },
  })

  const taskCreated = await ensureAnalyzerFollowUpTask({
    supabase: opts.supabase,
    lead,
    readinessScore: opts.result.readiness_score,
  })

  const notification = await sendLeadLifecycleNotificationEmail({
    supabase: opts.supabase,
    lead,
    kind: 'analyzer_submitted',
    fullName: opts.fullName,
    businessName: opts.businessName,
    email: normalizedEmail,
    phone: opts.phone ?? null,
    analyzerSubmittedAt: submittedAt,
    result: opts.result,
  })

  await logNotificationEvent({
    kind: 'analyzer_submitted',
    success: notification.success,
    leadId: lead.id,
    userId: opts.userId ?? undefined,
    metadata: notification.success ? { recipients: notification.recipients } : undefined,
    error: notification.success ? null : notification.error,
  })

  return {
    leadId: lead.id,
    action,
    duplicateRisk: match.duplicateRisk,
    taskCreated,
    notificationSent: notification.success,
  }
}

export async function syncSignupLeadLifecycle(opts: {
  supabase: SupabaseClient
  userId?: string | null
  fullName: string
  email: string
  phone?: string | null
  businessName?: string | null
  source: 'email_password' | 'google_oauth' | 'create_prospect' | 'admin_manual'
  suspicious: boolean
  riskScore?: number | null
  reasons?: string[]
  complianceSnapshot?: ComplianceSnapshot
  analyzerResult?: AnalyzerResult | null
}) : Promise<SignupLifecycleResult> {
  const accountCreatedAt = new Date().toISOString()
  const normalizedEmail = normalizeLeadEmail(opts.email)
  const { firstName, lastName } = splitName(opts.fullName)
  const analyzerLeadRecord = await fetchLatestAnalyzerLeadRecord(opts.supabase, normalizedEmail, opts.phone)
  const analyzerResult = opts.analyzerResult ?? (analyzerLeadRecord ? analyzerRecordToResult(analyzerLeadRecord) : null)
  const phoneInfo = await safeInferPhoneIntelligence(opts.phone)
  const phoneE164 = phoneInfo?.phone_e164 ?? normalizeLeadPhone(opts.phone)
  const match = await findMatchingCrmLead(opts.supabase, {
    email: normalizedEmail,
    phone: phoneE164 ?? opts.phone ?? null,
  })

  const mergedWithAnalyzer = Boolean(match.primary?.analyzer_submitted || analyzerLeadRecord || analyzerResult)
  const accountWasAlreadyCreated = Boolean(match.primary?.account_created)
  const signupNote = createSignupNote({
    source: opts.source,
    suspicious: opts.suspicious,
    riskScore: opts.riskScore,
    reasons: opts.reasons,
    complianceSnapshot: opts.complianceSnapshot,
  })

  const basePayload: Record<string, unknown> = {
    first_name: match.primary?.first_name || firstName,
    last_name: match.primary?.last_name || lastName,
    email: normalizedEmail,
    phone: match.primary?.phone || opts.phone || 'Pending',
    business_name: match.primary?.business_name || opts.businessName || analyzerLeadRecord?.business_name || null,
    source: mergedWithAnalyzer ? ANALYZER_SOURCE : (match.primary?.source || 'inbound'),
    account_created: true,
    account_created_at: accountCreatedAt,
    duplicate_review_required: match.duplicateRisk,
    duplicate_review_reason: match.duplicateReason,
    updated_at: accountCreatedAt,
    notes: appendStructuredNote(match.primary?.notes ?? null, 'Portal Signup', signupNote.split('\n').filter(Boolean)),
  }

  if (phoneInfo) {
    basePayload.phone_e164 = phoneInfo.phone_e164
    basePayload.likely_timezone = phoneInfo.likely_timezone
    basePayload.timezone_confidence = phoneInfo.timezone_confidence
    basePayload.timezone_source = phoneInfo.timezone_source
    basePayload.last_timezone_checked_at = phoneInfo.last_timezone_checked_at
  }

  if (analyzerResult) {
    basePayload.readiness_score = analyzerResult.readiness_score
    basePayload.readiness_status = analyzerResult.readiness_status
    basePayload.assigned_program = analyzerResult.assigned_program
    basePayload.estimated_funding_range = analyzerResult.estimated_funding_range
    basePayload.risk_flags = analyzerResult.risk_flags
    basePayload.analyzer_summary = analyzerResult.summary
    basePayload.analyzer_score_breakdown = buildAnalyzerScoreBreakdown(analyzerResult)
    basePayload.analyzer_result_payload = analyzerResult
    basePayload.analyzer_submitted = true
    basePayload.analyzer_submitted_at = analyzerLeadRecord?.submitted_at ?? match.primary?.analyzer_submitted_at ?? accountCreatedAt
  }

  if (analyzerLeadRecord?.analyzer_answers) {
    basePayload.analyzer_answers = analyzerLeadRecord.analyzer_answers
  }

  let lead: CrmLeadRow
  let action: 'created' | 'updated'

  if (match.primary) {
    const { data, error } = await opts.supabase
      .from('crm_leads')
      .update(basePayload)
      .eq('id', match.primary.id)
      .select(CRM_LEAD_SELECT)
      .single()
    if (error) throw error
    lead = data as unknown as CrmLeadRow
    action = 'updated'
  } else {
    const { data, error } = await opts.supabase
      .from('crm_leads')
      .insert({
        ...basePayload,
        stage: 'new',
        lead_temperature: analyzerResult ? deriveLeadTemperature(analyzerResult.readiness_score) : (opts.suspicious ? 'cold' : 'warm'),
        close_probability: analyzerResult ? Math.min(80, Math.max(15, analyzerResult.readiness_score)) : (opts.suspicious ? 5 : 25),
      })
      .select(CRM_LEAD_SELECT)
      .single()
    if (error) throw error
    lead = data as unknown as CrmLeadRow
    action = 'created'
  }

  if (opts.userId) {
    await opts.supabase
      .from('profiles')
      .update({ lead_id: lead.id, updated_at: accountCreatedAt })
      .eq('id', opts.userId)
  }

  if (!accountWasAlreadyCreated) {
    await createCrmLeadActivity(
      opts.supabase,
      lead.id,
      'note',
      `Free account created for ${normalizedEmail}.`,
      'lead_tracking',
      {
        event_type: 'account_created',
        user_id: opts.userId ?? null,
        source: opts.source,
        merged_with_analyzer: mergedWithAnalyzer,
      },
    ).catch(() => {})
  }

  if (mergedWithAnalyzer && !accountWasAlreadyCreated) {
    await createCrmLeadActivity(
      opts.supabase,
      lead.id,
      'note',
      'Analyzer submission and signup were merged into this CRM contact.',
      'lead_tracking',
      {
        event_type: 'analyzer_signup_merged',
        source: opts.source,
        duplicate_review_required: match.duplicateRisk,
      },
    ).catch(() => {})
  }

  await logPortalEvent({
    userId: opts.userId ?? undefined,
    eventType: action === 'created' ? 'crm_contact_created' : 'crm_contact_updated',
    category: 'leads',
    severity: 'success',
    title: action === 'created' ? 'CRM contact created from signup' : 'CRM contact updated from signup',
    message: normalizedEmail,
    metadata: {
      lead_id: lead.id,
      source: opts.source,
      merged_with_analyzer: mergedWithAnalyzer,
      duplicate_review_required: match.duplicateRisk,
    },
  })

  if (!accountWasAlreadyCreated) {
    await logPortalEvent({
      userId: opts.userId ?? undefined,
      eventType: 'account_created',
      category: 'accounts',
      severity: 'success',
      title: 'Lead created a free account',
      message: normalizedEmail,
      metadata: {
        lead_id: lead.id,
        source: opts.source,
        account_created_at: accountCreatedAt,
      },
    })
  }

  if (mergedWithAnalyzer && !accountWasAlreadyCreated) {
    await logPortalEvent({
      userId: opts.userId ?? undefined,
      eventType: 'analyzer_signup_merged',
      category: 'leads',
      severity: 'success',
      title: 'Analyzer lead merged with signup',
      message: normalizedEmail,
      metadata: {
        lead_id: lead.id,
        analyzer_submitted_at: lead.analyzer_submitted_at,
        account_created_at: accountCreatedAt,
      },
    })
  }

  let notificationSent = false
  if (mergedWithAnalyzer && !accountWasAlreadyCreated) {
    const notification = await sendLeadLifecycleNotificationEmail({
      supabase: opts.supabase,
      lead,
      kind: 'account_created_after_analyzer',
      fullName: opts.fullName,
      businessName: opts.businessName,
      email: normalizedEmail,
      phone: opts.phone ?? null,
      analyzerSubmittedAt: lead.analyzer_submitted_at,
      result: analyzerResult,
    })
    notificationSent = notification.success
    await logNotificationEvent({
      kind: 'account_created_after_analyzer',
      success: notification.success,
      leadId: lead.id,
      userId: opts.userId ?? undefined,
      metadata: notification.success ? { recipients: notification.recipients } : undefined,
      error: notification.success ? null : notification.error,
    })
  }

  return {
    leadId: lead.id,
    action,
    duplicateRisk: match.duplicateRisk,
    mergedWithAnalyzer,
    notificationSent,
  }
}
