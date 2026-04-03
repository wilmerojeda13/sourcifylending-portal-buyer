'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Phone, CalendarClock, Flame, CheckCircle2, AlertTriangle, BarChart3, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OverviewResponse {
  range: { from: string; to: string; label: string }
  kpis: {
    total_calls_made: number
    total_connects: number
    contact_rate: number
    booked_calls: number
    booked_call_rate: number
    closed_deals: number
    close_rate: number
    follow_ups_pending: number
    callbacks_due_today: number
    hot_leads_count: number
    calls_today: number
    calls_this_week: number
    calls_this_month: number
    average_calls_per_day: number
    average_talk_time_seconds: number
    texts_sent: number
    texts_delivered: number
    text_click_rate: number
    inbound_replies: number
    text_reply_rate: number
    unread_text_conversations: number
    leads_texted: number
    text_to_signup_conversion: number
    text_to_booked_demo_conversion: number
    text_to_paid_client_conversion: number
  }
  charts: {
    call_volume_over_time: { label: string; value: number }[]
    outcomes_breakdown: { label: string; value: number }[]
    conversions_over_time: { label: string; value: number }[]
    conversion_by_source: { label: string; total: number; won: number; rate: number }[]
    conversion_by_agent: { label: string; total: number; won: number; rate: number }[]
  }
  lists: {
    top_hot_leads: { id: string; name: string; business_name: string | null; callback_due_at: string | null; latest_call_note: string | null; stage: string; close_probability: number | null }[]
    scheduled_callbacks: { id: string; title: string; due_at: string | null; priority: string; crm_leads?: { id: string; first_name: string; last_name: string; business_name: string | null } }[]
    overdue_tasks: { id: string; title: string; due_at: string | null; priority: string; lead_id: string | null; crm_leads?: { first_name: string; last_name: string; business_name: string | null } }[]
    leads_with_no_recent_activity: { id: string; first_name: string; last_name: string; business_name: string | null; last_contacted_at?: string | null }[]
  }
  warnings?: string[]
}

