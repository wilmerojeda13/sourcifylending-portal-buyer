'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, PhoneCall, Clock3, Filter, Flame } from 'lucide-react'
import CRMWorkspaceNav from '@/components/crm/CRMWorkspaceNav'
import { CRM_CALL_OUTCOMES, CRM_LEAD_TEMPERATURES } from '@/lib/crm'

interface CallRecord {
  id: string
  lead_id: string
  lead_name: string
  company_name: string | null
  phone_number: string
  call_started_at: string
  duration_seconds: number | null
  call_status: string
  call_outcome: string
  notes: string | null
  next_follow_up_at: string | null
  lead_temperature: string
  strategy_call_booked: boolean
  converted_to_client: boolean
  agent_name: string | null
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '0m'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${String(secs).padStart(2, '0')}s`
}

export default function CallsClient() {
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [outcome, setOutcome] = useState('')
  const [temperature, setTemperature] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (outcome) params.set('outcome', outcome)
        if (temperature) params.set('temperature', temperature)
        const res = await fetch(`/api/admin/crm/calls?${params}`)
        const json = await res.json()
        if (active) {
          setCalls(json.calls ?? [])
          setNotice(!res.ok ? (json.error ?? 'Unable to load call history right now.') : (json.message ?? null))
        }
      } catch {
        if (active) {
          setCalls([])
          setNotice('Unable to load call history right now.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [outcome, temperature])

  return (
    <div className="min-h-screen bg-gray-50 pb-24 dark:bg-gray-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <CRMWorkspaceNav />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">Calls</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">Dialer call tracker</h1>
            <p className="mt-1 text-sm text-gray-500">Every disposition, every callback, and every close in one place.</p>
          </div>
          <Link href="/admin/crm/dialer" className="inline-flex items-center justify-center rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
            Open Dialer
          </Link>
        </div>

        <div className="grid gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-3 dark:border-gray-800 dark:bg-gray-900">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
            <span className="mb-2 flex items-center gap-2"><Filter size={14} /> Outcome</span>
            <select value={outcome} onChange={e => setOutcome(e.target.value)} className="input-field">
              <option value="">All outcomes</option>
              {CRM_CALL_OUTCOMES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
            <span className="mb-2 flex items-center gap-2"><Flame size={14} /> Temperature</span>
            <select value={temperature} onChange={e => setTemperature(e.target.value)} className="input-field">
              <option value="">All temperatures</option>
              {CRM_LEAD_TEMPERATURES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Loaded calls</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{calls.length}</p>
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
            {notice}
          </div>
        )}

        <div className="hidden overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm md:block dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr] gap-3 border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 md:grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr]">
            <span>Lead</span>
            <span className="hidden md:block">Agent</span>
            <span>Outcome</span>
            <span>Time</span>
            <span>Duration</span>
            <span>Next Step</span>
          </div>
          {loading && (
            <div className="flex items-center justify-center px-5 py-20">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          )}
          {!loading && calls.length === 0 && (
            <div className="px-5 py-20 text-center text-sm text-gray-500">No calls match this filter yet.</div>
          )}
          {!loading && calls.map(call => (
            <div key={call.id} className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr] gap-3 border-b border-gray-100 px-5 py-4 text-sm last:border-b-0 dark:border-gray-800 md:grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr]">
              <div className="min-w-0">
                <Link href={`/admin/crm/${call.lead_id}`} className="font-semibold text-gray-900 hover:text-green-600 dark:text-white dark:hover:text-green-400">
                  {call.lead_name}
                </Link>
                <p className="truncate text-gray-500">{call.company_name || call.phone_number}</p>
              </div>
              <div className="hidden text-gray-600 dark:text-gray-300 md:block">{call.agent_name || 'Admin'}</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{call.call_outcome}</p>
                <p className="text-gray-500">{call.lead_temperature}</p>
              </div>
              <div className="text-gray-600 dark:text-gray-300">
                <div className="flex items-center gap-1.5"><Clock3 size={13} /> {new Date(call.call_started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
              <div className="text-gray-600 dark:text-gray-300">{formatDuration(call.duration_seconds)}</div>
              <div className="text-gray-600 dark:text-gray-300">
                {call.next_follow_up_at ? new Date(call.next_follow_up_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'None'}
                {call.strategy_call_booked && <div className="mt-1 text-xs font-semibold text-purple-600">Booked call</div>}
                {call.converted_to_client && <div className="mt-1 text-xs font-semibold text-green-600">Closed won</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 md:hidden">
          {loading && (
            <div className="flex items-center justify-center rounded-3xl border border-gray-200 bg-white px-5 py-20 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          )}
          {!loading && calls.length === 0 && (
            <div className="rounded-3xl border border-gray-200 bg-white px-5 py-16 text-center text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              No calls match this filter yet.
            </div>
          )}
          {!loading && calls.map(call => (
            <div key={call.id} className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/admin/crm/${call.lead_id}`} className="font-semibold text-gray-900 hover:text-green-600 dark:text-white dark:hover:text-green-400">
                    {call.lead_name}
                  </Link>
                  <p className="mt-1 text-sm text-gray-500">{call.company_name || call.phone_number}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {call.agent_name || 'Admin'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Outcome</p>
                  <p className="mt-1 font-medium text-gray-900 dark:text-white">{call.call_outcome}</p>
                  <p className="text-gray-500">{call.lead_temperature}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Duration</p>
                  <p className="mt-1 text-gray-700 dark:text-gray-300">{formatDuration(call.duration_seconds)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Call Time</p>
                  <p className="mt-1 flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                    <Clock3 size={13} /> {new Date(call.call_started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Next Step</p>
                  <p className="mt-1 text-gray-700 dark:text-gray-300">
                    {call.next_follow_up_at ? new Date(call.next_follow_up_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'None'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {call.strategy_call_booked && <span className="rounded-full bg-purple-100 px-2 py-1 text-[10px] font-semibold text-purple-600">Booked call</span>}
                    {call.converted_to_client && <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-semibold text-green-600">Closed won</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
