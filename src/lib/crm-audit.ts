import type { createServiceClient } from '@/lib/supabase/server'
import { isMissingRelationError } from '@/lib/supabase-schema'

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
): Promise<{ success: boolean; warning?: string }> {
  try {
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

    if (error) {
      if (isMissingRelationError(error, 'crm_audit_logs')) {
        console.warn('[Audit] crm_audit_logs table not available')
        return { success: false, warning: 'crm_audit_logs_unavailable' }
      }
      console.error('[Audit] Failed to create audit log:', error)
      throw error
    }
    return { success: true }
  } catch (error) {
    if (isMissingRelationError(error as { code?: string | null; message?: string | null; details?: string | null }, 'crm_audit_logs')) {
      console.warn('[Audit] crm_audit_logs table not available')
      return { success: false, warning: 'crm_audit_logs_unavailable' }
    }
    throw error
  }
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
): Promise<{ success: boolean; warning?: string }> {
  try {
    const { error } = await supabase
      .from('crm_activities')
      .insert({
        lead_id: input.leadId,
        type: input.type,
        body: input.body?.trim() || null,
        metadata: input.metadata ?? {},
        created_by: input.createdBy,
      })

    if (error) {
      if (isMissingRelationError(error, 'crm_activities')) {
        console.warn('[Activity] crm_activities table not available')
        return { success: false, warning: 'crm_activities_unavailable' }
      }
      console.error('[Activity] Failed to append activity:', error)
      throw error
    }
    return { success: true }
  } catch (error) {
    if (isMissingRelationError(error as { code?: string | null; message?: string | null; details?: string | null }, 'crm_activities')) {
      console.warn('[Activity] crm_activities table not available')
      return { success: false, warning: 'crm_activities_unavailable' }
    }
    throw error
  }
}
