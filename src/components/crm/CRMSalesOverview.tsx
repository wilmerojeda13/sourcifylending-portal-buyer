'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, CalendarClock, Flame, CheckCircle2, Users } from 'lucide-react'

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
    total_leads: number
    active_leads_count: number
    open_pipeline_leads: number
    calls_today: number
    calls_this_week: number
    calls_this_month: number
    average_calls_per_day: number
    average_talk_time_seconds: number
  }
  warnings?: string[]
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
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="mt-0.5 text-xs text-gray-500">{detail}</p>
        </div>
        <div className="rounded-lg bg-green-50 p-2 text-green-600 dark:bg-green-950/30 dark:text-green-400">
          <Icon size={16} />
        </div>
      </div>
    </div>
  )
}

export default function CRMSalesOverview() {
  const [range, setRange] = useState('this_month')
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      try {
        const response = await fetch(`/api/admin/crm/overview?range=${range}`, { cache: 'no-store' })
        const json = await response.json()
        if (active) {
          setData(response.ok ? json : null)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
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
    <section className="space-y-4">
      {data.warnings && data.warnings.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          {data.warnings[0]}
        </div>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-green-600">Sales CRM</p>
          <h2 className="mt-0.5 text-xl font-bold text-gray-900 dark:text-white">Pipeline and promoted leads</h2>
          <p className="mt-0.5 text-sm text-gray-500">Compact overview only. Deep analytics stay off the first paint path.</p>
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
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                range === value
                  ? 'bg-green-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-green-700 dark:hover:text-green-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads in Range" value={data.kpis.total_leads ?? 0} detail={`${data.kpis.active_leads_count ?? 0} active CRM leads`} icon={Users} />
        <StatCard label="Hot Leads" value={data.kpis.hot_leads_count} detail="Ready for attention" icon={Flame} />
        <StatCard label="Callbacks Due" value={data.kpis.callbacks_due_today} detail={`${data.kpis.follow_ups_pending} follow-ups open`} icon={CalendarClock} />
        <StatCard label="Close Rate" value={`${data.kpis.close_rate}%`} detail={`${data.kpis.closed_deals} won / ${data.kpis.total_connects} connects`} icon={CheckCircle2} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/crm?focus=leads&temperature=hot" className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-green-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-green-700">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Hot leads needing action</p>
          <p className="mt-1 text-xl font-bold text-orange-600">{data.kpis.hot_leads_count}</p>
        </Link>
        <Link href="/admin/crm/tasks?bucket=today" className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-green-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-green-700">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Callbacks due today</p>
          <p className="mt-1 text-xl font-bold text-blue-600">{data.kpis.callbacks_due_today}</p>
        </Link>
        <Link href="/admin/crm?focus=leads&open_tasks=true" className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-green-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-green-700">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Leads with open tasks</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{data.kpis.follow_ups_pending}</p>
        </Link>
        <Link href="/admin/crm?focus=leads&view=board" className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-green-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-green-700">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Open pipeline leads</p>
          <p className="mt-1 text-xl font-bold text-green-600">{data.kpis.open_pipeline_leads}</p>
        </Link>
      </div>
    </section>
  )
}
