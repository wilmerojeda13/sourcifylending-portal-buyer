'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Phone, PhoneOff, ChevronRight, Building2, Loader2, CheckCircle2,
  Power, Pause, ThumbsUp, ThumbsDown, Voicemail, PhoneMissed,
  CalendarPlus, Ban, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
type RawLeadStage = 'new' | 'contacted' | 'interested' | 'callback' | 'follow_up' | 'qualified' | 'promoted' | 'dnc' | 'closed_lost'

interface RawLead {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  phone_e164?: string | null
  email: string | null
  business_name: string | null
  notes: string | null
  stage: RawLeadStage
  last_call_outcome: string | null
  last_call_at: string | null
  callback_due_at: string | null
  do_not_call: boolean
  is_archived: boolean
  promoted_to_crm_lead_id: string | null
  // compliance fields (may be undefined if not enriched)
  call_window_status?: 'callable_now' | 'blocked_by_timezone' | 'unknown_timezone'
  call_window_message?: string | null
  recipient_local_time?: string | null
  timezone_abbreviation?: string | null
}

interface DialerSession {
  id: string
  session_status: 'not_ready' | 'ready' | 'connecting' | 'waiting' | 'in_call'
  rep_phone_number: string
  conference_name: string
  current_lead_id: string | null
  current_crm_call_id: string | null
  waiting_for_disposition: boolean | null
  active_attempt_count: number | null
  target_parallel_lines: number | null
}

// ─── Queue stage config ────────────────────────────────────────────────────────
const QUEUE_STAGES: { key: RawLeadStage; label: string; sub: string }[] = [
  { key: 'new',        label: 'New',        sub: 'Fresh leads' },
  { key: 'contacted',  label: 'Contacted',  sub: 'Previously reached' },
  { key: 'interested', label: 'Interested', sub: 'Shown interest' },
  { key: 'callback',   label: 'Callback',   sub: 'Scheduled callbacks' },
  { key: 'follow_up',  label: 'Follow Up',  sub: 'Follow-up needed' },
  { key: 'qualified',  label: 'Qualified',  sub: 'Ready to promote' },
]

// ─── Dispositions ─────────────────────────────────────────────────────────────
const DISPOSITIONS = [
  { key: 'no_answer',      label: 'No Answer',     icon: PhoneMissed,  color: 'bg-gray-800 text-gray-200 hover:bg-gray-700',          stage: 'new' as RawLeadStage,        removeFromQueue: false },
  { key: 'voicemail',      label: 'Voicemail',     icon: Voicemail,    color: 'bg-gray-700 text-gray-200 hover:bg-gray-600',          stage: 'contacted' as RawLeadStage,  removeFromQueue: true },
  { key: 'callback',       label: 'Callback',      icon: CalendarPlus, color: 'bg-cyan-700 text-white hover:bg-cyan-600',             stage: 'callback' as RawLeadStage,   removeFromQueue: true },
  { key: 'interested',     label: 'Interested',    icon: ThumbsUp,     color: 'bg-green-700 text-white hover:bg-green-600',           stage: 'interested' as RawLeadStage, removeFromQueue: true },
  { key: 'follow_up',      label: 'Follow Up',     icon: Clock,        color: 'bg-yellow-700 text-white hover:bg-yellow-600',         stage: 'follow_up' as RawLeadStage,  removeFromQueue: true },
  { key: 'qualified',      label: 'Qualified',     icon: CheckCircle2, color: 'bg-purple-700 text-white hover:bg-purple-600',         stage: 'qualified' as RawLeadStage,  removeFromQueue: true },
  { key: 'not_interested', label: 'Not Interested',icon: ThumbsDown,   color: 'bg-red-900 text-red-200 hover:bg-red-800',            stage: 'closed_lost' as RawLeadStage,removeFromQueue: true },
  { key: 'dnc',            label: 'DNC',           icon: Ban,          color: 'bg-red-700 text-white hover:bg-red-600',               stage: 'dnc' as RawLeadStage,        removeFromQueue: true },
] as const

