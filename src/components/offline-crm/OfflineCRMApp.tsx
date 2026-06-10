'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Phone, RefreshCw, Search, Wifi, WifiOff, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOfflineMeta, listConflicts, listOfflineCalls, listOfflineLeads, listOfflineTasks, replaceOfflineSnapshot, updateOfflineMeta } from '@/lib/offline-crm-db'
import { bootstrapOfflineCRM, createLocalId, queueCallWithLeadUpdate, queueLeadUpdate, queueTaskUpsert, runOfflineCRMSync } from '@/lib/offline-crm-sync'
import type { OfflineCall, OfflineCallOutcome, OfflineLead, OfflineLeadStage, OfflineLeadTemperature, OfflineTask, OfflineTaskPriority, OfflineTaskStatus, OfflineTaskType } from '@/lib/offline-crm-types'
import OfflineCRMNav from '@/components/offline-crm/OfflineCRMNav'

const STAGES: OfflineLeadStage[] = ['new', 'contacted', 'interested', 'callback', 'follow_up', 'qualified', 'demo_held', 'active_client', 'closed_lost']
const DISPOSITIONS: { outcome: OfflineCallOutcome; stage: OfflineLeadStage | null; label: string }[] = [
  { outcome: 'Interested', stage: 'interested', label: 'Interested' },
  { outcome: 'Booked Call', stage: 'qualified', label: 'Booked Call' },
  { outcome: 'Left Voicemail', stage: 'contacted', label: 'Voicemail' },
  { outcome: 'No Answer', stage: 'contacted', label: 'No Answer' },
  { outcome: 'Call Back Later', stage: 'callback', label: 'Call Back Later' },
  { outcome: 'Not Interested', stage: 'closed_lost', label: 'Not Interested' },
]

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function fullName(lead: OfflineLead) {
  return `${lead.first_name} ${lead.last_name}`.trim()
}

