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

type PromotionRpcRow = {
  crm_lead_id?: string
  merged?: boolean
  already_promoted?: boolean
}

const CRM_SOURCE_VALUES = new Set([
  'manual',
  'analyzer',
  'affiliate',
  'facebook',
  'purchased',
  'referral',
  'inbound',
  'other',
])

function normalizeCrmSource(source: string | null | undefined): string {
  const normalized = source?.trim().toLowerCase() ?? ''
  return CRM_SOURCE_VALUES.has(normalized) ? normalized : 'manual'
}

export type WorkflowState = {
  follow_up_at?:      string | null
  callback_due_at?:   string | null
  last_call_outcome?: string | null
  last_call_at?:      string | null
  lead_temperature?:  'cold' | 'warm' | 'hot' | null
  last_call_note?:    string | null
  crm_stage?:         string | null
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
    workflowState?: WorkflowState
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

  // 2. Idempotency check - if already promoted, we still apply workflow state
  const alreadyPromoted = !!rawLead.promoted_to_crm_lead_id
  const crmLeadIdFromPromotion = rawLead.promoted_to_crm_lead_id

  // 3. If not already promoted, perform the promotion
  let promotionResult: PromotionResult

  if (!alreadyPromoted) {
    // Use RPC for atomic promotion (handles race conditions)
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
      p_source: normalizeCrmSource(rawLead.source),
    })

    if (rpcError) {
      // Fallback: manual promotion if RPC fails
      promotionResult = await manualPromotionFallback(supabase, rawLead, input)
    } else {
      promotionResult = parsePromotionRpcResult(result)
    }
  } else {
    // Lead already promoted - verify the linked CRM lead still exists and is visible.
    // If the link is stale, recover by re-running the merge/create fallback path.
    const verified = await verifyPromotedLeadLink(supabase, rawLead, crmLeadIdFromPromotion)
    if (verified) {
      promotionResult = {
        crmLeadId: crmLeadIdFromPromotion!,
        merged: false,
        alreadyPromoted: true,
      }
    } else {
      promotionResult = await manualPromotionFallback(supabase, rawLead, input)
    }
  }

  // Apply workflow state: patch CRM lead fields + create follow-up/callback task
  // Always apply workflow state, even for already-promoted leads, to sync latest dialer disposition
  if (input.workflowState) {
    await applyWorkflowState(supabase, promotionResult.crmLeadId, input.workflowState, input.userId)
  }

  await ensurePromotedLeadVisible(supabase, {
    rawLeadId: input.rawLeadId,
    crmLeadId: promotionResult.crmLeadId,
    expectedStage: input.workflowState?.crm_stage ?? null,
  })

  return promotionResult
}

export function parsePromotionRpcResult(result: unknown): PromotionResult {
  const row = Array.isArray(result)
    ? result[0]
    : result

  if (!row) {
    throw new Error('Promotion RPC returned no result row')
  }

  if (typeof row === 'object' && row !== null) {
    const typedRow = row as PromotionRpcRow & {
      crm_lead_id?: string
      merged?: boolean
      already_promoted?: boolean
    }
    const crmLeadId = typedRow.crm_lead_id ?? (row as { id?: string }).id
    if (!crmLeadId) {
      throw new Error('Promotion RPC returned a row without crm_lead_id')
    }

    return {
      crmLeadId,
      merged: Boolean(typedRow.merged),
      alreadyPromoted: Boolean(typedRow.already_promoted),
    }
  }

  if (Array.isArray(result) && result.length >= 1 && typeof result[0] === 'string') {
    return {
      crmLeadId: result[0],
      merged: Boolean(result[1]),
      alreadyPromoted: Boolean(result[2]),
    }
  }

  throw new Error('Promotion RPC returned an unsupported result shape')
}

/**
 * After promotion, patch the CRM lead with Dialer workflow state and
 * create a CRM task if a callback or follow-up was scheduled.
 */
async function applyWorkflowState(
  supabase: ServiceClient,
  crmLeadId: string,
  state: WorkflowState,
  userId: string
) {
  const patch: Record<string, unknown> = {}
  patch.is_archived = false
  if (state.follow_up_at     != null) patch.follow_up_at     = state.follow_up_at
  if (state.callback_due_at  != null) patch.callback_due_at  = state.callback_due_at
  if (state.last_call_outcome != null) patch.last_call_outcome = state.last_call_outcome
  if (state.last_call_at     != null) patch.last_call_at     = state.last_call_at
  if (state.lead_temperature != null) patch.lead_temperature  = state.lead_temperature
  if (state.last_call_note   != null) patch.latest_call_note  = state.last_call_note
  if (state.crm_stage        != null) patch.stage             = state.crm_stage

  patch.updated_at = new Date().toISOString()

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('crm_leads').update(patch).eq('id', crmLeadId)
    if (error) {
      throw new Error(`Failed to apply workflow state to CRM lead ${crmLeadId}: ${error.message}`)
    }
  }

  // Create a CRM task for any scheduled callback or follow-up
  const dueAt = state.callback_due_at ?? state.follow_up_at
  if (dueAt) {
    const isCallback = !!state.callback_due_at
    await supabase.from('crm_tasks').insert({
      lead_id: crmLeadId,
      title: isCallback ? 'Callback from Dialer' : 'Follow-up from Dialer',
      task_type: isCallback ? 'Call' : 'Follow-up',
      priority: 'High',
      status: 'To Do',
      due_at: dueAt,
      notes: state.last_call_note ?? null,
      owner_user_id: userId,
      created_source: 'dialer_promotion',
      created_source_label: 'Dialer',
    })
  }
}