// ─── Main component ─────────────────────────────────────────────────────────
export default function RawLeadQueueClient({ initialStage }: { initialStage?: RawLeadStage }) {
  const [queueStage, setQueueStage]     = useState<RawLeadStage>(initialStage ?? 'new')
  const [leads, setLeads]               = useState<RawLead[]>([])
  const [index, setIndex]               = useState(0)
  const [loading, setLoading]           = useState(true)
  const [acting, setActing]             = useState(false)
  const [called, setCalled]             = useState(false)
  const [note, setNote]                 = useState('')
  const [followUpAt, setFollowUpAt]     = useState('')
  const [done, setDone]                 = useState(0)
  const [skipped, setSkipped]           = useState(0)
  const [callProviderMsg, setCallProviderMsg] = useState<string | null>(null)
  const [authorizingCall, setAuthorizingCall] = useState(false)
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [session, setSession]           = useState<DialerSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const sessionPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const current = leads[index] ?? null
  const total   = leads.length
  const remaining = total - index

  // ── Load leads ───────────────────────────────────────────────────────────────
  const loadLeads = useCallback(async (stage: RawLeadStage) => {
    setLoading(true)
    setIndex(0)
    setCalled(false)
    setNote('')
    setFollowUpAt('')
    setActiveCallId(null)
    setCallProviderMsg(null)
    try {
      const p = new URLSearchParams({ stage, limit: '100' })
      const res  = await fetch(`/api/admin/dialer/leads?${p}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const callable = (json.leads ?? []).filter((l: RawLead) => !l.do_not_call && !l.is_archived)
      setLeads(callable)
    } catch {
      toast.error('Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLeads(queueStage) }, [queueStage, loadLeads])

  // ── Session polling ──────────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    try {
      const res  = await fetch('/api/admin/crm/dialer/session')
      const json = await res.json()
      if (res.ok) setSession(json.session ?? null)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    loadSession()
    sessionPollRef.current = setInterval(loadSession, 3000)
    return () => { if (sessionPollRef.current) clearInterval(sessionPollRef.current) }
  }, [loadSession])

  // ── Session controls ─────────────────────────────────────────────────────────
  async function setReady() {
    setSessionLoading(true)
    try {
      const res  = await fetch('/api/admin/crm/dialer/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ready', mode: 'manual', connection_mode: 'browser' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSession(json.session)
      toast.success('Session ready')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start session')
    } finally {
      setSessionLoading(false)
    }
  }

  async function setNotReady() {
    setSessionLoading(true)
    try {
      await fetch('/api/admin/crm/dialer/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'not_ready' }),
      })
      setSession(null)
      setCalled(false)
      setActiveCallId(null)
    } catch { /* silent */ } finally {
      setSessionLoading(false)
    }
  }

  // ── Dial ─────────────────────────────────────────────────────────────────────
  async function dial() {
    if (!current) return
    setAuthorizingCall(true)
    setCallProviderMsg('Connecting...')
    try {
      const res  = await fetch('/api/admin/crm/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: current.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCalled(true)
      setActiveCallId(json.call_id ?? null)
      setCallProviderMsg(`Dialing ${current.phone}...`)
      await loadSession()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dial failed')
      setCallProviderMsg(null)
    } finally {
      setAuthorizingCall(false)
    }
  }

  // ── Hang up ──────────────────────────────────────────────────────────────────
  async function hangUp() {
    if (!activeCallId) return
    try {
      await fetch('/api/admin/crm/dial', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: activeCallId }),
      })
      await loadSession()
    } catch { /* silent */ }
  }

  // ── Disposition ──────────────────────────────────────────────────────────────
  async function dispositionAndAdvance(d: typeof DISPOSITIONS[number]) {
    if (!current) return
    setActing(true)
    try {
      const res = await fetch('/api/admin/dialer/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_log_id:     crypto.randomUUID(),
          raw_lead_id:     current.id,
          disposition_key: d.key,
          call_id:         activeCallId,
          note:            note.trim() || null,
          follow_up_at:    followUpAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      if (json.promotion) {
        toast.success(`${current.first_name} promoted to CRM!`)
      }

      if (d.removeFromQueue) {
        setLeads(ls => ls.filter(l => l.id !== current.id))
        setIndex(i => Math.min(i, leads.length - 2))
      } else {
        setLeads(ls => ls.map(l => l.id === current.id ? { ...l, last_call_outcome: d.key, stage: d.stage } : l))
        setIndex(i => i + 1)
      }
      setDone(n => n + 1)
      setCalled(false)
      setActiveCallId(null)
      setNote('')
      setFollowUpAt('')
      setCallProviderMsg(null)
      await loadSession()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save disposition')
    } finally {
      setActing(false)
    }
  }

  function skip() {
    setSkipped(s => s + 1)
    setCalled(false)
    setActiveCallId(null)
    setNote('')
    setFollowUpAt('')
    setCallProviderMsg(null)
    setIndex(i => i + 1)
  }

  // ── Queue complete screen ────────────────────────────────────────────────────
  if (!loading && leads.length > 0 && index >= leads.length) return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-20">
      <CheckCircle2 size={52} className="text-green-500 mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Queue Complete</h2>
      <p className="text-gray-500 mb-1">{done} contacted · {skipped} skipped</p>
      <p className="text-sm text-gray-400 mb-8">All {queueStage.replace('_', ' ')} leads have been dialed.</p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => { setQueueStage('new'); setDone(0); setSkipped(0) }}
          className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700"
        >
          Switch Queue
        </button>
        <Link href="/admin/dialer/leads" className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50">
          Go to Leads
        </Link>
        <Link href="/admin/dialer/callbacks" className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50">
          Go to Callbacks
        </Link>
        <Link href="/admin/dialer/qualified" className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50">
          Ready to Promote
        </Link>
      </div>
    </div>
  )

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-gray-400" />
    </div>
  )

  // ── Empty queue ──────────────────────────────────────────────────────────────
  if (leads.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-20">
      <Phone size={40} className="text-gray-300 mb-4" />
      <h3 className="font-semibold text-gray-700 mb-1">No leads in {queueStage.replace('_', ' ')}</h3>
      <p className="text-sm text-gray-400 mb-6">Switch to another stage or import more leads.</p>
      <div className="flex gap-3 flex-wrap justify-center">
        {QUEUE_STAGES.filter(s => s.key !== queueStage).slice(0, 3).map(s => (
          <button
            key={s.key}
            onClick={() => setQueueStage(s.key)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
          >
            Try {s.label}
          </button>
        ))}
        <Link href="/admin/dialer/import" className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">
          Import Leads
        </Link>
      </div>
    </div>
  )

  const sessionActive = session && session.session_status !== 'not_ready'
  const dispositionRequired = session?.waiting_for_disposition ?? false

  // ── Main queue UI ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto">
      {/* Stage filter pills */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-2.5 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-xs text-gray-400 mr-1 shrink-0">Queue:</span>
          {QUEUE_STAGES.map(s => (
            <button
              key={s.key}
              onClick={() => { setQueueStage(s.key); setDone(0); setSkipped(0) }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                queueStage === s.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-gray-400">{remaining} left</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-1 bg-green-500 transition-all duration-300"
          style={{ width: total ? `${(index / total) * 100}%` : '0%' }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Left: lead card */}
        <div className="space-y-4">
          {/* Lead info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {current ? `${current.first_name} ${current.last_name ?? ''}` : 'No lead'}
                </h2>
                {current?.business_name && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                    <Building2 size={13} /> {current.business_name}
                  </p>
                )}
                {current?.last_call_outcome && (
                  <span className="inline-block mt-1 text-[11px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                    Last: {current.last_call_outcome}
                  </span>
                )}
                {current?.promoted_to_crm_lead_id && (
                  <span className="inline-block mt-1 text-[11px] bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 ml-1">
                    In CRM ✓
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  {index + 1} / {total}
                </p>
                <p className="text-xs text-gray-400">{done} done · {skipped} skipped</p>
              </div>
            </div>

            {/* Session status */}
            <div className={cn(
              'rounded-xl border px-4 py-3 mb-4',
              sessionActive ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50',
            )}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={cn('text-sm font-semibold', sessionActive ? 'text-green-800' : 'text-gray-600')}>
                    {sessionActive ? `Session ${session.session_status}` : 'Session not started'}
                  </p>
                  {callProviderMsg && (
                    <p className="text-xs text-gray-500 mt-0.5">{callProviderMsg}</p>
                  )}
                  {dispositionRequired && (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">Save disposition before dialing next</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {sessionActive ? (
                    called || activeCallId ? (
                      <button
                        onClick={hangUp}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700"
                      >
                        <PhoneOff size={13} /> End Call
                      </button>
                    ) : (
                      <button
                        onClick={setNotReady}
                        disabled={sessionLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60"
                      >
                        <Power size={13} /> End Session
                      </button>
                    )
                  ) : (
                    <button
                      onClick={setReady}
                      disabled={sessionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60"
                    >
                      {sessionLoading ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                      Go Live
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Dial button */}
            <button
              type="button"
              onClick={dial}
              disabled={!current || authorizingCall || !sessionActive || dispositionRequired}
              className={cn(
                'w-full flex items-center justify-center gap-3 rounded-xl py-4 text-base font-bold transition-all',
                !current || !sessionActive || dispositionRequired
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : called
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-green-600 text-white shadow-md hover:bg-green-700 active:scale-[0.98]',
              )}
            >
              {authorizingCall
                ? <><Loader2 size={20} className="animate-spin" /> Connecting...</>
                : <><Phone size={20} /> {current ? `Call ${current.phone}` : 'No lead'}</>
              }
            </button>

            {/* Notes */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
                  Call Note
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Quick note (optional)..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
                  Follow-up / Callback Time
                </label>
                <input
                  type="datetime-local"
                  value={followUpAt}
                  onChange={e => setFollowUpAt(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-gray-50"
                />
              </div>
            </div>
          </div>

          {/* Lead notes */}
          {current?.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">Lead Notes</p>
              <p className="text-sm text-amber-900 leading-relaxed">{current.notes}</p>
            </div>
          )}
        </div>

        {/* Right: disposition panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Call Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {DISPOSITIONS.map(d => {
                const Icon = d.icon
                return (
                  <button
                    key={d.key}
                    onClick={() => dispositionAndAdvance(d)}
                    disabled={acting}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50',
                      d.color,
                    )}
                  >
                    <Icon size={16} /> {d.label}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={skip}
                disabled={!current || acting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={15} /> Skip
              </button>
            </div>
          </div>

          {/* Call position */}
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Position</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{index + 1}/{total}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Done</p>
              <p className="text-lg font-bold text-green-600 mt-0.5">{done}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Skipped</p>
              <p className="text-lg font-bold text-gray-500 mt-0.5">{skipped}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