function secondsToLabel(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${String(secs).padStart(2, '0')}s`
}

function formatDateTime(value: string | null) {
  if (!value) return 'No date set'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string | number
  detail: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="mt-1 text-sm text-gray-500">{detail}</p>
        </div>
        <div className="rounded-xl bg-green-50 p-2.5 text-green-600 dark:bg-green-950/30 dark:text-green-400">
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

function SimpleBars({ items, color = 'bg-green-500' }: { items: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...items.map(item => item.value), 1)
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-gray-500">No data in this range yet.</p>}
      {items.map(item => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-gray-700 dark:text-gray-200">{item.label}</span>
            <span className="text-gray-500">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
            <div className={cn('h-2 rounded-full', color)} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CRMSalesOverview({ compact = false }: { compact?: boolean }) {
  const [range, setRange] = useState('this_month')
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load(showLoader = true) {
      if (showLoader) setLoading(true)
      try {
        const res = await fetch(`/api/admin/crm/overview?range=${range}`, { cache: 'no-store' })
        const json = await res.json()
        if (!active) return
        setData(res.ok ? json : null)
      } finally {
        if (active && showLoader) setLoading(false)
      }
    }

    function refreshSilently() {
      void load(false)
    }

    void load()

    const interval = window.setInterval(refreshSilently, 30000)
    const handleFocus = () => refreshSilently()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshSilently()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [range])

  if (loading) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
        CRM analytics could not be loaded right now.
      </div>
    )
  }

  return (
    <section className="space-y-5">
      {data.warnings && data.warnings.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          {data.warnings[0]}
        </div>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">Sales Workspace</p>
          <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Calls, callbacks, and follow-up at a glance</h2>
          <p className="mt-1 text-sm text-gray-500">Track volume, focus the hot deals, and keep today’s pipeline moving.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ['today', 'Today'],
            ['this_week', 'This Week'],
            ['this_month', 'This Month'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={cn(
                'rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                range === value
                  ? 'bg-green-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-green-700 dark:hover:text-green-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Calls" value={data.kpis.total_calls_made} detail={`${data.kpis.calls_today} today`} icon={Phone} />
        <StatCard label="Contact Rate" value={`${data.kpis.contact_rate}%`} detail={`${data.kpis.total_connects} connects`} icon={BarChart3} />
        <StatCard label="Callbacks Due" value={data.kpis.callbacks_due_today} detail={`${data.kpis.follow_ups_pending} follow-ups open`} icon={CalendarClock} />
        <StatCard label="Hot Leads" value={data.kpis.hot_leads_count} detail={`${data.kpis.closed_deals} closed in range`} icon={Flame} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Texts Sent" value={data.kpis.texts_sent} detail={`${data.kpis.leads_texted} unique leads`} icon={MessageSquare} />
        <StatCard label="Texts Delivered" value={data.kpis.texts_delivered} detail={`${data.kpis.text_click_rate}% click rate`} icon={CheckCircle2} />
        <StatCard label="Replies" value={data.kpis.inbound_replies} detail={`${data.kpis.text_reply_rate}% reply rate`} icon={BarChart3} />
        <StatCard label="Unread Texts" value={data.kpis.unread_text_conversations} detail={`${data.kpis.text_to_signup_conversion}% to signup`} icon={Flame} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
        <StatCard label="Text → Signup" value={`${data.kpis.text_to_signup_conversion}%`} detail={`${data.kpis.text_to_booked_demo_conversion}% to booked demo`} icon={BarChart3} />
        <StatCard label="Text → Paid" value={`${data.kpis.text_to_paid_client_conversion}%`} detail="Attributed to leads that received texts" icon={Flame} />
      </div>

      <div className={cn('grid gap-5', compact ? 'xl:grid-cols-2' : 'xl:grid-cols-[1.4fr_1fr]')}>
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Call volume over time</h3>
              <p className="text-sm text-gray-500">Average {data.kpis.average_calls_per_day} calls per day, talk time {secondsToLabel(data.kpis.average_talk_time_seconds)}</p>
            </div>
            {!compact && <Link href="/admin/crm/analytics" className="text-sm font-medium text-green-600 hover:text-green-700">Open analytics</Link>}
          </div>
          <SimpleBars items={data.charts.call_volume_over_time} />
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Outcome breakdown</h3>
          <p className="mb-4 text-sm text-gray-500">Booked rate {data.kpis.booked_call_rate}% and close rate {data.kpis.close_rate}%</p>
          <SimpleBars items={data.charts.outcomes_breakdown} color="bg-emerald-500" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Top hot leads needing action</h3>
            <Flame size={18} className="text-orange-500" />
          </div>
          <div className="space-y-3">
            {data.lists.top_hot_leads.length === 0 && <p className="text-sm text-gray-500">No hot leads are waiting right now.</p>}
            {data.lists.top_hot_leads.map(lead => (
              <Link key={lead.id} href={`/admin/crm/${lead.id}`} className="block rounded-2xl border border-gray-200 p-3 hover:border-green-300 dark:border-gray-800 dark:hover:border-green-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{lead.name}</p>
                    {lead.business_name && <p className="text-sm text-gray-500">{lead.business_name}</p>}
                    <p className="mt-1 text-xs text-gray-500">Callback {formatDateTime(lead.callback_due_at)}</p>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                    {lead.close_probability ?? 0}%
                  </span>
                </div>
                {lead.latest_call_note && <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{lead.latest_call_note}</p>}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Scheduled callbacks</h3>
            <CalendarClock size={18} className="text-blue-500" />
          </div>
          <div className="space-y-3">
            {data.lists.scheduled_callbacks.length === 0 && <p className="text-sm text-gray-500">No callbacks are scheduled yet.</p>}
            {data.lists.scheduled_callbacks.map(task => (
              <div key={task.id} className="rounded-2xl border border-gray-200 p-3 dark:border-gray-800">
                <p className="font-semibold text-gray-900 dark:text-white">{task.title}</p>
                <p className="text-sm text-gray-500">{formatDateTime(task.due_at)}</p>
                {task.crm_leads && (
                  <Link href={`/admin/crm/${task.crm_leads.id}`} className="mt-1 inline-block text-sm text-green-600 hover:text-green-700">
                    {[task.crm_leads.first_name, task.crm_leads.last_name].filter(Boolean).join(' ')}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Overdue follow-up</h3>
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div className="space-y-3">
            {data.lists.overdue_tasks.length === 0 && <p className="text-sm text-gray-500">Nothing overdue right now.</p>}
            {data.lists.overdue_tasks.map(task => (
              <div key={task.id} className="rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-red-900 dark:text-red-200">{task.title}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-red-600 dark:bg-red-950/50 dark:text-red-300">{task.priority}</span>
                </div>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">{formatDateTime(task.due_at)}</p>
                {task.lead_id && <Link href={`/admin/crm/${task.lead_id}`} className="mt-1 inline-block text-sm font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-300">Open lead</Link>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!compact && (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Conversion by source</h3>
            <p className="mb-4 text-sm text-gray-500">Measure which lead channels are actually producing revenue.</p>
            <SimpleBars items={data.charts.conversion_by_source.map(item => ({ label: `${item.label} (${item.rate}%)`, value: item.won }))} color="bg-blue-500" />
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Conversion by agent</h3>
            <p className="mb-4 text-sm text-gray-500">Multi-user visibility is ready if more closers are added.</p>
            <SimpleBars items={data.charts.conversion_by_agent.map(item => ({ label: `${item.label} (${item.rate}%)`, value: item.won }))} color="bg-purple-500" />
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-green-600" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Priority sales board</h3>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/admin/crm?temperature=hot" className="rounded-2xl border border-gray-200 p-4 hover:border-green-300 dark:border-gray-800 dark:hover:border-green-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Hot leads needing action</p>
            <p className="mt-1 text-2xl font-bold text-orange-600">{data.kpis.hot_leads_count}</p>
          </Link>
          <Link href="/admin/crm/tasks?bucket=today" className="rounded-2xl border border-gray-200 p-4 hover:border-green-300 dark:border-gray-800 dark:hover:border-green-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Callbacks due today</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{data.kpis.callbacks_due_today}</p>
          </Link>
          <Link href="/admin/crm/tasks?bucket=overdue" className="rounded-2xl border border-gray-200 p-4 hover:border-green-300 dark:border-gray-800 dark:hover:border-green-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Overdue follow-up</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{data.lists.overdue_tasks.length}</p>
          </Link>
          <Link href="/admin/crm?open_tasks=true" className="rounded-2xl border border-gray-200 p-4 hover:border-green-300 dark:border-gray-800 dark:hover:border-green-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Leads with open tasks</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{data.kpis.follow_ups_pending}</p>
          </Link>
        </div>
      </div>
    </section>
  )
}
