import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

type RawLead = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string
  phone_e164: string | null
  email: string | null
  business_name: string | null
  notes: string | null
  source: string | null
}

type PromotionResult = {
  crmLeadId: string
  merged: boolean
  alreadyPromoted: boolean
}

/**
 * Promote a raw dialer lead to CRM.
 * One-way operation: raw lead -> CRM lead.
 * Duplicate prevention: merges if phone_e164 exists in CRM.
 * Audit logging: full snapshot saved to dialer_promotion_log.
 */
export async function promoteToCrm(
  supabase: ServiceClient,
  input: {
    rawLeadId: string
    trigger: string
    userId: string
  }
): Promise<PromotionResult> {
  // 1. Load raw lead
  const { data: rawLead, error: rawError } = await supabase
    .from('dialer_raw_leads')
    .select('id, first_name, last_name, phone, phone_e164, email, business_name, notes, source, promoted_to_crm_lead_id')
    .eq('id', input.rawLeadId)
    .single<RawLead & { promoted_to_crm_lead_id: string | null }>()

  if (rawError || !rawLead) {
    throw new Error(`Raw lead not found: ${input.rawLeadId}`)
  }

  // 2. Idempotency check
  if (rawLead.promoted_to_crm_lead_id) {
    return {
      crmLeadId: rawLead.promoted_to_crm_lead_id,
      merged: false,
      alreadyPromoted: true,
    }
  }

  // 3. Check for existing CRM lead by phone (duplicate prevention)
  let existingCrmLeadId: string | null = null
  if (rawLead.phone_e164) {
    const { data: existing } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('phone_e164', rawLead.phone_e164)
      .maybeSingle<{ id: string }>()
    
    if (existing) {
      existingCrmLeadId = existing.id
    }
  }

  // 4. Use RPC for atomic promotion (handles race conditions)
  const { data: result, error: rpcError } = await supabase.rpc('promote_raw_lead_to_crm', {
    p_raw_lead_id: input.rawLeadId,
    p_trigger: input.trigger,
    p_user_id: input.userId,
    p_first_name: rawLead.first_name || '',
    p_last_name: rawLead.last_name || '',
    p_phone: rawLead.phone,
    p_phone_e164: rawLead.phone_e164 || rawLead.phone,
    p_email: rawLead.email || null,
    p_business_name: rawLead.business_name || null,
    p_notes: rawLead.notes || null,
    p_source: rawLead.source || 'dialer_import',
  })

  if (rpcError) {
    // Fallback: manual promotion if RPC fails
    return await manualPromotionFallback(supabase, rawLead, input)
  }

  // RPC returns tuple: (crm_lead_id, merged, already_promoted)
  const [crmLeadId, merged, alreadyPromoted] = result as [string, boolean, boolean]

  return {
    crmLeadId,
    merged,
    alreadyPromoted,
  }
}

/**
 * Check if a disposition should trigger auto-promotion.
 * Only strong outcomes auto-promote. "interested" requires manual promotion
 * or must have a scheduled callback/follow-up.
 */
export function shouldAutoPromote(dispositionKey: string): boolean {
  const autoPromoteDispositions = new Set([
    'appointment_set',
    'booked_call',
    'qualified',
    'application_started',
    'closed_won',
  ])
  return autoPromoteDispositions.has(dispositionKey)
}

/**
 * Fallback promotion logic (used if RPC fails)
 */
async function manualPromotionFallback(
  supabase: ServiceClient,
  rawLead: RawLead,
  input: { rawLeadId: string; trigger: string; userId: string }
): Promise<PromotionResult> {
  // Check for existing CRM lead
  const { data: existing } = await supabase
    .from('crm_leads')
    .select('id, first_name, last_name, email, business_name, notes, source, stage')
    .eq('phone_e164', rawLead.phone_e164 || rawLead.phone)
    .maybeSingle()

  let crmLeadId: string
  let merged = false

  if (existing) {
    // Merge with existing
    const { data: updated } = await supabase
      .from('crm_leads')
      .update({
        first_name: rawLead.first_name || existing.first_name,
        last_name: rawLead.last_name || existing.last_name,
        email: rawLead.email || existing.email,
        business_name: rawLead.business_name || existing.business_name,
        notes: existing.notes 
          ? `${existing.notes}\n\n[From Dialer]\n${rawLead.notes || ''}`
          : rawLead.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .single()
    
    crmLeadId = updated!.id
    merged = true
  } else {
    // Create new CRM lead
    const { data: created } = await supabase
      .from('crm_leads')
      .insert({
        first_name: rawLead.first_name || '',
        last_name: rawLead.last_name || '',
        phone: rawLead.phone,
        phone_e164: rawLead.phone_e164 || rawLead.phone,
        email: rawLead.email,
        business_name: rawLead.business_name,
        notes: rawLead.notes,
        source: rawLead.source || 'dialer_promoted',
        stage: 'new',
      })
      .select('id')
      .single()
    
    crmLeadId = created!.id
  }

  // Mark raw lead as promoted
  await supabase
    .from('dialer_raw_leads')
    .update({
      promoted_to_crm_at: new Date().toISOString(),
      promoted_to_crm_lead_id: crmLeadId,
      promotion_trigger: input.trigger,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.rawLeadId)

  // Audit log
  await supabase
    .from('dialer_promotion_log')
    .insert({
      raw_lead_id: input.rawLeadId,
      crm_lead_id: crmLeadId,
      promotion_trigger: input.trigger,
      promoted_by_user_id: input.userId,
      merged_with_existing_crm_lead: merged,
      raw_lead_snapshot: rawLead,
      crm_lead_snapshot: { id: crmLeadId },
    })

  return {
    crmLeadId,
    merged,
    alreadyPromoted: false,
  }
}
