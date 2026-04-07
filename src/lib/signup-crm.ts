import type { createServiceClient } from '@/lib/supabase/server'
import { formatComplianceSnapshotLines, type ComplianceSnapshot } from '@/lib/public-form-compliance'

type SupabaseClientLike = Awaited<ReturnType<typeof createServiceClient>>

function normalizeSignupCrmSource(source: 'email_password' | 'google_oauth' | 'create_prospect') {
  // Production crm_leads currently allows operational sources like inbound/free_analyzer/manual.
  // Signup path detail is preserved in notes and portal events; use inbound for the CRM source field.
  return 'inbound'
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? fullName.trim(),
    lastName: parts.slice(1).join(' '),
  }
}

function buildSignupLeadNote({
  businessName,
  source,
  suspicious,
  riskScore,
  reasons,
  complianceSnapshot,
}: {
  businessName?: string | null
  source: string
  suspicious: boolean
  riskScore?: number | null
  reasons?: string[]
  complianceSnapshot?: ComplianceSnapshot
}) {
  const lines = [
    '[Portal Signup]',
    `Created: ${new Date().toISOString()}`,
    `Source: ${source}`,
    businessName ? `Business: ${businessName}` : null,
    suspicious ? 'Suspicious: Yes' : 'Suspicious: No',
    suspicious && typeof riskScore === 'number' ? `Risk Score: ${riskScore}` : null,
    suspicious && reasons && reasons.length > 0 ? `Risk Reasons: ${reasons.join(', ')}` : null,
    ...(complianceSnapshot ? ['', ...formatComplianceSnapshotLines(complianceSnapshot, 'Public Signup Compliance')] : []),
    '[/Portal Signup]',
  ].filter(Boolean)

  return lines.join('\n')
}

function mergeSignupNote(existingNotes: string | null, note: string) {
  if (!existingNotes?.trim()) return note
  if (existingNotes.includes('[Portal Signup]')) return existingNotes
  return `${note}\n\n${existingNotes.trim()}`
}

export async function ensureSignupCrmLead({
  supabase,
  userId,
  fullName,
  email,
  businessName,
  source,
  suspicious,
  riskScore,
  reasons,
  complianceSnapshot,
}: {
  supabase: SupabaseClientLike
  userId: string
  fullName: string
  email: string
  businessName?: string | null
  source: 'email_password' | 'google_oauth' | 'create_prospect'
  suspicious: boolean
  riskScore?: number | null
  reasons?: string[]
  complianceSnapshot?: ComplianceSnapshot
}) {
  const { firstName, lastName } = splitName(fullName || email.split('@')[0] || 'New Signup')
  const normalizedEmail = email.toLowerCase().trim()
  const crmSource = normalizeSignupCrmSource(source)
  const signupNote = buildSignupLeadNote({
    businessName,
    source,
    suspicious,
    riskScore,
    reasons,
    complianceSnapshot,
  })

  // Check for existing analyzer result first to link to existing CRM lead
  const { data: existingAnalyzer } = await supabase
    .from('analyzer_results')
    .select('readiness_status, assigned_program, risk_flags, estimated_funding_range, created_at')
    .eq('user_email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: existingLead, error: existingLeadError } = await supabase
    .from('crm_leads')
    .select('id, notes, business_name, first_name, last_name, source, readiness_status, assigned_program, estimated_funding_range')
    .eq('email', normalizedEmail)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingLeadError) throw existingLeadError

  if (existingLead) {
    // Update existing lead with latest analyzer data if available
    const updatePayload: Record<string, unknown> = {
      first_name: existingLead.first_name || firstName,
      last_name: existingLead.last_name || lastName,
      business_name: existingLead.business_name || businessName || null,
      source: existingLead.source || crmSource,
      notes: mergeSignupNote(existingLead.notes, signupNote),
      updated_at: new Date().toISOString(),
    }

    // Sync analyzer data to existing CRM lead
    if (existingAnalyzer) {
      updatePayload.readiness_status = existingAnalyzer.readiness_status
      updatePayload.assigned_program = existingAnalyzer.assigned_program
      updatePayload.estimated_funding_range = existingAnalyzer.estimated_funding_range
      updatePayload.risk_flags = existingAnalyzer.risk_flags
    }

    const { error } = await supabase
      .from('crm_leads')
      .update(updatePayload)
      .eq('id', existingLead.id)

    if (error) throw error
    return { leadId: existingLead.id, action: 'updated' as const }
  }

  const { data: createdLead, error: createError } = await supabase
    .from('crm_leads')
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      phone: 'Pending',
      business_name: businessName || null,
      stage: 'new',
      source: crmSource,
      notes: signupNote,
      lead_temperature: suspicious ? 'cold' : 'warm',
      close_probability: suspicious ? 5 : 20,
      callback_due_at: suspicious ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      latest_call_note: null,
      assigned_to_user_id: null,
      assigned_to_name: null,
    })
    .select('id')
    .single()

  if (createError) throw createError

  await supabase
    .from('profiles')
    .update({ lead_id: createdLead.id, updated_at: new Date().toISOString() })
    .eq('id', userId)

  return { leadId: createdLead.id, action: 'created' as const }
}
