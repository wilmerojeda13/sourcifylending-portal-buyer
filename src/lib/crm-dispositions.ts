import type { createServiceClient } from '@/lib/supabase/server'
import {
  applyDispositionEligibilityUpdates,
  isDNCDisposition,
} from '@/lib/crm-dialer-eligibility'
import { probabilityFromTemperature } from '@/lib/crm'
import { appendCrmActivity, createCrmAuditLog } from '@/lib/crm-audit'
import { assignCrmTags } from '@/lib/crm-tags'
import { isMissingRelationError } from '@/lib/supabase-schema'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

type CRMDispositionEntry = {
  key: string
  label: string
  outcome: string
  stage?: string
  appointment?: boolean
  requiresFollowUpAt?: boolean
  taskType?: string
  terminal?: boolean
}

export const CRM_DISPOSITIONS: readonly CRMDispositionEntry[] = [
  {
    key: 'interested',
    label: 'Interested',
    outcome: 'Interested',
    stage: 'interested',
  },
  {
    key: 'appointment_set',
    label: 'Appointment Set',
    outcome: 'Appointment Set',
    stage: 'qualified',
    appointment: true,
  },
  {
    key: 'booked_call',
    label: 'Booked Call',
    outcome: 'Booked Call',
    stage: 'qualified',
    appointment: true,
  },
  {
    key: 'follow_up',
    label: 'Follow Up',
    outcome: 'Follow Up',
    stage: 'follow_up',
    requiresFollowUpAt: true,
    taskType: 'Follow-Up',
  },
  {
    key: 'call_back',
    label: 'Call Back',
    outcome: 'Call Back',
    stage: 'callback',
    requiresFollowUpAt: true,
    taskType: 'Callback',
  },
  {
    key: 'call_back_later',
    label: 'Call Back Later',
    outcome: 'Call Back Later',
    stage: 'callback',
    requiresFollowUpAt: true,
    taskType: 'Callback',
  },
  {
    key: 'voicemail',
    label: 'Voicemail',
    outcome: 'Voicemail',
  },
  {
    key: 'left_voicemail',
    label: 'Left Voicemail',
    outcome: 'Left Voicemail',
  },
  {
    key: 'no_answer',
    label: 'No Answer',
    outcome: 'No Answer',
  },
  {
    key: 'busy',
    label: 'Busy',
    outcome: 'Busy',
  },
  {
    key: 'bad_number',
    label: 'Bad Number',
    outcome: 'Bad Number',
    stage: 'closed_lost',
    terminal: true,
  },
  {
    key: 'not_interested',
    label: 'Not Interested',
    outcome: 'Not Interested',
    stage: 'closed_lost',
    terminal: true,
  },
  {
    key: 'dnc',
    label: 'DNC / Remove',
    outcome: 'Do Not Call',
    stage: 'closed_lost',
    terminal: true,
  },
  {
    key: 'closed_won',
    label: 'Closed Won',
    outcome: 'Closed Won',
    stage: 'closed_won',
    terminal: true,
  },
  {
    key: 'closed_lost',
    label: 'Closed Lost',
    outcome: 'Closed Lost',
    stage: 'closed_lost',
    terminal: true,
  },
] as const

export type CRMDispositionKey = typeof CRM_DISPOSITIONS[number]['key']
export type CRMDispositionDefinition = typeof CRM_DISPOSITIONS[number]

export function getCrmDispositionDefinition(key: CRMDispositionKey) {
  const disposition = CRM_DISPOSITIONS.find((item) => item.key === key)
  if (!disposition) {
    throw new Error(`Unknown disposition: ${key}`)
  }
  return disposition
}

export function getDispositionKeyForOutcome(outcome: string): CRMDispositionKey | null {
  const disposition = CRM_DISPOSITIONS.find((item) => item.outcome === outcome)
  return disposition?.key ?? null
}

function buildDispositionTaskTitle(definition: CRMDispositionDefinition, leadName: string) {
  if (definition.key === 'call_back' || definition.key === 'call_back_later') return `Call back ${leadName}`
  if (definition.key === 'follow_up') return `Follow up with ${leadName}`
  return `${definition.label}: ${leadName}`
}

