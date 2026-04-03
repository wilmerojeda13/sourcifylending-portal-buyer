'use client'

import {
  addConflict,
  enqueueMutation,
  getOfflineLead,
  getOfflineMeta,
  listPendingMutations,
  removeMutation,
  updateMutation,
  updateOfflineMeta,
  upsertOfflineCall,
  upsertOfflineLead,
  upsertOfflineTask,
} from '@/lib/offline-crm-db'
import type {
  OfflineBootstrapResponse,
  OfflineCall,
  OfflineConflictLog,
  OfflineLead,
  OfflineMutationEntity,
  OfflineSyncMutation,
  OfflineSyncResponseItem,
  OfflineTask,
} from '@/lib/offline-crm-types'

export function createLocalId(prefix: string) {
  return `local-${prefix}-${crypto.randomUUID()}`
}

export function isProbablyOnline(forceOffline: boolean) {
  return !forceOffline && typeof navigator !== 'undefined' && navigator.onLine
}

function buildMutation(entity: OfflineMutationEntity, action: 'upsert' | 'create', recordId: string, payload: Record<string, unknown>, baseUpdatedAt: string | null) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    entity,
    action,
    record_id: recordId,
    base_updated_at: baseUpdatedAt,
    local_updated_at: now,
    payload,
    attempts: 0,
    status: 'pending',
    created_at: now,
    updated_at: now,
  } satisfies OfflineSyncMutation
}

export async function bootstrapOfflineCRM() {
  const response = await fetch('/api/admin/crm/offline/bootstrap', { cache: 'no-store' })
  if (!response.ok) {
    const json = await response.json().catch(() => ({ error: 'Unable to load CRM snapshot.' }))
    throw new Error(json.error ?? 'Unable to load CRM snapshot.')
  }
  return response.json() as Promise<OfflineBootstrapResponse>
}

export async function queueLeadUpdate(
  existing: OfflineLead,
  patch: Partial<OfflineLead>,
) {
  const now = new Date().toISOString()
  const nextLead: OfflineLead = {
    ...existing,
    ...patch,
    updated_at: now,
    local_updated_at: now,
    pending_sync: true,
    sync_state: 'pending',
    conflict_note: null,
  }
  await upsertOfflineLead(nextLead)
  await enqueueMutation(buildMutation('lead', 'upsert', existing.id, patch as Record<string, unknown>, existing.server_updated_at ?? existing.updated_at ?? null))
  return nextLead
}

export async function queueTaskUpsert(task: OfflineTask, isCreate = false) {
  const now = new Date().toISOString()
  const nextTask: OfflineTask = {
    ...task,
    updated_at: now,
    local_updated_at: now,
    pending_sync: true,
    sync_state: 'pending',
    client_mutation_id: task.client_mutation_id ?? crypto.randomUUID(),
  }
  await upsertOfflineTask(nextTask)
  await enqueueMutation(buildMutation('task', isCreate ? 'create' : 'upsert', nextTask.id, nextTask as unknown as Record<string, unknown>, task.server_updated_at ?? task.updated_at ?? null))
  return nextTask
}

export async function queueCallWithLeadUpdate(call: OfflineCall, leadPatch: Partial<OfflineLead>) {
  const now = new Date().toISOString()
  const nextCall: OfflineCall = {
    ...call,
    updated_at: now,
    local_updated_at: now,
    pending_sync: true,
    sync_state: 'pending',
    client_mutation_id: call.client_mutation_id ?? crypto.randomUUID(),
  }
  await upsertOfflineCall(nextCall)
  await enqueueMutation(buildMutation('call', 'create', nextCall.id, nextCall as unknown as Record<string, unknown>, null))

  const existingLead = await getOfflineLead(call.lead_id)
  if (existingLead) {
    await queueLeadUpdate(existingLead, leadPatch)
  }
  return nextCall
}

