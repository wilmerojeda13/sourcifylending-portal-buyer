'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Building2, CalendarPlus, CheckCircle2, ChevronLeft, Flame, Loader2, Mail, Phone, PhoneMissed, ThumbsDown, ThumbsUp, Voicemail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOfflineMeta, listOfflineLeads } from '@/lib/offline-crm-db'
import { createLocalId, queueCallWithLeadUpdate } from '@/lib/offline-crm-sync'
import type { OfflineCallOutcome, OfflineLead, OfflineLeadStage } from '@/lib/offline-crm-types'

type StageFilter = 'new' | 'contacted' | 'interested' | 'callback' | 'follow_up' | 'qualified' | 'demo_held' | 'active_client'

const STAGE_OPTIONS: { key: StageFilter; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'interested', label: 'Interested' },
  { key: 'callback', label: 'Callback' },
  { key: 'follow_up', label: 'Follow Up' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'demo_held', label: 'Demo Held' },
  { key: 'active_client', label: 'Active Client' },
]

const DISPOSITIONS: {
  key: string
  label: string
  icon: typeof ThumbsUp
  color: string
  outcome: OfflineCallOutcome
  newStage: OfflineLeadStage | null
}[] = [
  { key: 'interested', label: 'Interested', icon: ThumbsUp, color: 'bg-green-500 hover:bg-green-600 text-white', outcome: 'Interested', newStage: 'interested' },
  { key: 'book_demo', label: 'Book Demo', icon: CalendarPlus, color: 'bg-purple-500 hover:bg-purple-600 text-white', outcome: 'Booked Call', newStage: 'qualified' },
  { key: 'demo_no_show', label: 'Demo No Show', icon: PhoneMissed, color: 'bg-slate-700 hover:bg-slate-800 text-white', outcome: 'Demo No Show', newStage: null },
  { key: 'voicemail', label: 'Voicemail', icon: Voicemail, color: 'bg-amber-500 hover:bg-amber-600 text-white', outcome: 'Left Voicemail', newStage: 'contacted' },
  { key: 'no_answer', label: 'No Answer', icon: PhoneMissed, color: 'bg-gray-400 hover:bg-gray-500 text-white', outcome: 'No Answer', newStage: 'contacted' },
  { key: 'not_interested', label: 'Not Interested', icon: ThumbsDown, color: 'bg-red-400 hover:bg-red-500 text-white', outcome: 'Not Interested', newStage: 'closed_lost' },
  { key: 'dnc', label: 'DNC', icon: Ban, color: 'bg-red-700 hover:bg-red-800 text-white', outcome: 'Closed Lost', newStage: null },
]

const PROGRAM_LABEL: Record<string, string> = { program_a: 'Program A', program_b: 'Program B', program_c: 'Program C' }
const PROGRAM_BADGE: Record<string, string> = {
  program_a: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  program_b: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  program_c: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
}

function useOfflineDialerQueue(stageFilter: StageFilter | null, programFilter: string) {
  const [leads, setLeads] = useState<OfflineLead[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const records = await listOfflineLeads()
    const filtered = records
      .filter((lead) => !lead.do_not_call && !lead.is_archived)
      .filter((lead) => (stageFilter ? lead.stage === stageFilter : true))
      .filter((lead) => (programFilter ? lead.program_interest === programFilter : true))
      .sort((a, b) => {
        const aTime = a.follow_up_at ? new Date(a.follow_up_at).getTime() : Number.MAX_SAFE_INTEGER
        const bTime = b.follow_up_at ? new Date(b.follow_up_at).getTime() : Number.MAX_SAFE_INTEGER
        return aTime - bTime
      })
    setLeads(filtered)
    setLoading(false)
  }, [programFilter, stageFilter])

  useEffect(() => {
    refresh().catch(() => setLoading(false))
  }, [refresh])

  return { leads, loading, refresh }
}

