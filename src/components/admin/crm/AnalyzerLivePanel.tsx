'use client'

import { useEffect, useState } from 'react'
import { Activity, Copy, ExternalLink, Loader2, Radio, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type AnalyzerSession = {
  id: string
  lead_id: string
  rep_name: string | null
  source_context: string | null
  session_status: string | null
  tracked_url: string | null
  link_sent_at: string | null
  link_opened_at: string | null
  analyzer_started_at: string | null
  analyzer_submitted_at: string | null
  readiness_score: number | null
  readiness_status: string | null
  analyzer_summary: string | null
  account_created: boolean | null
  account_created_at: string | null
  latest_event_type: string | null
  last_event_at: string | null
  created_at: string
}

type AnalyzerEvent = {
  id: string
  session_id: string
  event_type: string
  event_at: string
  metadata: Record<string, unknown> | null
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function titleizeStatus(status: string | null | undefined) {
  if (!status) return 'Not started'
  return status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function statusTone(status: string | null | undefined) {
  switch (status) {
    case 'converted':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    case 'account_created':
    case 'readiness_score_generated':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    case 'analyzer_submitted':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    case 'analyzer_started':
    case 'link_opened':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  }
}

interface Props {
  leadId: string
  sourceContext: 'lead_detail' | 'dialer'
  compact?: boolean
}

export default function AnalyzerLivePanel({ leadId, sourceContext, compact = false }: Props) {
  const [sessions, setSessions] = useState<AnalyzerSession[]>([])
  const [events, setEvents] = useState<AnalyzerEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/crm/leads/${leadId}/analyzer-session`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to load analyzer live data')
        return
      }
      setSessions(json.sessions ?? [])
      setEvents(json.events ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [leadId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`crm-analyzer-live-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_analyzer_sessions', filter: `lead_id=eq.${leadId}` }, () => {
        void load()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_analyzer_events', filter: `lead_id=eq.${leadId}` }, () => {
        void load()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [leadId]) // eslint-disable-line react-hooks/exhaustive-deps

  const latestSession = sessions[0] ?? null
  const latestEvents = events.filter((event) => event.session_id === latestSession?.id).slice(0, compact ? 4 : 8)

  async function createLiveLink() {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch(`/api/admin/crm/leads/${leadId}/analyzer-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_context: sourceContext }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to create live analyzer link')
        return
      }
      setSessions((current) => [json.session, ...current])
      if (json.tracked_url && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json.tracked_url)
        toast.success('Live analyzer link copied')
      } else if (json.tracked_url) {
        toast.success(json.tracked_url)
      }
    } catch {
      toast.error('Failed to create live analyzer link')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-green-600" />
            <h2 className="font-bold text-gray-900 dark:text-white">Live analyzer</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">Rep-facing real-time analyzer status from persisted DB events.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900" aria-label="Refresh analyzer live data">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={createLiveLink}
            disabled={creating}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
            Copy live link
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" />
          Loading analyzer session data...
        </div>
      ) : (
        <>
          <div className={cn('mt-4 grid gap-4', compact ? 'md:grid-cols-2' : 'lg:grid-cols-4')}>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current status</p>
              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{titleizeStatus(latestSession?.latest_event_type ?? latestSession?.session_status)}</p>
              <span className={cn('mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', statusTone(latestSession?.latest_event_type ?? latestSession?.session_status))}>
                {latestSession ? `Latest ${titleizeStatus(latestSession.latest_event_type ?? latestSession.session_status)}` : 'No live session yet'}
              </span>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Readiness score</p>
              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {typeof latestSession?.readiness_score === 'number' ? `${latestSession.readiness_score}/100` : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-500">{latestSession?.readiness_status ?? 'Waiting for score'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Account created</p>
              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{latestSession?.account_created ? 'Yes' : 'No'}</p>
              <p className="mt-1 text-xs text-gray-500">{formatDateTime(latestSession?.account_created_at)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Latest active session</p>
              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{latestSession ? formatDateTime(latestSession.last_event_at ?? latestSession.created_at) : '—'}</p>
              <p className="mt-1 text-xs text-gray-500">{latestSession?.rep_name ? `Rep: ${latestSession.rep_name}` : 'No rep assigned'}</p>
            </div>
          </div>

          {latestSession?.analyzer_summary && (
            <div className="mt-4 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Score summary</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">{latestSession.analyzer_summary}</p>
              {latestSession.tracked_url && (
                <a href={latestSession.tracked_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700">
                  Open tracked analyzer link <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-gray-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Live event timeline</p>
              </div>
              <div className="mt-3 space-y-2">
                {latestEvents.length === 0 && (
                  <p className="text-sm text-gray-500">No live analyzer events yet.</p>
                )}
                {latestEvents.map((event) => (
                  (() => {
                    const analyzerSummary =
                      typeof event.metadata?.analyzer_summary === 'string'
                        ? event.metadata.analyzer_summary
                        : null

                    return (
                      <div key={event.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{titleizeStatus(event.event_type)}</p>
                          <p className="text-xs text-gray-500">{formatDateTime(event.event_at)}</p>
                        </div>
                        {analyzerSummary && (
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{analyzerSummary}</p>
                        )}
                      </div>
                    )
                  })()
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Session history</p>
              <div className="mt-3 space-y-2">
                {sessions.length === 0 && (
                  <p className="text-sm text-gray-500">No analyzer sessions created from CRM yet.</p>
                )}
                {sessions.map((session, index) => (
                  <div key={session.id} className={cn('rounded-lg px-3 py-2', index === 0 ? 'bg-green-50 dark:bg-green-950/20' : 'bg-gray-50 dark:bg-gray-900')}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{index === 0 ? 'Latest active' : `Session ${sessions.length - index}`}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusTone(session.latest_event_type ?? session.session_status))}>
                        {titleizeStatus(session.latest_event_type ?? session.session_status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{formatDateTime(session.last_event_at ?? session.created_at)} • {session.source_context ?? 'crm'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
