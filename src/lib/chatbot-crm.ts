import type { SupabaseClient } from '@supabase/supabase-js'
import type { QualificationResult, CollectedData } from '@/types'
import { findMatchingCrmLead, normalizeLeadPhone, normalizeLeadEmail } from '@/lib/crm-lead-lifecycle'
import { createCrmLeadActivity } from '@/lib/crm-invites'
import { logPortalEvent } from '@/lib/portal-events'

type JsonRecord = Record<string, unknown>

export interface ChatbotCrmLeadInput {
  supabase: SupabaseClient
  fullName: string
  email: string
  phone?: string | null
  businessName?: string | null
  collectedData: Partial<CollectedData>
  qualificationResult: QualificationResult
}

export interface ChatbotCrmLeadResult {
  leadId: string
  action: 'created' | 'updated'
  duplicateRisk: boolean
}

const CHATBOT_SOURCE = 'website_chatbot'

function deriveLeadTemperature(status: string): 'cold' | 'warm' | 'hot' {
  if (status === 'Ready') return 'hot'
  if (status === 'Conditionally Ready') return 'warm'
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

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? (fullName.trim() || 'Unknown'),
    lastName: parts.slice(1).join(' '),
  }
}

function buildChatbotDetailLines(data: Partial<CollectedData>, result: QualificationResult) {
  return [
    `Chatbot qualification: ${result.readiness_status}`,
    `Readiness score: ${result.readiness_score}/100`,
    `Summary: ${result.summary}`,
    result.funding_range ? `Estimated funding range: ${result.funding_range}` : null,
    result.recommended_program ? `Recommended program: ${result.recommended_program}` : null,
    result.blockers && result.blockers.length > 0 ? `Top blockers: ${result.blockers.join(', ')}` : null,
    data.business_name ? `Business: ${data.business_name}` : null,
    data.business_age ? `Business age: ${data.business_age}` : null,
    data.industry ? `Industry: ${data.industry}` : null,
    data.monthly_revenue ? `Monthly revenue: ${data.monthly_revenue}` : null,
    data.credit_score_range ? `Credit score: ${data.credit_score_range}` : null,
    data.state ? `State: ${data.state}` : null,
    data.funding_goal ? `Funding goal: ${data.funding_goal}` : null,
    data.has_business_credit ? `Has business credit: Yes` : null,
    data.has_bank_statements ? `Has bank statements: Yes` : null,
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

export async function syncChatbotLeadLifecycle({
  supabase,
  fullName,
  email,
  phone,
  businessName,
  collectedData,
  qualificationResult,
}: ChatbotCrmLeadInput): Promise<ChatbotCrmLeadResult> {
  const submittedAt = new Date().toISOString()
  const normalizedEmail = normalizeLeadEmail(email)
  const { firstName, lastName } = splitName(fullName)
  const phoneE164 = normalizeLeadPhone(phone)

  const match = await findMatchingCrmLead(supabase, {
    email: normalizedEmail,
    phone: phoneE164 ?? phone ?? null,
  })

  const temperature = deriveLeadTemperature(qualificationResult.readiness_status)
  const basePayload: Record<string, unknown> = {
    first_name: match.primary?.first_name || firstName,
    last_name: match.primary?.last_name || lastName,
    email: normalizedEmail,
    phone: match.primary?.phone || phone || 'Pending',
    business_name: businessName?.trim() || match.primary?.business_name || null,
    source: CHATBOT_SOURCE,
    lead_temperature: mergeLeadTemperature(match.primary?.lead_temperature, temperature),
    readiness_score: qualificationResult.readiness_score,
    readiness_status: qualificationResult.readiness_status,
    estimated_funding_range: qualificationResult.funding_range || null,
    analyzer_summary: qualificationResult.summary,
    duplicate_review_required: match.duplicateRisk,
    duplicate_review_reason: match.duplicateReason,
    updated_at: submittedAt,
  }

  if (phoneE164) {
    basePayload.phone_e164 = phoneE164
  }

  // Build and append chatbot-specific notes
  basePayload.notes = appendStructuredNote(
    match.primary?.notes ?? null,
    'Chatbot Qualification',
    buildChatbotDetailLines(collectedData, qualificationResult),
  )

  let leadId: string
  let action: 'created' | 'updated'

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
    'readiness_score',
    'readiness_status',
    'estimated_funding_range',
    'analyzer_summary',
    'duplicate_review_required',
    'duplicate_review_reason',
    'updated_at',
    'created_at',
  ].join(', ')

  if (match.primary) {
    const { data, error } = await supabase
      .from('crm_leads')
      .update(basePayload)
      .eq('id', match.primary.id)
      .select(CRM_LEAD_SELECT)
      .single()

    if (error) throw error
    if (!data) throw new Error('Update returned no data')
    leadId = (data as any).id as string
    action = 'updated'
  } else {
    const { data, error } = await supabase
      .from('crm_leads')
      .insert({
        ...basePayload,
        stage: 'new',
        close_probability: qualificationResult.readiness_status === 'Ready' ? 65 : qualificationResult.readiness_status === 'Conditionally Ready' ? 45 : 20,
      })
      .select(CRM_LEAD_SELECT)
      .single()

    if (error) throw error
    if (!data) throw new Error('Insert returned no data')
    leadId = (data as any).id as string
    action = 'created'
  }

  // Log activity
  await createCrmLeadActivity(
    supabase,
    leadId,
    'note',
    `Chatbot qualification submitted with readiness score ${qualificationResult.readiness_score}/100. Status: ${qualificationResult.readiness_status}.`,
    'lead_tracking',
    {
      event_type: 'chatbot_qualified',
      readiness_score: qualificationResult.readiness_score,
      readiness_status: qualificationResult.readiness_status,
      duplicate_review_required: match.duplicateRisk,
    },
  ).catch(() => {})

  if (match.duplicateRisk) {
    await createCrmLeadActivity(
      supabase,
      leadId,
      'note',
      `Duplicate review required: ${match.duplicateReason ?? 'potential duplicate detected'}.`,
      'lead_tracking',
      {
        event_type: 'duplicate_risk_flagged',
        duplicate_review_reason: match.duplicateReason,
      },
    ).catch(() => {})
  }

  // Log portal events
  await logPortalEvent({
    eventType: action === 'created' ? 'crm_contact_created' : 'crm_contact_updated',
    category: 'leads',
    severity: 'success',
    title: action === 'created' ? 'CRM contact created from chatbot' : 'CRM contact updated from chatbot',
    message: normalizedEmail,
    metadata: {
      lead_id: leadId,
      source: CHATBOT_SOURCE,
      readiness_score: qualificationResult.readiness_score,
      readiness_status: qualificationResult.readiness_status,
    },
  }).catch(() => {})

  return {
    leadId,
    action,
    duplicateRisk: match.duplicateRisk,
  }
}
