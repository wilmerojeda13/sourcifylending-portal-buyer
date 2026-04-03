'use client'

import type {
  OfflineCall,
  OfflineConflictLog,
  OfflineLead,
  OfflineSnapshotMeta,
  OfflineSyncMutation,
  OfflineTask,
} from '@/lib/offline-crm-types'

const DB_NAME = 'sourcify-offline-crm'
const DB_VERSION = 1
const META_KEY = 'offline-meta'

type StoreName = 'leads' | 'tasks' | 'calls' | 'queue' | 'conflicts' | 'meta'

function assertIndexedDbAvailable() {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('Offline CRM storage is not available in this browser context.')
  }
}

function promisify<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function openOfflineCRMDb() {
  assertIndexedDbAvailable()
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('leads')) db.createObjectStore('leads', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('calls')) db.createObjectStore('calls', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openOfflineCRMDb()
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  const records = await promisify(store.getAll() as IDBRequest<T[]>)
  db.close()
  return records
}

async function putMany<T extends { id?: string }>(storeName: StoreName, records: T[]) {
  const db = await openOfflineCRMDb()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  for (const record of records) {
    store.put(record)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function putRecord<T>(storeName: StoreName, record: T) {
  const db = await openOfflineCRMDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).put(record)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function deleteRecord(storeName: StoreName, id: string) {
  const db = await openOfflineCRMDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function getRecord<T>(storeName: StoreName, id: string): Promise<T | null> {
  const db = await openOfflineCRMDb()
  const tx = db.transaction(storeName, 'readonly')
  const record = await promisify(tx.objectStore(storeName).get(id) as IDBRequest<T | undefined>)
  db.close()
  return record ?? null
}

export async function getOfflineMeta(): Promise<OfflineSnapshotMeta> {
  const meta = await getRecord<{ key: string; value: OfflineSnapshotMeta }>('meta', META_KEY)
  return meta?.value ?? { device_id: crypto.randomUUID(), force_offline: false, local_auth_enabled: false }
}

export async function updateOfflineMeta(patch: Partial<OfflineSnapshotMeta>) {
  const current = await getOfflineMeta()
  const next = { ...current, ...patch }
  await putRecord('meta', { key: META_KEY, value: next })
  return next
}

export async function replaceOfflineSnapshot(input: {
  leads: OfflineLead[]
  tasks: OfflineTask[]
  calls: OfflineCall[]
  generatedAt: string
}) {
  const [currentLeads, currentTasks, currentCalls] = await Promise.all([
    readAll<OfflineLead>('leads'),
    readAll<OfflineTask>('tasks'),
    readAll<OfflineCall>('calls'),
  ])

  const pendingLeadIds = new Set(currentLeads.filter((record) => record.pending_sync).map((record) => record.id))
  const pendingTaskIds = new Set(currentTasks.filter((record) => record.pending_sync).map((record) => record.id))
  const pendingCallIds = new Set(currentCalls.filter((record) => record.pending_sync).map((record) => record.id))

  const mergedLeads = [
    ...input.leads.filter((lead) => !pendingLeadIds.has(lead.id)),
    ...currentLeads.filter((lead) => pendingLeadIds.has(lead.id)),
  ]
  const mergedTasks = [
    ...input.tasks.filter((task) => !pendingTaskIds.has(task.id)),
    ...currentTasks.filter((task) => pendingTaskIds.has(task.id)),
  ]
  const mergedCalls = [
    ...input.calls.filter((call) => !pendingCallIds.has(call.id)),
    ...currentCalls.filter((call) => pendingCallIds.has(call.id)),
  ]

  await Promise.all([
    putMany('leads', mergedLeads),
    putMany('tasks', mergedTasks),
    putMany('calls', mergedCalls),
    updateOfflineMeta({ last_bootstrap_at: input.generatedAt }),
  ])
}

export async function listOfflineLeads() {
  return readAll<OfflineLead>('leads')
}

export async function listOfflineTasks() {
  return readAll<OfflineTask>('tasks')
}

export async function listOfflineCalls() {
  return readAll<OfflineCall>('calls')
}

export async function upsertOfflineLead(lead: OfflineLead) {
  await putRecord('leads', lead)
}

export async function upsertOfflineTask(task: OfflineTask) {
  await putRecord('tasks', task)
}

export async function upsertOfflineCall(call: OfflineCall) {
  await putRecord('calls', call)
}

export async function getOfflineLead(id: string) {
  return getRecord<OfflineLead>('leads', id)
}

export async function listPendingMutations() {
  const queue = await readAll<OfflineSyncMutation>('queue')
  return queue.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export async function enqueueMutation(mutation: OfflineSyncMutation) {
  await putRecord('queue', mutation)
}

export async function updateMutation(mutation: OfflineSyncMutation) {
  await putRecord('queue', mutation)
}

export async function removeMutation(id: string) {
  await deleteRecord('queue', id)
}

export async function addConflict(conflict: OfflineConflictLog) {
  await putRecord('conflicts', conflict)
}

export async function listConflicts() {
  const conflicts = await readAll<OfflineConflictLog>('conflicts')
  return conflicts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function clearConflicts() {
  const conflicts = await listConflicts()
  await Promise.all(conflicts.map((conflict) => deleteRecord('conflicts', conflict.id)))
}

export async function resetOfflineWorkspace() {
  const db = await openOfflineCRMDb()
  const tx = db.transaction(['leads', 'tasks', 'calls', 'queue', 'conflicts'], 'readwrite')
  for (const storeName of ['leads', 'tasks', 'calls', 'queue', 'conflicts']) {
    tx.objectStore(storeName).clear()
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