export default function OfflineCRMDialer() {
  const [stageFilter, setStageFilter] = useState<StageFilter | null>('new')
  const [programFilter, setProgramFilter] = useState('')
  const [index, setIndex] = useState(0)
  const [acting, setActing] = useState(false)
  const [called, setCalled] = useState(false)
  const [note, setNote] = useState('')
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null)
  const [nextFollowUpAt, setNextFollowUpAt] = useState('')
  const [temperature, setTemperature] = useState<'cold' | 'warm' | 'hot'>('cold')
  const [strategyBooked, setStrategyBooked] = useState(false)
  const [converted, setConverted] = useState(false)
  const [done, setDone] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const { leads, loading, refresh } = useOfflineDialerQueue(stageFilter, programFilter)

  const current = leads[index] ?? null
  const total = leads.length
  const remaining = Math.max(total - index, 0)

  useEffect(() => {
    const onNetwork = () => setOnline(navigator.onLine)
    window.addEventListener('online', onNetwork)
    window.addEventListener('offline', onNetwork)
    return () => {
      window.removeEventListener('online', onNetwork)
      window.removeEventListener('offline', onNetwork)
    }
  }, [])

  useEffect(() => {
    setIndex(0)
    setDone(0)
    setSkipped(0)
  }, [programFilter, stageFilter])

  useEffect(() => {
    if (!current) return
    setTemperature(current.lead_temperature ?? 'cold')
    setNextFollowUpAt(current.follow_up_at ? new Date(current.follow_up_at).toISOString().slice(0, 16) : '')
  }, [current?.id])

  const syncLabel = useMemo(() => {
    const pending = leads.filter((lead) => lead.pending_sync).length
    if (!online) return 'Offline'
    if (pending > 0) return `${pending} pending sync`
    return 'Synced'
  }, [leads, online])

  const advance = useCallback(() => {
    setCalled(false)
    setNote('')
    setCallStartedAt(null)
    setNextFollowUpAt('')
    setTemperature('cold')
    setStrategyBooked(false)
    setConverted(false)
    setIndex((value) => value + 1)
  }, [])

  const logDisposition = useCallback(async (disposition: typeof DISPOSITIONS[number]) => {
    if (!current) return
    setActing(true)
    try {
      const meta = await getOfflineMeta()
      const now = new Date().toISOString()
      const durationSeconds = callStartedAt
        ? Math.max(Math.round((new Date(now).getTime() - new Date(callStartedAt).getTime()) / 1000), 0)
        : null

      await queueCallWithLeadUpdate({
        id: createLocalId('call'),
        lead_id: current.id,
        agent_user_id: meta.admin_user_id ?? null,
        agent_name: meta.admin_name ?? 'Local CRM',
        lead_name: `${current.first_name} ${current.last_name}`.trim(),
        company_name: current.business_name,
        phone_number: current.phone,
        call_started_at: callStartedAt || now,
        call_ended_at: now,
        duration_seconds: durationSeconds,
        call_status: called ? 'completed' : 'attempted',
        call_outcome: disposition.outcome,
        notes: note.trim() || null,
        next_follow_up_at: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
        lead_temperature: temperature,
        strategy_call_booked: strategyBooked || disposition.outcome === 'Booked Call',
        converted_to_client: converted,
        source: current.source,
        updated_at: now,
        local_updated_at: now,
        sync_state: 'pending',
        pending_sync: true,
        last_synced_at: null,
        server_updated_at: null,
        conflict_note: null,
        client_mutation_id: crypto.randomUUID(),
      }, {
        do_not_call: disposition.key === 'dnc',
        stage: disposition.newStage ?? current.stage,
        last_contacted_at: now,
        last_call_at: now,
        last_call_outcome: disposition.outcome,
        latest_call_note: note.trim() || null,
        follow_up_at: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
        callback_due_at: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
        strategy_call_booked: strategyBooked || disposition.outcome === 'Booked Call',
        converted_to_client: converted,
        lead_temperature: temperature,
        notes: note.trim() ? [current.notes, note.trim()].filter(Boolean).join('\n\n') : current.notes,
      })

      setDone((value) => value + 1)
      advance()
      await refresh()
    } finally {
      setActing(false)
    }
  }, [acting, advance, callStartedAt, called, converted, current, nextFollowUpAt, note, refresh, strategyBooked, temperature])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!current) {
    return (
      <div className="min-h-screen bg-gray-950 px-4 py-6 text-white">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-green-400">Sales CRM</p>
              <h1 className="mt-2 text-3xl font-bold">Dialer</h1>
              <p className="mt-1 text-sm text-gray-400">Your local dial queue is up to date on this device.</p>
            </div>
            <div className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300">{syncLabel}</div>
          </div>
          <div className="flex justify-between gap-3">
            <Link href="/offline-crm" className="inline-flex items-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2.5 text-sm text-gray-300 hover:border-gray-700 hover:text-white">
              <ChevronLeft size={16} /> Back to CRM
            </Link>
          </div>
          <div className="rounded-3xl border border-gray-800 bg-gray-900 p-8 text-center text-gray-400">
            No local leads are queued for this dialer filter right now.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6 text-white lg:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-green-400">Sales CRM</p>
            <h1 className="mt-2 text-3xl font-bold">Dialer</h1>
            <p className="mt-1 text-sm text-gray-400">The same call workflow, using your local CRM mirror.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300">{syncLabel}</div>
            <Link href="/offline-crm" className="inline-flex items-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2.5 text-sm text-gray-300 hover:border-gray-700 hover:text-white">
              <ChevronLeft size={16} /> Back to CRM
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {STAGE_OPTIONS.map((stage) => (
            <button
              key={stage.key}
              onClick={() => setStageFilter(stage.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                stageFilter === stage.key ? 'border-green-600 bg-green-600 text-white' : 'border-gray-700 bg-gray-900 text-gray-300'
              )}
            >
              {stage.label}
            </button>
          ))}
          {[{ key: '', label: 'All Programs' }, { key: 'program_a', label: 'Prog A' }, { key: 'program_b', label: 'Prog B' }, { key: 'program_c', label: 'Prog C' }].map((program) => (
            <button
              key={program.key || 'all'}
              onClick={() => setProgramFilter(program.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                programFilter === program.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-700 bg-gray-900 text-gray-300'
              )}
            >
              {program.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-gray-800 bg-gray-900 p-5 lg:p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-bold text-white">{current.first_name} {current.last_name}</h2>
                  {current.business_name && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-400">
                      <Building2 size={13} /> {current.business_name}
                    </p>
                  )}
                </div>
                {current.program_interest && (
                  <span className={cn('badge shrink-0 px-2.5 py-1 text-xs', PROGRAM_BADGE[current.program_interest])}>
                    {PROGRAM_LABEL[current.program_interest]}
                  </span>
                )}
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Queue Position</p>
                  <p className="mt-1 text-lg font-semibold text-white">{index + 1} / {total}</p>
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Remaining</p>
                  <p className="mt-1 text-lg font-semibold text-white">{remaining}</p>
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Completed</p>
                  <p className="mt-1 text-lg font-semibold text-white">{done}</p>
                </div>
              </div>

              <a
                href={`tel:${current.phone}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setCalled(true)
                  setCallStartedAt(new Date().toISOString())
                }}
                className={cn(
                  'flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-lg font-bold transition-all active:scale-[0.98] lg:py-5 lg:text-xl',
                  called ? 'bg-gray-700 text-gray-300' : 'bg-green-500 text-white shadow-lg shadow-green-900/40 hover:bg-green-600'
                )}
              >
                <Phone size={22} /> {current.phone}
              </a>

              <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4 lg:hidden">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Call Outcome</p>
                  {acting && <Loader2 size={16} className="animate-spin text-gray-500" />}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {DISPOSITIONS.map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.key}
                        onClick={() => logDisposition(item)}
                        disabled={acting}
                        className={cn('flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50', item.color)}
                      >
                        <Icon size={18} /> {item.label}
                      </button>
                    )
                  })}
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Note</label>
                  <input
                    className="w-full rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:border-green-600 focus:outline-none"
                    placeholder="Quick note (optional)..."
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </div>

              {current.email && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-500">
                  <Mail size={11} /> {current.email}
                </p>
              )}

              {current.notes && (
                <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-800/80 p-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Existing Notes</p>
                  <p className="text-sm leading-relaxed text-gray-300">{current.notes}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-3xl border border-gray-800 bg-gray-900/90 p-4 lg:p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Call Details</p>
              <div className="hidden lg:block">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Note</label>
                <input
                  className="w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:border-green-600 focus:outline-none"
                  placeholder="Quick note (optional)..."
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>

              <div className={cn('grid grid-cols-1 gap-3 xl:grid-cols-2', 'mt-0 lg:mt-4')}>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    <Flame size={12} /> Lead Temperature
                  </label>
                  <select
                    className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-200 focus:border-green-600 focus:outline-none"
                    value={temperature}
                    onChange={(event) => setTemperature(event.target.value as 'cold' | 'warm' | 'hot')}
                  >
                    <option value="cold">Cold</option>
                    <option value="warm">Warm</option>
                    <option value="hot">Hot</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Next Follow-Up</label>
                  <input
                    className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-200 focus:border-green-600 focus:outline-none"
                    type="datetime-local"
                    value={nextFollowUpAt}
                    onChange={(event) => setNextFollowUpAt(event.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-200">
                  <input type="checkbox" checked={strategyBooked} onChange={(event) => setStrategyBooked(event.target.checked)} />
                  Strategy call booked
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-200">
                  <input type="checkbox" checked={converted} onChange={(event) => setConverted(event.target.checked)} />
                  Converted to paying client
                </label>
              </div>
            </div>

            <div className="hidden rounded-3xl border border-gray-800 bg-gray-900/90 p-4 lg:block lg:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Call Outcome</p>
                {acting && <Loader2 size={16} className="animate-spin text-gray-500" />}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {DISPOSITIONS.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key}
                      onClick={() => logDisposition(item)}
                      disabled={acting}
                      className={cn('flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 lg:min-h-[54px]', item.color)}
                    >
                      <Icon size={18} /> {item.label}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <button
                  onClick={() => {
                    setSkipped((value) => value + 1)
                    advance()
                  }}
                  className="rounded-2xl bg-gray-800 py-3.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700"
                >
                  Skip
                </button>
                <div className="flex items-center justify-center text-center text-xs text-gray-600">{index + 1} / {total}</div>
                <Link href="/offline-crm" className="flex items-center justify-center rounded-2xl bg-gray-800 py-3.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700">
                  Full CRM
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-800 bg-gray-900/90 p-4 text-sm text-gray-400">
              {done} completed · {skipped} skipped
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