export async function applyCrmDisposition(
  supabase: ServiceClient,
  input: {
    leadId: string
    dispositionKey: CRMDispositionKey
    note?: string | null
    followUpAt?: string | null
    callId?: string | null
    leadTemperature?: 'cold' | 'warm' | 'hot' | null
    strategyCallBooked?: boolean
    convertedToClient?: boolean
    actorUserId?: string | null
    actorName: string
    createFollowUpTask?: boolean
  },
) {
  const definition = getCrmDispositionDefinition(input.dispositionKey)
  const nowIso = new Date().toISOString()
  const trimmedNote = input.note?.trim() || null
  const warnings: string[] = []

  if (definition.requiresFollowUpAt && !input.followUpAt) {
    throw new Error(`${definition.label} requires a follow-up date and time.`)
  }

  const { data: lead, error: leadError } = await supabase
    .from('crm_leads')
    .select('id, first_name, last_name, business_name, lead_temperature, assigned_to_user_id, assigned_to_name')
    .eq('id', input.leadId)
    .single<{
      id: string
      first_name: string
      last_name: string
      business_name: string | null
      lead_temperature: 'cold' | 'warm' | 'hot' | null
      assigned_to_user_id: string | null
      assigned_to_name: string | null
    }>()

  if (leadError || !lead) {
    throw leadError ?? new Error('Lead not found.')
  }

  const temperature = input.leadTemperature ?? lead.lead_temperature ?? 'cold'
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.business_name || 'lead'
  const eligibilityUpdates = applyDispositionEligibilityUpdates(
    definition.outcome,
    definition.key === 'follow_up' ? input.followUpAt : null,
    definition.key === 'call_back' || definition.key === 'call_back_later' ? input.followUpAt : null,
    definition.appointment ? input.followUpAt : null,
  )

  const leadUpdate: Record<string, unknown> = {
    ...eligibilityUpdates,
    last_contacted_at: nowIso,
    last_call_at: nowIso,
    last_call_outcome: definition.outcome,
    latest_call_note: trimmedNote,
    lead_temperature: temperature,
    close_probability: probabilityFromTemperature(temperature),
    strategy_call_booked: Boolean(input.strategyCallBooked || definition.appointment),
    converted_to_client: Boolean(input.convertedToClient),
    updated_at: nowIso,
  }
  if (definition.stage ?? eligibilityUpdates.stage) {
    leadUpdate.stage = definition.stage ?? eligibilityUpdates.stage
  }

  const { data: updatedLead, error: updateError } = await supabase
    .from('crm_leads')
    .update(leadUpdate)
    .eq('id', input.leadId)
    .select('*')
    .single()

  if (updateError) throw updateError

  // DEBUGGING: Verify the disposition was actually saved
  // This prevents silent drift where the update appears to succeed but data is wrong
  if (updatedLead && updatedLead.last_call_outcome !== definition.outcome) {
    console.error('[Disposition] CRITICAL: Disposition mismatch!')
    console.error('[Disposition] Expected:', definition.outcome)
    console.error('[Disposition] Got:', updatedLead.last_call_outcome)
    console.error('[Disposition] Full updated record:', updatedLead)
    throw new Error(`Disposition sync verification failed: expected '${definition.outcome}' but got '${updatedLead.last_call_outcome}'`)
  }

  let updatedCall: Record<string, unknown> | null = null
  if (input.callId) {
    const { data: call, error: callError } = await supabase
      .from('crm_calls')
      .update({
        call_outcome: definition.outcome,
        call_status: 'completed',
        notes: trimmedNote,
        next_follow_up_at: input.followUpAt || null,
        lead_temperature: temperature,
        strategy_call_booked: Boolean(input.strategyCallBooked || definition.appointment),
        converted_to_client: Boolean(input.convertedToClient),
        call_ended_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', input.callId)
      .select('*')
      .maybeSingle()

    if (callError) throw callError
    updatedCall = call ?? null
  }

  let followUpTask: Record<string, unknown> | null = null
  if (input.followUpAt && (definition.requiresFollowUpAt || input.createFollowUpTask !== false)) {
    const { data: task, error: taskError } = await supabase
      .from('crm_tasks')
      .insert({
        lead_id: input.leadId,
        related_call_id: input.callId || null,
        title: buildDispositionTaskTitle(definition, leadName),
        description: trimmedNote,
        task_type: definition.taskType || 'Follow-Up',
        priority: definition.key === 'call_back' || definition.key === 'call_back_later' ? 'Urgent' : 'High',
        status: 'To Do',
        due_at: input.followUpAt,
        owner_user_id: lead.assigned_to_user_id || input.actorUserId || null,
        owner_name: lead.assigned_to_name || input.actorName,
        pipeline_stage: definition.stage ?? null,
        notes: trimmedNote,
        created_by_user_id: input.actorUserId || null,
        created_source: 'disposition',
        created_source_label: `Disposition: ${definition.label}`,
        source_metadata: {
          disposition: definition.outcome,
          disposition_key: definition.key,
        },
      })
      .select('*')
      .single()

    if (taskError) {
      if (isMissingRelationError(taskError, 'crm_tasks')) {
        warnings.push('crm_tasks_unavailable')
      } else {
        throw taskError
      }
    }
    followUpTask = task ?? null
  }

  try {
    await appendCrmActivity(supabase, {
      leadId: input.leadId,
      type: 'disposition',
      body: `${definition.label}${trimmedNote ? ` — ${trimmedNote}` : ''}`,
      metadata: {
        disposition: definition.outcome,
        disposition_key: definition.key,
        note: trimmedNote,
        follow_up_at: input.followUpAt || null,
        call_id: input.callId || null,
        task_id: followUpTask?.id ?? null,
      },
      createdBy: input.actorName,
    })
  } catch (error) {
    if (isMissingRelationError(error as { code?: string | null; message?: string | null; details?: string | null }, 'crm_activities')) {
      warnings.push('crm_activities_unavailable')
    } else {
      throw error
    }
  }

  try {
    await createCrmAuditLog(supabase, {
      actionType: 'disposition_changed',
      entityType: 'lead',
      entityIds: [input.leadId],
      summary: `${definition.label} set for ${leadName}`,
      details: {
        disposition: definition.outcome,
        note: trimmedNote,
        follow_up_at: input.followUpAt || null,
        call_id: input.callId || null,
        task_id: followUpTask?.id ?? null,
      },
      performedByUserId: input.actorUserId || null,
      performedByName: input.actorName,
    })
  } catch (error) {
    if (isMissingRelationError(error as { code?: string | null; message?: string | null; details?: string | null }, 'crm_audit_logs')) {
      warnings.push('crm_audit_logs_unavailable')
    } else {
      throw error
    }
  }

  if (isDNCDisposition(definition.outcome)) {
    const { data: dncTags } = await supabase
      .from('crm_tags')
      .select('id')
      .in('slug', ['dnc', 'do-not-call'])
      .is('deleted_at', null)

    const dncTagIds = (dncTags ?? []).map((tag) => tag.id as string)
    if (dncTagIds.length > 0) {
      try {
        await assignCrmTags(supabase, {
          tagIds: dncTagIds,
          entityType: 'lead',
          entityIds: [input.leadId],
          createdByUserId: input.actorUserId || null,
          createdByName: input.actorName,
        })
      } catch (error) {
        if (
          isMissingRelationError(error as { code?: string | null; message?: string | null; details?: string | null }, 'crm_tag_links')
          || isMissingRelationError(error as { code?: string | null; message?: string | null; details?: string | null }, 'crm_tags')
        ) {
          warnings.push('crm_tags_unavailable')
        } else {
          throw error
        }
      }
    }
  }

  return {
    lead: updatedLead,
    call: updatedCall,
    task: followUpTask,
    disposition: definition,
    warnings,
  }
}