async function handleSyncConflict(item: OfflineSyncResponseItem) {
  const conflict: OfflineConflictLog = {
    id: crypto.randomUUID(),
    entity: item.entity,
    record_id: item.local_id,
    mutation_id: item.mutation_id,
    message: item.message ?? 'Sync conflict detected.',
    resolved_in_favor: item.resolved_in_favor === 'local' ? 'local' : 'server',
    server_record: item.server_record ?? null,
    local_payload: item.record ?? null,
    created_at: new Date().toISOString(),
  }
  await addConflict(conflict)
}

function normalizeLead(record: Record<string, unknown>) {
  return {
    ...(record as unknown as OfflineLead),
    sync_state: 'synced',
    pending_sync: false,
    local_updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    conflict_note: null,
  } satisfies OfflineLead
}

function normalizeTask(record: Record<string, unknown>) {
  return {
    ...(record as unknown as OfflineTask),
    sync_state: 'synced',
    pending_sync: false,
    local_updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    conflict_note: null,
  } satisfies OfflineTask
}

function normalizeCall(record: Record<string, unknown>) {
  return {
    ...(record as unknown as OfflineCall),
    sync_state: 'synced',
    pending_sync: false,
    local_updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    conflict_note: null,
  } satisfies OfflineCall
}

export async function runOfflineCRMSync() {
  const meta = await getOfflineMeta()
  if (!isProbablyOnline(Boolean(meta.force_offline))) {
    return { synced: 0, conflicts: 0, failed: 0, skipped: true }
  }

  const mutations = await listPendingMutations()
  if (mutations.length === 0) {
    await updateOfflineMeta({ last_sync_at: new Date().toISOString(), last_sync_error: null })
    return { synced: 0, conflicts: 0, failed: 0, skipped: false }
  }

  const response = await fetch('/api/admin/crm/offline/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: meta.device_id,
      mutations,
    }),
  })

  if (!response.ok) {
    const json = await response.json().catch(() => ({ error: 'Sync failed.' }))
    const error = json.error ?? 'Sync failed.'
    await updateOfflineMeta({ last_sync_error: error })
    throw new Error(error)
  }

  const json = await response.json() as { results: OfflineSyncResponseItem[] }

  let synced = 0
  let conflicts = 0
  let failed = 0

  for (const item of json.results) {
    const mutation = mutations.find((entry) => entry.id === item.mutation_id)
    if (!mutation) continue

    if (item.status === 'synced') {
      synced += 1
      await removeMutation(item.mutation_id)
      if (item.entity === 'lead' && item.record) {
        await upsertOfflineLead(normalizeLead(item.record))
      }
      if (item.entity === 'task' && item.record) {
        await upsertOfflineTask(normalizeTask(item.record))
      }
      if (item.entity === 'call' && item.record) {
        await upsertOfflineCall(normalizeCall(item.record))
      }
      continue
    }

    if (item.status === 'conflict') {
      conflicts += 1
      await removeMutation(item.mutation_id)
      await handleSyncConflict(item)
      if (item.entity === 'lead' && item.server_record) {
        await upsertOfflineLead({
          ...normalizeLead(item.server_record),
          sync_state: 'conflict',
          conflict_note: item.message ?? 'Server retained a newer version of this lead.',
        })
      }
      if (item.entity === 'task' && item.server_record) {
        await upsertOfflineTask({
          ...normalizeTask(item.server_record),
          sync_state: 'conflict',
          conflict_note: item.message ?? 'Server retained a newer version of this task.',
        })
      }
      continue
    }

    failed += 1
    await updateMutation({
      ...mutation,
      status: 'failed',
      attempts: mutation.attempts + 1,
      updated_at: new Date().toISOString(),
      last_error: item.message ?? 'Sync failed.',
    })
  }

  await updateOfflineMeta({
    last_sync_at: new Date().toISOString(),
    last_sync_error: failed > 0 ? 'Some records still need to sync.' : null,
  })

  return { synced, conflicts, failed, skipped: false }
}