async function verifyPromotedLeadLink(
  supabase: ServiceClient,
  rawLead: RawLead & { promoted_to_crm_lead_id: string | null },
  expectedCrmLeadId: string | null,
): Promise<boolean> {
  if (!expectedCrmLeadId) return false

  const [{ data: crmLead }, { data: rawLeadRow }] = await Promise.all([
    supabase
      .from('crm_leads')
      .select('id, stage, is_archived')
      .eq('id', expectedCrmLeadId)
      .maybeSingle<{ id: string; stage: string | null; is_archived: boolean }>(),
    supabase
      .from('dialer_raw_leads')
      .select('promoted_to_crm_lead_id')
      .eq('id', rawLead.id)
      .maybeSingle<{ promoted_to_crm_lead_id: string | null }>(),
  ])

  return !!crmLead && !crmLead.is_archived && rawLeadRow?.promoted_to_crm_lead_id === expectedCrmLeadId
}

async function ensurePromotedLeadVisible(
  supabase: ServiceClient,
  input: {
    rawLeadId: string
    crmLeadId: string
    expectedStage: string | null
  },
) {
  const { data: crmLead, error: crmLeadError } = await supabase
    .from('crm_leads')
    .select('id, stage, is_archived')
    .eq('id', input.crmLeadId)
    .maybeSingle<{ id: string; stage: string | null; is_archived: boolean }>()

  if (crmLeadError) {
    throw new Error(`Unable to verify CRM lead ${input.crmLeadId}: ${crmLeadError.message}`)
  }
  if (!crmLead) {
    throw new Error(`Promoted CRM lead not found: ${input.crmLeadId}`)
  }

  const patch: Record<string, unknown> = {}
  if (crmLead.is_archived) {
    patch.is_archived = false
  }
  if (input.expectedStage && crmLead.stage !== input.expectedStage) {
    patch.stage = input.expectedStage
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase.from('crm_leads').update(patch).eq('id', input.crmLeadId)
    if (error) {
      throw new Error(`Unable to normalize promoted CRM lead ${input.crmLeadId}: ${error.message}`)
    }
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from('crm_leads')
    .select('id, stage, is_archived')
    .eq('id', input.crmLeadId)
    .single<{ id: string; stage: string | null; is_archived: boolean }>()

  if (refreshError || !refreshed) {
    throw new Error(
      `Promoted CRM lead ${input.crmLeadId} could not be verified after normalization: ${
        refreshError?.message ?? 'missing row'
      }`
    )
  }

  if (refreshed.is_archived) {
    throw new Error(`Promoted CRM lead ${input.crmLeadId} is still archived after normalization`)
  }

  if (input.expectedStage && refreshed.stage !== input.expectedStage) {
    throw new Error(
      `Promoted CRM lead ${input.crmLeadId} did not persist expected stage "${input.expectedStage}"`
    )
  }

  const { data: rawLeadRow, error: rawLeadError } = await supabase
    .from('dialer_raw_leads')
    .select('promoted_to_crm_lead_id')
    .eq('id', input.rawLeadId)
    .single<{ promoted_to_crm_lead_id: string | null }>()

  if (rawLeadError || !rawLeadRow) {
    throw new Error(`Unable to verify raw dialer lead linkage for ${input.rawLeadId}`)
  }

  if (rawLeadRow.promoted_to_crm_lead_id !== input.crmLeadId) {
    const { error } = await supabase
      .from('dialer_raw_leads')
      .update({
        promoted_to_crm_at: new Date().toISOString(),
        promoted_to_crm_lead_id: input.crmLeadId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.rawLeadId)

    if (error) {
      throw new Error(`Unable to repair raw lead promotion link ${input.rawLeadId}: ${error.message}`)
    }
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
    .or(`phone_e164.eq.${rawLead.phone_e164 || rawLead.phone},phone.eq.${rawLead.phone}`)
    .maybeSingle()

  let crmLeadId: string
  let merged = false

  if (existing) {
    // Merge with existing
    const { data: updated, error: updateError } = await supabase
      .from('crm_leads')
      .update({
        first_name: rawLead.first_name || existing.first_name,
        last_name: rawLead.last_name || existing.last_name,
        email: rawLead.email || existing.email,
        business_name: rawLead.business_name || existing.business_name,
        notes: existing.notes 
          ? `${existing.notes}\n\n[From Dialer]\n${rawLead.notes || ''}`
          : rawLead.notes,
        is_archived: false,
        stage: existing.stage === 'new' ? 'contacted' : existing.stage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .single()

    if (updateError || !updated?.id) {
      throw new Error(
        `Dialer promotion fallback could not merge CRM lead ${existing.id}: ${
          updateError?.message ?? 'missing updated row'
        }`
      )
    }

    crmLeadId = updated.id
    merged = true
  } else {
    // Create new CRM lead
    const { data: created, error: createError } = await supabase
      .from('crm_leads')
      .insert({
        first_name: rawLead.first_name || '',
        last_name: rawLead.last_name || '',
        phone: rawLead.phone,
        phone_e164: rawLead.phone_e164 || rawLead.phone,
        email: rawLead.email,
        business_name: rawLead.business_name,
        notes: rawLead.notes,
        source: normalizeCrmSource(rawLead.source),
        stage: 'contacted',
        is_archived: false,
      })
      .select('id')
      .single()

    if (createError || !created?.id) {
      throw new Error(
        `Dialer promotion fallback could not create CRM lead: ${
          createError?.message ?? 'missing created row'
        }`
      )
    }

    crmLeadId = created.id
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
