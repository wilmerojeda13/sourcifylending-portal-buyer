'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, CalendarDays, ChevronLeft, ChevronRight, Link2, AlertCircle } from 'lucide-react'
import CRMWorkspaceNav from '@/components/crm/CRMWorkspaceNav'
import toast from 'react-hot-toast'

interface CalendarEventRecord {
  id: string
  source: 'google' | 'crm_task' | 'crm_callback'
  type: string
  title: string
  start: string
  end: string
  detail_url: string | null
  description?: string | null
  htmlLink?: string | null
  priority?: string
  temperature?: string
}

export default function CalendarClient() {
  const [view, setView] = useState('week')
  const [cursor, setCursor] = useState(() => new Date().toISOString())
  const [events, setEvents] = useState<CalendarEventRecord[]>([])
  const [loadGoogle, setLoadGoogle] = useState(false)
  const [loading, setLoading] = useState(true)
  const [googleInfo, setGoogleInfo] = useState<{ configured: boolean; error: string | null; timezone: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const params = new URLSearchParams({ view, cursor })
      if (loadGoogle) params.set('google', 'true')
      const res = await fetch(`/api/admin/crm/calendar?${params.toString()}`)
      const json = await res.json()
      if (!active) return
      setEvents(json.events ?? [])
      setGoogleInfo(json.google_calendar ?? null)
      setNotice(Array.isArray(json.warnings) && json.warnings.length > 0 ? json.warnings[0] : null)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [cursor, loadGoogle, view])

  function shift(amount: number) {
    const next = new Date(cursor)
    if (view === 'day') next.setDate(next.getDate() + amount)
    else if (view === 'month') next.setMonth(next.getMonth() + amount)
    else next.setDate(next.getDate() + amount * 7)
    setCursor(next.toISOString())
  }

  async function quickTaskFromEvent(event: CalendarEventRecord) {
    const res = await fetch('/api/admin/crm/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Follow up: ${event.title}`,
        description: event.description || `Created from calendar item (${event.source})`,
        task_type: 'Follow-Up',
        priority: event.source === 'crm_callback' ? 'High' : 'Medium',
        due_at: event.start,
      }),
    })
    if (!res.ok) {
      toast.error('Unable to create follow-up task')
      return
    }
    toast.success('Follow-up task created')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 dark:bg-gray-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6">
        <CRMWorkspaceNav />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-green-600">Calendar</p>
            <h1 className="mt-0.5 text-xl font-bold text-gray-900 dark:text-white">CRM calendar workspace</h1>
            <p className="mt-0.5 text-sm text-gray-500">Google events, callback reminders, and task due dates in one schedule.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['day', 'week', 'month', 'agenda'].map(item => (
              <button
                key={item}
                onClick={() => setView(item)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === item
                    ? 'bg-green-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-green-700 dark:hover:text-green-300'
                }`}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <button onClick={() => shift(-1)} className="rounded-xl border border-gray-200 p-2 hover:border-green-300 dark:border-gray-800 dark:hover:border-green-700"><ChevronLeft size={16} /></button>
            <button onClick={() => shift(1)} className="rounded-xl border border-gray-200 p-2 hover:border-green-300 dark:border-gray-800 dark:hover:border-green-700"><ChevronRight size={16} /></button>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{new Date(cursor).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              <p className="text-xs text-gray-500">Viewing {view} calendar</p>
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
            <p className="font-semibold text-gray-900 dark:text-white">Google Calendar</p>
            <p className="text-gray-500">
              {loadGoogle
                ? (googleInfo?.configured ? `Configured (${googleInfo.timezone})` : 'Not connected yet')
                : 'Deferred until requested'}
            </p>
            {!loadGoogle && (
              <button onClick={() => setLoadGoogle(true)} className="mt-2 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:text-gray-200">
                Load Google events
              </button>
            )}
            {googleInfo?.error && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-600"><AlertCircle size={12} /> {googleInfo.error}</p>
            )}
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
            {notice}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {loading && (
            <div className="flex items-center justify-center px-5 py-12">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          )}
          {!loading && events.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-gray-500">Nothing is scheduled in this window yet.</div>
          )}
          {!loading && events.map(event => (
            <div key={event.id} className="border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      event.source === 'google'
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300'
                        : event.source === 'crm_callback'
                          ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300'
                          : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300'
                    }`}>
                      {event.source === 'google' ? 'Google Event' : event.source === 'crm_callback' ? 'Callback' : 'CRM Task'}
                    </span>
                    {event.temperature && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-300">{event.temperature}</span>}
                    {event.priority && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{event.priority}</span>}
                  </div>
                  <p className="mt-1.5 text-base font-semibold text-gray-900 dark:text-white">{event.title}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {new Date(event.start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {event.description && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{event.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.detail_url && (
                    <Link href={event.detail_url} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-800 dark:text-gray-300 dark:hover:border-green-700 dark:hover:text-green-300">
                      <CalendarDays size={13} /> Open details
                    </Link>
                  )}
                  {event.htmlLink && (
                    <Link href={event.htmlLink} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-800 dark:text-gray-300 dark:hover:border-green-700 dark:hover:text-green-300">
                      <Link2 size={13} /> Open Google
                    </Link>
                  )}
                  <button onClick={() => quickTaskFromEvent(event)} className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                    Create follow-up
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
