import type { AnalyzerInput, AnalyzerResult } from '@/types'
import type { createServiceClient } from '@/lib/supabase/server'
import { formatComplianceSnapshotLines, type ComplianceSnapshot } from '@/lib/public-form-compliance'

type SupabaseClientLike = Awaited<ReturnType<typeof createServiceClient>>

interface AnalyzerLeadSyncInput {
  supabase: SupabaseClientLike
  fullName: string
  email: string
  phone?: string | null
  businessName?: string | null
  input: AnalyzerInput
  result: AnalyzerResult
  syncMode?: 'full' | 'identity'
  createIfMissing?: boolean
  complianceSnapshot?: ComplianceSnapshot
}

type CRMLeadRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string
  business_name: string | null
  source: string
  stage: string
  program_interest: 'program_a' | 'program_b' | 'program_c' | null
  notes: string | null
  lead_temperature?: 'cold' | 'warm' | 'hot'
}

const SNAPSHOT_START = '[Free Analyzer Snapshot]'
const SNAPSHOT_END = '[/Free Analyzer Snapshot]'

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? fullName.trim(),
    lastName: parts.slice(1).join(' '),
  }
}

function normalizeEmail(email: string) {
  return email.toLowerCase().trim()
}

function normalizePhone(phone?: string | null) {
  const value = phone?.trim() ?? ''
  return value.length > 0 ? value : null
}

function deriveTemperature(result: AnalyzerResult): 'cold' | 'warm' | 'hot' {
  if (result.readiness_score >= 70) return 'hot'
  if (result.readiness_score >= 45) return 'warm'
  return 'cold'
}

function mergeTemperature(
  existing?: 'cold' | 'warm' | 'hot',
  next?: 'cold' | 'warm' | 'hot',
): 'cold' | 'warm' | 'hot' {
  const rank = { cold: 0, warm: 1, hot: 2 } as const
  if (!existing) return next ?? 'cold'
  if (!next) return existing
  return rank[next] > rank[existing] ? next : existing
}

function formatAnalyzerSnapshot({
  businessName,
  input,
  result,
  complianceSnapshot,
}: {
  businessName?: string | null
  input: AnalyzerInput
  result: AnalyzerResult
  complianceSnapshot?: ComplianceSnapshot
}) {
  const lines = [
    SNAPSHOT_START,
    `Completed: ${new Date().toISOString()}`,
    `Source: Free Analyzer`,
    `Readiness Score: ${result.readiness_score}/100`,
    `Readiness Status: ${result.readiness_status}`,
    `Estimated Funding Range: ${result.estimated_funding_range}`,
    `Recommended Program: ${result.assigned_program}`,
    businessName ? `Business Name: ${businessName}` : null,
    input.business_age ? `Business Age: ${input.business_age}` : null,
    input.entity_type ? `Entity Type: ${input.entity_type}` : null,
    input.industry ? `Industry: ${input.industry}` : null,
    input.monthly_revenue_range ? `Monthly Revenue: ${input.monthly_revenue_range}` : null,
    input.credit_score_range ? `Credit Score: ${input.credit_score_range}` : null,
    input.inquiry_count_last_90_days ? `Recent Inquiries: ${input.inquiry_count_last_90_days}` : null,
    result.top_blockers.length > 0 ? `Top Blockers: ${result.top_blockers.join(', ')}` : null,
    result.risk_flags.length > 0 ? `Risk Flags: ${result.risk_flags.join(', ')}` : null,
    result.summary ? `Summary: ${result.summary}` : null,
    ...(complianceSnapshot ? ['', ...formatComplianceSnapshotLines(complianceSnapshot, 'Analyzer Consent Compliance')] : []),
    SNAPSHOT_END,
  ].filter(Boolean)

  return lines.join('\n')
}

function mergeNotes(existingNotes: string | null, snapshot: string) {
  const trimmed = (existingNotes ?? '').trim()
  if (!trimmed) return snapshot

  const start = trimmed.indexOf(SNAPSHOT_START)
  const end = trimmed.indexOf(SNAPSHOT_END)

  if (start >= 0 && end >= start) {
    const before = trimmed.slice(0, start).trim()
    const after = trimmed.slice(end + SNAPSHOT_END.length).trim()
    return [before, snapshot, after].filter(Boolean).join('\n\n')
  }

  return `${snapshot}\n\n${trimmed}`
}

async function findExistingCrmLead(supabase: SupabaseClientLike, email: string) {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, first_name, last_name, email, phone, business_name, source, stage, program_interest, notes, lead_temperature')
    .eq('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) throw error
  return (data?.[0] as CRMLeadRow | undefined) ?? null
}

export async function upsertAnalyzerCrmLead({
  supabase,
  fullName,
  email,
  phone,
  businessName,
  input,
  result,
  syncMode = 'full',
  createIfMissing = true,
  complianceSnapshot,
}: AnalyzerLeadSyncInput) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPhone = normalizePhone(phone)
  const { firstName, lastName } = splitName(fullName)
  const snapshot = formatAnalyzerSnapshot({ businessName, input, result, complianceSnapshot })
  const temperature = deriveTemperature(result)
  const existing = await findExistingCrmLead(supabase, normalizedEmail)

  if (!existing) {
    if (!createIfMissing) {
      return { id: null, action: 'skipped' as const }
    }

    const { data, error } = await supabase
      .from('crm_leads')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        phone: normalizedPhone ?? 'Pending',
        business_name: businessName?.trim() || input.business_name || null,
        source: 'free_analyzer',
        stage: 'new',
        program_interest: result.assigned_program,
        notes: syncMode === 'full' ? snapshot : `Source: Free Analyzer\nReadiness Score: ${result.readiness_score}/100\nEstimated Funding Range: ${result.estimated_funding_range}`,
        lead_temperature: temperature,
      })
      .select('id')
      .single()

    if (error) throw error
    return { id: data.id, action: 'created' as const }
  }

  const nextSource = existing.source === 'manual' || !existing.source ? 'free_analyzer' : existing.source

  const updatePayload: Record<string, unknown> = {
    first_name: existing.first_name || firstName,
    last_name: existing.last_name || lastName,
    phone: existing.phone || normalizedPhone || 'Pending',
    business_name: businessName?.trim() || input.business_name || existing.business_name || null,
    source: nextSource,
    program_interest: result.assigned_program,
    lead_temperature: mergeTemperature(existing.lead_temperature, temperature),
    updated_at: new Date().toISOString(),
  }

  if (syncMode === 'full') {
    updatePayload.notes = mergeNotes(existing.notes, snapshot)
  }

  const { error } = await supabase
    .from('crm_leads')
    .update(updatePayload)
    .eq('id', existing.id)

  if (error) throw error
  return { id: existing.id, action: 'updated' as const }
}