export default function OfflineCRMApp() {
  const [leads, setLeads] = useState<OfflineLead[]>([])
  const [tasks, setTasks] = useState<OfflineTask[]>([])
  const [calls, setCalls] = useState<OfflineCall[]>([])
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof getOfflineMeta>> | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [notesDraft, setNotesDraft] = useState('')
  const [followUpDraft, setFollowUpDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [taskPriority, setTaskPriority] = useState<OfflineTaskPriority>('Medium')
  const [callNote, setCallNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [conflictCount, setConflictCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [needsInitialSignIn, setNeedsInitialSignIn] = useState(false)
  const online = typeof navigator === 'undefined' ? true : navigator.onLine

  const refresh = useCallback(async () => {
    const [nextLeads, nextTasks, nextCalls, nextMeta, nextConflicts] = await Promise.all([
      listOfflineLeads(),
      listOfflineTasks(),
      listOfflineCalls(),
      getOfflineMeta(),
      listConflicts(),
    ])
    setLeads(nextLeads)
    setTasks(nextTasks)
    setCalls(nextCalls)
    setMeta(nextMeta)
    setConflictCount(nextConflicts.length)
    setSelectedLeadId((current) => current && nextLeads.some((lead) => lead.id === current) ? current : nextLeads[0]?.id ?? null)
  }, [])

  const bootstrap = useCallback(async () => {
    setError(null)
    setNeedsInitialSignIn(false)
    const snapshot = await bootstrapOfflineCRM()
    await replaceOfflineSnapshot({
      leads: snapshot.leads,
      tasks: snapshot.tasks,
      calls: snapshot.calls,
      generatedAt: snapshot.generated_at,
    })
    await updateOfflineMeta({
      admin_user_id: snapshot.user.id,
      admin_name: snapshot.user.name,
      last_sync_error: null,
    })
    await refresh()
  }, [refresh])

  useEffect(() => {
    refresh()
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Offline CRM could not initialize on this device.')
      })
      .finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    const handleNetwork = () => refresh()
    window.addEventListener('online', handleNetwork)
    window.addEventListener('offline', handleNetwork)
    return () => {
      window.removeEventListener('online', handleNetwork)
      window.removeEventListener('offline', handleNetwork)
    }
  }, [refresh])

  useEffect(() => {
    if (!loading && leads.length === 0 && online) {
      bootstrap().catch((nextError) => {
        const message = nextError instanceof Error ? nextError.message : 'Unable to load CRM snapshot.'
        if (message.toLowerCase() === 'unauthorized') {
          setNeedsInitialSignIn(true)
          setError(null)
          return
        }
        setError(message)
      })
    }
  }, [bootstrap, leads.length, loading, online])

  const pendingCount = useMemo(() => leads.filter((item) => item.pending_sync).length + tasks.filter((item) => item.pending_sync).length + calls.filter((item) => item.pending_sync).length, [calls, leads, tasks])
  const hasCachedWorkspace = leads.length > 0 || tasks.length > 0 || calls.length > 0

  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => !lead.is_archived)
      .filter((lead) => stageFilter === 'all' ? true : lead.stage === stageFilter)
      .filter((lead) => `${lead.first_name} ${lead.last_name} ${lead.business_name ?? ''} ${lead.phone} ${lead.email ?? ''}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const aTime = a.follow_up_at ? new Date(a.follow_up_at).getTime() : Number.MAX_SAFE_INTEGER
        const bTime = b.follow_up_at ? new Date(b.follow_up_at).getTime() : Number.MAX_SAFE_INTEGER
        return aTime - bTime
      })
  }, [leads, search, stageFilter])

  const selectedLead = useMemo(() => filteredLeads.find((lead) => lead.id === selectedLeadId) ?? leads.find((lead) => lead.id === selectedLeadId) ?? filteredLeads[0] ?? null, [filteredLeads, leads, selectedLeadId])
  const leadTasks = useMemo(() => tasks.filter((task) => task.lead_id === selectedLead?.id).sort((a, b) => (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) - (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER)), [selectedLead?.id, tasks])
  const leadCalls = useMemo(() => calls.filter((call) => call.lead_id === selectedLead?.id).sort((a, b) => new Date(b.call_started_at).getTime() - new Date(a.call_started_at).getTime()).slice(0, 8), [calls, selectedLead?.id])

  useEffect(() => {
    if (!selectedLead) return
    setNotesDraft(selectedLead.notes ?? '')
    setFollowUpDraft(selectedLead.follow_up_at ? new Date(selectedLead.follow_up_at).toISOString().slice(0, 16) : '')
    setTagDraft((selectedLead.tags ?? []).join(', '))
  }, [selectedLead])

  const syncNow = useCallback(async () => {
    setSyncing(true)
    try {
      if (online) {
        await runOfflineCRMSync()
        await bootstrap()
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Unable to sync offline CRM.'
      if (message.toLowerCase() === 'unauthorized' && !hasCachedWorkspace) {
        setNeedsInitialSignIn(true)
        setError(null)
      } else {
        setError(message)
      }
      await refresh()
    } finally {
      setSyncing(false)
    }
  }, [bootstrap, hasCachedWorkspace, online, refresh])

  useEffect(() => {
    if (!online || syncing || pendingCount === 0) return
    const timer = window.setTimeout(() => {
      syncNow().catch(() => {})
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [online, pendingCount, syncNow, syncing])

  const saveLead = useCallback(async (patch: Partial<OfflineLead>) => {
    if (!selectedLead) return
    await queueLeadUpdate(selectedLead, patch)
    await refresh()
  }, [refresh, selectedLead])

  const saveLeadDetail = useCallback(async () => {
    if (!selectedLead) return
    await saveLead({
      notes: notesDraft || null,
      follow_up_at: followUpDraft ? new Date(followUpDraft).toISOString() : null,
      callback_due_at: followUpDraft ? new Date(followUpDraft).toISOString() : null,
      tags: tagDraft.split(',').map((tag) => tag.trim()).filter(Boolean),
    })
  }, [followUpDraft, notesDraft, saveLead, selectedLead, tagDraft])

  const addTask = useCallback(async () => {
    if (!selectedLead || !taskTitle.trim()) return
    const now = new Date().toISOString()
    await queueTaskUpsert({
      id: createLocalId('task'),
      lead_id: selectedLead.id,
      related_call_id: null,
      title: taskTitle.trim(),
      description: null,
      task_type: 'Callback' as OfflineTaskType,
      priority: taskPriority,
      status: 'To Do' as OfflineTaskStatus,
      due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null,
      owner_user_id: meta?.admin_user_id ?? null,
      owner_name: meta?.admin_name ?? 'Offline User',
      pipeline_stage: selectedLead.stage,
      notes: null,
      completed_at: null,
      updated_at: now,
      local_updated_at: now,
      sync_state: 'pending',
      pending_sync: true,
      last_synced_at: null,
      server_updated_at: null,
      conflict_note: null,
      client_mutation_id: crypto.randomUUID(),
    }, true)
    setTaskTitle('')
    setTaskDueAt('')
    setTaskPriority('Medium')
    await refresh()
  }, [meta?.admin_name, meta?.admin_user_id, refresh, selectedLead, taskDueAt, taskPriority, taskTitle])

  const toggleTaskDone = useCallback(async (task: OfflineTask) => {
    await queueTaskUpsert({
      ...task,
      status: task.status === 'Done' ? 'To Do' : 'Done',
      completed_at: task.status === 'Done' ? null : new Date().toISOString(),
    })
    await refresh()
  }, [refresh])

  const logDisposition = useCallback(async (outcome: OfflineCallOutcome, stage: OfflineLeadStage | null) => {
    if (!selectedLead) return
    const now = new Date().toISOString()
    const leadPatch: Partial<OfflineLead> = {
      last_contacted_at: now,
      last_call_at: now,
      last_call_outcome: outcome,
      latest_call_note: callNote || null,
      follow_up_at: followUpDraft ? new Date(followUpDraft).toISOString() : null,
      callback_due_at: followUpDraft ? new Date(followUpDraft).toISOString() : null,
      strategy_call_booked: outcome === 'Booked Call',
      converted_to_client: outcome === 'Closed Won',
      notes: callNote ? [selectedLead.notes, callNote].filter(Boolean).join('\n\n') : selectedLead.notes,
    }
    if (stage) {
      leadPatch.stage = stage
    }
    await queueCallWithLeadUpdate({
      id: createLocalId('call'),
      lead_id: selectedLead.id,
      agent_user_id: meta?.admin_user_id ?? null,
      agent_name: meta?.admin_name ?? 'Offline User',
      lead_name: fullName(selectedLead),
      company_name: selectedLead.business_name,
      phone_number: selectedLead.phone,
      call_started_at: now,
      call_ended_at: now,
      duration_seconds: null,
      call_status: 'completed',
      call_outcome: outcome,
      notes: callNote || null,
      next_follow_up_at: followUpDraft ? new Date(followUpDraft).toISOString() : null,
      lead_temperature: selectedLead.lead_temperature,
      strategy_call_booked: outcome === 'Booked Call',
      converted_to_client: outcome === 'Closed Won',
      source: selectedLead.source,
      updated_at: now,
      local_updated_at: now,
      sync_state: 'pending',
      pending_sync: true,
      last_synced_at: null,
      server_updated_at: null,
      conflict_note: null,
      client_mutation_id: crypto.randomUUID(),
    }, leadPatch)
    setCallNote('')
    await refresh()
  }, [callNote, followUpDraft, meta?.admin_name, meta?.admin_user_id, refresh, selectedLead])

  if (loading) {
    return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center"><div className="flex items-center gap-3 text-sm text-gray-300"><Loader2 className="h-5 w-5 animate-spin" /> Loading offline CRM...</div></div>
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="rounded-3xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-green-400">Sales CRM</p>
              <h1 className="mt-2 text-2xl font-bold">Local CRM mirror</h1>
              <p className="mt-1 text-sm text-gray-400">The same calling workflow, backed by your device copy of SourcifyLending CRM data. When the connection comes back, changes sync in the background.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', online ? 'border-green-700 bg-green-500/10 text-green-200' : 'border-amber-700 bg-amber-500/10 text-amber-200')}>
                {online ? <span className="inline-flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5" /> Online</span> : <span className="inline-flex items-center gap-1.5"><WifiOff className="h-3.5 w-3.5" /> Offline</span>}
              </div>
              <div className="rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5 text-xs text-gray-300">
                {syncing ? 'Syncing…' : pendingCount > 0 ? `${pendingCount} pending sync` : 'Synced'}
              </div>
              <Link href="/offline-crm/dialer" className="inline-flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
                <Zap className="h-4 w-4" /> Dialer
              </Link>
            </div>
          </div>
          <div className="mt-4">
            <OfflineCRMNav />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Connectivity</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium">{online ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-amber-400" />}{online ? 'Online' : 'Offline'}</p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Pending Sync</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4 text-amber-400" /> {pendingCount} records</p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Conflicts</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-red-400" /> {conflictCount}</p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Last Sync</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium"><RefreshCw className="h-4 w-4 text-blue-400" /> {meta?.last_sync_at ? new Date(meta.last_sync_at).toLocaleString() : 'Not synced yet'}</p>
            </div>
          </div>

          {needsInitialSignIn && !hasCachedWorkspace && (
            <div className="mt-4 rounded-2xl border border-blue-700/40 bg-blue-500/10 p-5">
              <p className="text-sm font-semibold text-blue-100">This device does not have a local CRM mirror yet.</p>
              <p className="mt-1 text-sm text-blue-100/80">Open the live admin CRM once while signed in on this device and the local mirror will populate automatically. After that, this route opens straight into your CRM cache.</p>
            </div>
          )}

          {error && <div className="mt-4 rounded-2xl border border-red-700/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        </div>

        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cached leads..." className="w-full rounded-2xl border border-gray-800 bg-gray-950 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-green-600" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {['all', ...STAGES].map((stage) => (
                  <button key={stage} onClick={() => setStageFilter(stage)} className={cn('whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium', stageFilter === stage ? 'border-green-600 bg-green-600 text-white' : 'border-gray-700 bg-gray-950 text-gray-300')}>
                    {stage === 'all' ? 'All' : titleCase(stage)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {filteredLeads.map((lead) => (
                <button key={lead.id} onClick={() => setSelectedLeadId(lead.id)} className={cn('w-full rounded-2xl border px-4 py-3 text-left transition-colors', selectedLead?.id === lead.id ? 'border-green-600 bg-green-600/10' : 'border-gray-800 bg-gray-950 hover:border-gray-700')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{fullName(lead)}</p>
                      <p className="truncate text-xs text-gray-400">{lead.business_name || 'No business name'} · {lead.phone}</p>
                    </div>
                    <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide', lead.pending_sync ? 'bg-amber-500/20 text-amber-200' : lead.sync_state === 'conflict' ? 'bg-red-500/20 text-red-200' : 'bg-green-500/20 text-green-200')}>
                      {lead.pending_sync ? 'Pending' : lead.sync_state === 'conflict' ? 'Conflict' : 'Synced'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>{titleCase(lead.stage)}</span>
                    <span>{lead.follow_up_at ? new Date(lead.follow_up_at).toLocaleString() : 'No follow-up'}</span>
                  </div>
                </button>
              ))}
              {filteredLeads.length === 0 && <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950 p-6 text-center text-sm text-gray-400">No cached leads match this filter yet.</div>}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-800 bg-gray-900 p-4">
            {selectedLead ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Lead Detail</p>
                    <h2 className="mt-2 text-2xl font-bold">{fullName(selectedLead)}</h2>
                    <p className="mt-1 text-sm text-gray-400">{selectedLead.business_name || 'No business name'} · {selectedLead.email || 'No email on file'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`tel:${selectedLead.phone}`} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"><Phone className="mr-2 inline h-4 w-4" />Call</a>
                    <button onClick={saveLeadDetail} className="rounded-2xl border border-gray-700 bg-gray-950 px-4 py-2 text-sm font-medium text-gray-200">Save local changes</button>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-3">
                    <h3 className="text-sm font-semibold">Lead context</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-sm text-gray-300">
                        <span className="text-xs uppercase tracking-wide text-gray-500">Stage</span>
                        <select value={selectedLead.stage} onChange={(event) => saveLead({ stage: event.target.value as OfflineLeadStage })} className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-green-600">
                          {STAGES.map((stage) => <option key={stage} value={stage}>{titleCase(stage)}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1.5 text-sm text-gray-300">
                        <span className="text-xs uppercase tracking-wide text-gray-500">Temperature</span>
                        <select value={selectedLead.lead_temperature} onChange={(event) => saveLead({ lead_temperature: event.target.value as OfflineLeadTemperature })} className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-green-600">
                          <option value="cold">Cold</option>
                          <option value="warm">Warm</option>
                          <option value="hot">Hot</option>
                        </select>
                      </label>
                    </div>
                    <input type="datetime-local" value={followUpDraft} onChange={(event) => setFollowUpDraft(event.target.value)} className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-green-600" />
                    <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="callback, hot, docs-needed" className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-green-600" />
                    <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} rows={6} className="w-full rounded-2xl border border-gray-800 bg-gray-900 px-3 py-3 text-sm text-white outline-none focus:border-green-600" />
                  </div>

                  <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold">Call workflow</h3>
                      <p className="mt-1 text-xs text-gray-500">Log dispositions here and the mirror will sync them automatically when the connection is back.</p>
                    </div>
                    <textarea value={callNote} onChange={(event) => setCallNote(event.target.value)} rows={4} placeholder="Quick call note..." className="w-full rounded-2xl border border-gray-800 bg-gray-900 px-3 py-3 text-sm text-white outline-none focus:border-green-600" />
                    <div className="grid gap-2 sm:grid-cols-2">
                      {DISPOSITIONS.map((item) => (
                        <button key={item.outcome} onClick={() => logDisposition(item.outcome, item.stage)} className="rounded-2xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm font-medium text-gray-100 hover:border-green-600 hover:bg-green-600/10">
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Tasks</h3>
                        <p className="mt-1 text-xs text-gray-500">Create or complete follow-ups while offline.</p>
                      </div>
                      <span className="rounded-full bg-gray-900 px-3 py-1 text-xs text-gray-300">{leadTasks.length}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_120px_auto]">
                      <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="New callback or follow-up task" className="rounded-2xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-green-600" />
                      <input type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} className="rounded-2xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-green-600" />
                      <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as OfflineTaskPriority)} className="rounded-2xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-green-600">
                        {['Low', 'Medium', 'High', 'Urgent'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                      </select>
                      <button onClick={addTask} className="rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500">Add</button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {leadTasks.map((task) => (
                        <button key={task.id} onClick={() => toggleTaskDone(task)} className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-left">
                          <div>
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="mt-1 text-xs text-gray-500">{task.priority} · {task.due_at ? new Date(task.due_at).toLocaleString() : 'No due date'}</p>
                          </div>
                          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', task.status === 'Done' ? 'bg-green-500/20 text-green-200' : 'bg-amber-500/20 text-amber-200')}>{task.status}</span>
                        </button>
                      ))}
                      {leadTasks.length === 0 && <p className="text-sm text-gray-500">No local tasks for this lead yet.</p>}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                    <h3 className="text-sm font-semibold">Recent local activity</h3>
                    <p className="mt-1 text-xs text-gray-500">Call notes and dispositions saved on this device.</p>
                    <div className="mt-4 space-y-2">
                      {leadCalls.map((call) => (
                        <div key={call.id} className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{call.call_outcome}</p>
                            <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold uppercase', call.pending_sync ? 'bg-amber-500/20 text-amber-200' : 'bg-green-500/20 text-green-200')}>
                              {call.pending_sync ? 'Pending sync' : 'Synced'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">{new Date(call.call_started_at).toLocaleString()}</p>
                          {call.notes && <p className="mt-2 text-sm text-gray-300">{call.notes}</p>}
                        </div>
                      ))}
                      {leadCalls.length === 0 && <p className="text-sm text-gray-500">No local call activity for this lead yet.</p>}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-gray-950 text-center text-sm text-gray-400">
                This device does not have local CRM records yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-800 bg-gray-900/90 p-4 text-sm text-gray-400">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p>Writes land locally first, then sync later. Conflicts prefer the newest valid update and are logged for review.</p>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Synced</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5 text-amber-400" /> Pending sync</span>
              <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-red-400" /> Conflict</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
