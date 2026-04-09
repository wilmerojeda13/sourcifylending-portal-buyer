import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export async function createCrmAuditLog(
  supabase: ServiceClient,
  input: {
    actionType: string
    entityType: string
    entityIds: string[]
    summary: string
    details?: Record<string, unknown>
    performedByUserId?: string | null
    performedByName?: string | null
  },
) {
  const { error } = await supabase
    .from('crm_audit_logs')
    .insert({
      action_type: input.actionType,
      entity_type: input.entityType,
      entity_ids: input.entityIds,
      summary: input.summary,
      details: input.details ?? {},
      performed_by_user_id: input.performedByUserId || null,
      performed_by_name: input.performedByName || null,
    })

  if (error) throw error
}

export async function appendCrmActivity(
  supabase: ServiceClient,
  input: {
    leadId: string
    type: string
    body?: string | null
    metadata?: Record<string, unknown>
    createdBy: string
  },
) {
  const { error } = await supabase
    .from('crm_activities')
    .insert({
      lead_id: input.leadId,
      type: input.type,
      body: input.body?.trim() || null,
      metadata: input.metadata ?? {},
      created_by: input.createdBy,
    })

  if (error) throw error
}
