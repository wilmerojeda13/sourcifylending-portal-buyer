import type { createServiceClient } from '@/lib/supabase/server'
import { createCrmAuditLog, appendCrmActivity } from '@/lib/crm-audit'
import { assignCrmTags, unassignCrmTags, type CRMTagEntityType } from '@/lib/crm-tags'
import { applyCrmDisposition, type CRMDispositionKey } from '@/lib/crm-dispositions'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export interface BulkActionResult {
  processedIds: string[]
  failedIds: string[]
  failedCount: number
  partial: boolean
  errors: string[]
}

function buildBulkResult(processedIds: string[], failedIds: string[], errors: string[] = []): BulkActionResult {
  return {
    processedIds,
    failedIds,
    failedCount: failedIds.length,
    partial: failedIds.length > 0,
    errors,
  }
}

async function loadExistingIds(supabase: ServiceClient, table: 'crm_leads' | 'crm_tasks', ids: string[]) {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .in('id', ids)

  if (error) throw error
  return new Set((data ?? []).map((row) => row.id as string))
}

export async function bulkAssignTags(
  supabase: ServiceClient,
  input: {
    entityType: CRMTagEntityType
    entityIds: string[]
    tagIds: string[]
    actorUserId?: string | null
    actorName: string
  },
) {
  await assignCrmTags(supabase, {
    entityType: input.entityType,
    entityIds: input.entityIds,
    tagIds: input.tagIds,
    createdByUserId: input.actorUserId || null,
    createdByName: input.actorName,
  })

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_tags_added',
    entityType: input.entityType,
    entityIds: input.entityIds,
    summary: `Added ${input.tagIds.length} tag(s) to ${input.entityIds.length} ${input.entityType} record(s)`,
    details: {
      tag_ids: input.tagIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  return buildBulkResult(input.entityIds, [])
}

export async function bulkRemoveTags(
  supabase: ServiceClient,
  input: {
    entityType: CRMTagEntityType
    entityIds: string[]
    tagIds: string[]
    actorUserId?: string | null
    actorName: string
  },
) {
  await unassignCrmTags(supabase, {
    entityType: input.entityType,
    entityIds: input.entityIds,
    tagIds: input.tagIds,
  })

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_tags_removed',
    entityType: input.entityType,
    entityIds: input.entityIds,
    summary: `Removed ${input.tagIds.length} tag(s) from ${input.entityIds.length} ${input.entityType} record(s)`,
    details: {
      tag_ids: input.tagIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  return buildBulkResult(input.entityIds, [])
}

export async function bulkUpdateLeadStage(
  supabase: ServiceClient,
  input: {
    ids: string[]
    stage: string
    actorUserId?: string | null
    actorName: string
  },
) {
  const existingIds = await loadExistingIds(supabase, 'crm_leads', input.ids)
  const processedIds = input.ids.filter((id) => existingIds.has(id))
  const failedIds = input.ids.filter((id) => !existingIds.has(id))

  if (processedIds.length > 0) {
    const { error } = await supabase
      .from('crm_leads')
      .update({
        stage: input.stage,
        updated_at: new Date().toISOString(),
      })
      .in('id', processedIds)

    if (error) throw error
  }

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_stage_changed',
    entityType: 'lead',
    entityIds: processedIds,
    summary: `Moved ${processedIds.length} lead(s) to ${input.stage}`,
    details: {
      stage: input.stage,
      failed_ids: failedIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  return buildBulkResult(processedIds, failedIds)
}

export async function bulkArchiveLeads(
  supabase: ServiceClient,
  input: {
    ids: string[]
    actorUserId?: string | null
    actorName: string
  },
) {
  const existingIds = await loadExistingIds(supabase, 'crm_leads', input.ids)
  const processedIds = input.ids.filter((id) => existingIds.has(id))
  const failedIds = input.ids.filter((id) => !existingIds.has(id))

  if (processedIds.length > 0) {
    const { error } = await supabase
      .from('crm_leads')
      .update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .in('id', processedIds)

    if (error) throw error
  }

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_archive',
    entityType: 'lead',
    entityIds: processedIds,
    summary: `Archived ${processedIds.length} lead(s)`,
    details: {
      failed_ids: failedIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  return buildBulkResult(processedIds, failedIds)
}

export async function bulkDeleteLeads(
  supabase: ServiceClient,
  input: {
    ids: string[]
    actorUserId?: string | null
    actorName: string
  },
) {
  const existingIds = await loadExistingIds(supabase, 'crm_leads', input.ids)
  const processedIds = input.ids.filter((id) => existingIds.has(id))
  const failedIds = input.ids.filter((id) => !existingIds.has(id))

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_delete',
    entityType: 'lead',
    entityIds: processedIds,
    summary: `Deleted ${processedIds.length} lead(s)`,
    details: {
      failed_ids: failedIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  if (processedIds.length > 0) {
    const { error } = await supabase
      .from('crm_leads')
      .delete()
      .in('id', processedIds)

    if (error) throw error
  }

  return buildBulkResult(processedIds, failedIds)
}

export async function bulkAssignLeadOwner(
  supabase: ServiceClient,
  input: {
    ids: string[]
    ownerUserId: string | null
    ownerName: string | null
    actorUserId?: string | null
    actorName: string
  },
) {
  const existingIds = await loadExistingIds(supabase, 'crm_leads', input.ids)
  const processedIds = input.ids.filter((id) => existingIds.has(id))
  const failedIds = input.ids.filter((id) => !existingIds.has(id))

  if (processedIds.length > 0) {
    const { error } = await supabase
      .from('crm_leads')
      .update({
        assigned_to_user_id: input.ownerUserId,
        assigned_to_name: input.ownerName,
        updated_at: new Date().toISOString(),
      })
      .in('id', processedIds)

    if (error) throw error
  }

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_owner_changed',
    entityType: 'lead',
    entityIds: processedIds,
    summary: `Assigned ${processedIds.length} lead(s) to ${input.ownerName ?? 'Unassigned'}`,
    details: {
      owner_user_id: input.ownerUserId,
      owner_name: input.ownerName,
      failed_ids: failedIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  return buildBulkResult(processedIds, failedIds)
}

export async function bulkDispositionLeads(
  supabase: ServiceClient,
  input: {
    ids: string[]
    dispositionKey: CRMDispositionKey
    note?: string | null
    followUpAt?: string | null
    actorUserId?: string | null
    actorName: string
  },
) {
  const processedIds: string[] = []
  const failedIds: string[] = []
  const errors: string[] = []

  for (const leadId of input.ids) {
    try {
      await applyCrmDisposition(supabase, {
        leadId,
        dispositionKey: input.dispositionKey,
        note: input.note,
        followUpAt: input.followUpAt,
        actorUserId: input.actorUserId || null,
        actorName: input.actorName,
      })
      processedIds.push(leadId)
    } catch (error) {
      failedIds.push(leadId)
      errors.push(error instanceof Error ? error.message : 'Failed to save disposition.')
    }
  }

  return buildBulkResult(processedIds, failedIds, errors)
}

export async function bulkCompleteTasks(
  supabase: ServiceClient,
  input: {
    ids: string[]
    actorUserId?: string | null
    actorName: string
  },
) {
  const { data: tasks, error: loadError } = await supabase
    .from('crm_tasks')
    .select('id, lead_id, title')
    .in('id', input.ids)

  if (loadError) throw loadError

  const processedIds = (tasks ?? []).map((task) => task.id as string)
  const failedIds = input.ids.filter((id) => !processedIds.includes(id))

  if (processedIds.length > 0) {
    const { error } = await supabase
      .from('crm_tasks')
      .update({
        status: 'Done',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', processedIds)

    if (error) throw error
  }

  for (const task of tasks ?? []) {
    if (!task.lead_id) continue
    await appendCrmActivity(supabase, {
      leadId: task.lead_id as string,
      type: 'note',
      body: `Task completed: ${task.title as string}`,
      metadata: {
        task_id: task.id,
      },
      createdBy: input.actorName,
    })
  }

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_complete',
    entityType: 'task',
    entityIds: processedIds,
    summary: `Completed ${processedIds.length} task(s)`,
    details: {
      failed_ids: failedIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  return buildBulkResult(processedIds, failedIds)
}

export async function bulkDeleteTasks(
  supabase: ServiceClient,
  input: {
    ids: string[]
    actorUserId?: string | null
    actorName: string
  },
) {
  const existingIds = await loadExistingIds(supabase, 'crm_tasks', input.ids)
  const processedIds = input.ids.filter((id) => existingIds.has(id))
  const failedIds = input.ids.filter((id) => !existingIds.has(id))

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_delete',
    entityType: 'task',
    entityIds: processedIds,
    summary: `Deleted ${processedIds.length} task(s)`,
    details: {
      failed_ids: failedIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  if (processedIds.length > 0) {
    const { error } = await supabase
      .from('crm_tasks')
      .delete()
      .in('id', processedIds)

    if (error) throw error
  }

  return buildBulkResult(processedIds, failedIds)
}

export async function bulkAssignTasks(
  supabase: ServiceClient,
  input: {
    ids: string[]
    ownerUserId: string | null
    ownerName: string | null
    actorUserId?: string | null
    actorName: string
  },
) {
  const existingIds = await loadExistingIds(supabase, 'crm_tasks', input.ids)
  const processedIds = input.ids.filter((id) => existingIds.has(id))
  const failedIds = input.ids.filter((id) => !existingIds.has(id))

  if (processedIds.length > 0) {
    const { error } = await supabase
      .from('crm_tasks')
      .update({
        owner_user_id: input.ownerUserId,
        owner_name: input.ownerName,
        updated_at: new Date().toISOString(),
      })
      .in('id', processedIds)

    if (error) throw error
  }

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_owner_changed',
    entityType: 'task',
    entityIds: processedIds,
    summary: `Assigned ${processedIds.length} task(s) to ${input.ownerName ?? 'Unassigned'}`,
    details: {
      owner_user_id: input.ownerUserId,
      owner_name: input.ownerName,
      failed_ids: failedIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  return buildBulkResult(processedIds, failedIds)
}

export async function bulkUpdateTaskDueDate(
  supabase: ServiceClient,
  input: {
    ids: string[]
    dueAt: string | null
    actorUserId?: string | null
    actorName: string
  },
) {
  const existingIds = await loadExistingIds(supabase, 'crm_tasks', input.ids)
  const processedIds = input.ids.filter((id) => existingIds.has(id))
  const failedIds = input.ids.filter((id) => !existingIds.has(id))

  if (processedIds.length > 0) {
    const { error } = await supabase
      .from('crm_tasks')
      .update({
        due_at: input.dueAt,
        updated_at: new Date().toISOString(),
      })
      .in('id', processedIds)

    if (error) throw error
  }

  await createCrmAuditLog(supabase, {
    actionType: 'bulk_due_date_changed',
    entityType: 'task',
    entityIds: processedIds,
    summary: `Updated due date on ${processedIds.length} task(s)`,
    details: {
      due_at: input.dueAt,
      failed_ids: failedIds,
    },
    performedByUserId: input.actorUserId || null,
    performedByName: input.actorName,
  })

  return buildBulkResult(processedIds, failedIds)
}
