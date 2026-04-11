import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Download,
  Filter,
  Phone,
  ShieldAlert,
  Target,
  TrendingUp,
} from 'lucide-react'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import DialerNav from '@/components/dialer/DialerNav'
import { AnalyticsRow, getAnalyticsDataset, getDefaultFilters } from './analytics-data'

export const metadata = { title: 'Analytics - Dialer' }

const CONNECT_OUTCOMES = new Set([
  'contacted',
  'interested',
  'callback',
  'follow_up',
  'qualified',
  'not_interested',
  'dnc',
])

const INTERESTED_OUTCOMES = new Set(['interested', 'callback', 'follow_up', 'qualified'])
const APPOINTMENT_OUTCOMES = new Set(['appointment_set', 'booked_call'])

function percent(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0.0%'
}

function hourLabel(hour: number) {
  const normalized = hour % 24
  const suffix = normalized >= 12 ? 'PM' : 'AM'
  const twelve = normalized % 12 || 12
  return `${twelve} ${suffix}`
}

function dateLabel(input: string) {
  return new Date(`${input}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function getBarWidth(value: number, maxValue: number) {
  if (maxValue <= 0) return '0%'
  return `${Math.max((value / maxValue) * 100, value > 0 ? 4 : 0)}%`
}

function getDayBuckets(rows: AnalyticsRow[], startDate: string, endDate: string, predicate?: (row: AnalyticsRow) => boolean) {
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const buckets: Array<{ key: string; value: number }> = []

  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10)
    buckets.push({ key, value: 0 })
  }

  const indexMap = new Map(buckets.map((bucket, index) => [bucket.key, index]))
  rows.forEach(row => {
    if (predicate && !predicate(row)) return
    const key = row.last_called_at.slice(0, 10)
    const bucketIndex = indexMap.get(key)
    if (bucketIndex !== undefined) buckets[bucketIndex].value += 1
  })

  return buckets
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  detail: string
  icon: React.ElementType
  tone: string
}) {
  return (
    <div className="min-h-[112px] rounded-xl border border-gray-800 bg-[#111827] p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.16)] sm:min-h-0 sm:p-5">
      <div className="flex h-full items-start justify-between gap-3 sm:gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 sm:text-xs sm:tracking-[0.18em]">{label}</p>
          <p className="mt-2 text-[1.55rem] font-semibold leading-none text-white sm:mt-3 sm:text-3xl">{value}</p>
          <p className="mt-1.5 text-[11px] leading-4 text-gray-400 sm:text-sm">{detail}</p>
        </div>
        <div className={`rounded-lg border p-2.5 ${tone}`}>
          <Icon size={16} className="sm:size-[18px]" />
        </div>
      </div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  data,
  colorClass,
}: {
  title: string
  subtitle: string
  data: Array<{ key: string; value: number }>
  colorClass: string
}) {
  const maxValue = Math.max(...data.map(item => item.value), 1)
  const mobileData = data.slice(-7)

  return (
    <section className="rounded-xl border border-gray-800 bg-[#111827] p-3 sm:p-5">
      <div className="flex items-start justify-between gap-3 sm:items-end sm:gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white sm:text-lg">{title}</h2>
          <p className="mt-1 text-[11px] text-gray-400 sm:text-sm">{subtitle}</p>
        </div>
        <p className="hidden text-[10px] uppercase tracking-[0.16em] text-gray-500 sm:block">{data.length} days</p>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5 sm:hidden">
        {mobileData.map(item => (
          <div key={`mobile-${item.key}`} className="flex min-w-0 flex-col items-center justify-end gap-1">
            <div className="flex h-[4.25rem] w-full items-end">
              <div
                className={`w-full rounded-t-md ${colorClass}`}
                style={{ height: getBarWidth(item.value, maxValue) }}
              />
            </div>
            <div className="truncate text-[8px] leading-none text-gray-500">
              {dateLabel(item.key)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 hidden h-[14rem] items-end gap-1 sm:mt-6 sm:flex sm:h-56 sm:gap-2">
        {data.map(item => (
          <div key={item.key} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <div className="hidden text-[10px] font-medium text-gray-500 opacity-0 transition-opacity group-hover:opacity-100 sm:block">
              {item.value}
            </div>
            <div className="flex h-full w-full items-end">
              <div
                className={`w-full rounded-t-md ${colorClass}`}
                style={{ height: getBarWidth(item.value, maxValue) }}
              />
            </div>
            <div className="max-w-full truncate text-[8px] leading-none text-gray-500 sm:text-[10px]">
              {dateLabel(item.key)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default async function DialerAnalyticsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  const filters = getDefaultFilters(searchParams)
  const { campaigns, repOptions, rows, sourceOptions } = await getAnalyticsDataset(filters)

  const totalDials = rows.length
  const connectedRows = rows.filter(row => row.last_call_outcome && CONNECT_OUTCOMES.has(row.last_call_outcome))
  const qualifiedRows = rows.filter(row => row.status === 'qualified' || row.status === 'promoted' || row.last_call_outcome === 'qualified')
  const appointmentRows = rows.filter(row => row.last_call_outcome && APPOINTMENT_OUTCOMES.has(row.last_call_outcome))
  const crmRows = rows.filter(row => row.crm_converted)
  const dncRows = rows.filter(row => row.last_call_outcome === 'dnc')
  const interestedRows = rows.filter(row => row.last_call_outcome && INTERESTED_OUTCOMES.has(row.last_call_outcome))

  const dialsOverTime = getDayBuckets(rows, filters.startDate, filters.endDate)
  const connectsOverTime = getDayBuckets(
    rows,
    filters.startDate,
    filters.endDate,
    row => Boolean(row.last_call_outcome && CONNECT_OUTCOMES.has(row.last_call_outcome))
  )

  const outcomeCounts = new Map<string, number>()
  rows.forEach(row => {
    const key = row.last_call_outcome ?? 'unclassified'
    outcomeCounts.set(key, (outcomeCounts.get(key) ?? 0) + 1)
  })
  const dispositionBreakdown = Array.from(outcomeCounts.entries())
    .map(([outcome, count]) => ({ outcome, count, share: percent(count, totalDials) }))
    .sort((a, b) => b.count - a.count)

  const leaderboardMap = new Map<string, {
    repName: string
    dials: number
    connects: number
    qualified: number
    crm: number
  }>()
  rows.forEach(row => {
    const current = leaderboardMap.get(row.rep_id) ?? {
      repName: row.rep_name,
      dials: 0,
      connects: 0,
      qualified: 0,
      crm: 0,
    }
    current.dials += 1
    if (row.last_call_outcome && CONNECT_OUTCOMES.has(row.last_call_outcome)) current.connects += 1
    if (row.status === 'qualified' || row.status === 'promoted' || row.last_call_outcome === 'qualified') current.qualified += 1
    if (row.crm_converted) current.crm += 1
    leaderboardMap.set(row.rep_id, current)
  })
  const repLeaderboard = Array.from(leaderboardMap.values())
    .map(item => ({
      ...item,
      connectRate: percent(item.connects, item.dials),
      crmRate: percent(item.crm, item.dials),
    }))
    .sort((a, b) => b.crm - a.crm || b.connects - a.connects || b.dials - a.dials)

  const hourMap = new Map<number, { dials: number; connects: number }>()
  rows.forEach(row => {
    const hour = new Date(row.last_called_at).getUTCHours()
    const current = hourMap.get(hour) ?? { dials: 0, connects: 0 }
    current.dials += 1
    if (row.last_call_outcome && CONNECT_OUTCOMES.has(row.last_call_outcome)) current.connects += 1
    hourMap.set(hour, current)
  })
  const timeOfDay = Array.from(hourMap.entries())
    .map(([hour, value]) => ({
      hour,
      label: hourLabel(hour),
      ...value,
      connectRate: percent(value.connects, value.dials),
    }))
    .sort((a, b) => b.connects - a.connects || b.dials - a.dials)

  const campaignMap = new Map<string, {
    name: string
    status: string
    dials: number
    connects: number
    qualified: number
    crm: number
    dnc: number
  }>()
  rows.forEach(row => {
    const current = campaignMap.get(row.campaign_id) ?? {
      name: row.campaign_name,
      status: row.campaign_status,
      dials: 0,
      connects: 0,
      qualified: 0,
      crm: 0,
      dnc: 0,
    }
    current.dials += 1
    if (row.last_call_outcome && CONNECT_OUTCOMES.has(row.last_call_outcome)) current.connects += 1
    if (row.status === 'qualified' || row.status === 'promoted' || row.last_call_outcome === 'qualified') current.qualified += 1
    if (row.crm_converted) current.crm += 1
    if (row.last_call_outcome === 'dnc') current.dnc += 1
    campaignMap.set(row.campaign_id, current)
  })
  const campaignComparison = Array.from(campaignMap.values())
    .map(campaign => ({
      ...campaign,
      connectRate: percent(campaign.connects, campaign.dials),
      crmRate: percent(campaign.crm, campaign.dials),
    }))
    .sort((a, b) => b.dials - a.dials)

  const queryString = new URLSearchParams({
    start: filters.startDate,
    end: filters.endDate,
    campaign: filters.campaignId,
    rep: filters.repId,
    source: filters.source,
  }).toString()

  return (
    <div className="min-h-screen bg-gray-950">
      <DialerNav />

      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-8">
        <section className="rounded-xl border border-gray-800 bg-[#111827] p-3.5 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-300 sm:text-xs">Analytics</p>
                <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2.5 py-1 text-[10px] font-medium text-fuchsia-200 sm:text-[11px]">
                  Reporting workspace
                </span>
              </div>
              <h1 className="mt-2 text-[1.45rem] font-semibold leading-tight text-white sm:text-3xl">Dialer and campaign reporting</h1>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-gray-400 sm:mt-3 sm:text-sm sm:leading-6">
                Campaign operations stay on the Campaigns page. This view is for performance analysis, funnel movement, and conversion reporting.
              </p>
            </div>
            <Link
              href={`/admin/dialer/analytics/export?${queryString}`}
              className="inline-flex self-start items-center gap-2 rounded-lg border border-gray-700 bg-white px-3 py-2 text-xs font-semibold text-gray-950 transition-colors hover:bg-gray-200 sm:self-auto sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Download size={14} className="sm:size-4" />
              Export
            </Link>
          </div>

          <div className="mt-4 sm:hidden">
            <details className="group rounded-xl border border-gray-800 bg-[#0b1220]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-white">
                <span className="inline-flex items-center gap-2">
                  <Filter size={14} />
                  Filters
                </span>
                <span className="text-[11px] font-medium text-gray-400 group-open:text-gray-300">Tap to open</span>
              </summary>
              <form className="grid gap-2.5 border-t border-gray-800 p-3">
                <div className="grid grid-cols-1 gap-2.5">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">Start</span>
                    <input
                      type="date"
                      name="start"
                      defaultValue={filters.startDate}
                      className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">End</span>
                    <input
                      type="date"
                      name="end"
                      defaultValue={filters.endDate}
                      className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">Campaign</span>
                    <select
                      name="campaign"
                      defaultValue={filters.campaignId}
                      className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
                    >
                      <option value="all">All campaigns</option>
                      {campaigns.map(campaign => (
                        <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">Rep</span>
                    <select
                      name="rep"
                      defaultValue={filters.repId}
                      className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
                    >
                      <option value="all">All reps</option>
                      {repOptions.map(rep => (
                        <option key={rep.id} value={rep.id}>{rep.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">Lead Source</span>
                    <select
                      name="source"
                      defaultValue={filters.source}
                      className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
                    >
                      <option value="all">All sources</option>
                      {sourceOptions.map(source => (
                        <option key={source} value={source}>{source}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-950 transition-colors hover:bg-gray-200"
                  >
                    <Filter size={14} />
                    Apply
                  </button>
                  <Link
                    href="/admin/dialer/analytics"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-[#0b1220] px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-[#111a2c]"
                  >
                    <CalendarRange size={14} />
                    Reset
                  </Link>
                </div>
              </form>
            </details>
          </div>

          <form className="mt-5 hidden grid gap-3 rounded-lg border border-gray-800 bg-[#0b1220] p-3 sm:grid md:grid-cols-2 xl:grid-cols-6 sm:p-4">
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Start</span>
              <input
                type="date"
                name="start"
                defaultValue={filters.startDate}
                className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">End</span>
              <input
                type="date"
                name="end"
                defaultValue={filters.endDate}
                className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Campaign</span>
              <select
                name="campaign"
                defaultValue={filters.campaignId}
                className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
              >
                <option value="all">All campaigns</option>
                {campaigns.map(campaign => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Rep</span>
              <select
                name="rep"
                defaultValue={filters.repId}
                className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
              >
                <option value="all">All reps</option>
                {repOptions.map(rep => (
                  <option key={rep.id} value={rep.id}>{rep.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Lead Source</span>
              <select
                name="source"
                defaultValue={filters.source}
                className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-gray-700"
              >
                <option value="all">All sources</option>
                {sourceOptions.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-gray-200"
              >
                <Filter size={15} />
                Apply
              </button>
              <Link
                href="/admin/dialer/analytics"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-[#0b1220] px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-[#111a2c]"
              >
                <CalendarRange size={15} />
                Reset
              </Link>
            </div>
          </form>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-4 xl:grid-cols-4">
          <KpiCard label="Total Dials" value={totalDials.toLocaleString()} detail="Filtered call attempts" icon={Phone} tone="border-sky-400/20 bg-sky-400/10 text-sky-200" />
          <KpiCard label="Connect Rate" value={percent(connectedRows.length, totalDials)} detail={`${connectedRows.length.toLocaleString()} connected calls`} icon={TrendingUp} tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-200" />
          <KpiCard label="CRM Conversion Rate" value={percent(crmRows.length, totalDials)} detail={`${crmRows.length.toLocaleString()} promoted to CRM`} icon={CheckCircle2} tone="border-cyan-400/20 bg-cyan-400/10 text-cyan-200" />
          <KpiCard label="Qualified Rate" value={percent(qualifiedRows.length, totalDials)} detail={`${qualifiedRows.length.toLocaleString()} moved to qualified`} icon={Target} tone="border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200" />
          <KpiCard label="Appointment Set Rate" value={appointmentRows.length > 0 ? percent(appointmentRows.length, totalDials) : '--'} detail={appointmentRows.length > 0 ? `${appointmentRows.length.toLocaleString()} appointment outcomes` : 'Not tracked in dialer outcomes'} icon={Clock3} tone="border-amber-400/20 bg-amber-400/10 text-amber-200" />
          <KpiCard label="DNC Rate" value={percent(dncRows.length, totalDials)} detail={`${dncRows.length.toLocaleString()} marked do not call`} icon={ShieldAlert} tone="border-rose-400/20 bg-rose-400/10 text-rose-200" />
        </div>

        <div className="mt-3 grid gap-2.5 sm:mt-6 sm:gap-6 xl:grid-cols-2">
          <ChartCard
            title="Dials Over Time"
            subtitle="Call volume over the selected period"
            data={dialsOverTime}
            colorClass="bg-emerald-500"
          />
          <ChartCard
            title="Connects Over Time"
            subtitle="Connected conversations over the selected period"
            data={connectsOverTime}
            colorClass="bg-blue-500"
          />
        </div>

        <div className="mt-3 grid gap-2.5 sm:mt-6 sm:gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-xl border border-emerald-400/15 bg-[#111827] p-3 sm:p-5">
            <h2 className="text-sm font-semibold text-white sm:text-lg">Funnel</h2>
            <p className="mt-1 text-[11px] text-gray-400 sm:text-sm">Dialed to CRM conversion flow</p>
            <div className="mt-3 space-y-1.5 sm:mt-6 sm:space-y-3">
              {[
                ['Dialed', totalDials],
                ['Contacted', connectedRows.length],
                ['Interested', interestedRows.length],
                ['Qualified', qualifiedRows.length],
                ['CRM', crmRows.length],
              ].map(([label, count]) => (
                <div key={label} className="rounded-lg border border-gray-800 bg-black/20 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-gray-300 sm:text-sm">{label}</p>
                    <p className="text-base font-semibold text-white sm:text-xl">{Number(count).toLocaleString()}</p>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-800 overflow-hidden sm:mt-3 sm:h-2">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: getBarWidth(Number(count), totalDials || 1) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-sky-400/15 bg-[#111827] p-3 sm:p-5">
            <h2 className="text-sm font-semibold text-white sm:text-lg">Disposition Breakdown</h2>
            <p className="mt-1 text-[11px] text-gray-400 sm:text-sm">Outcome mix across the filtered calls</p>
            <div className="mt-3 space-y-1.5 sm:mt-6 sm:space-y-3">
              {dispositionBreakdown.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-800 px-4 py-5 text-center text-sm text-gray-400">
                  No call outcomes in the selected range.
                </p>
              ) : (
                dispositionBreakdown.map(item => (
                  <div key={item.outcome} className="grid gap-3 sm:grid-cols-[180px_1fr_64px] sm:items-center">
                    <p className="text-sm font-medium text-gray-300">{item.outcome.replace(/_/g, ' ')}</p>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: getBarWidth(item.count, dispositionBreakdown[0]?.count ?? 1) }}
                      />
                    </div>
                    <p className="text-sm text-gray-400 sm:text-right">{item.count} · {item.share}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="mt-3 grid gap-2.5 sm:mt-6 sm:gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-cyan-400/15 bg-[#111827] p-3 sm:p-5">
            <h2 className="text-sm font-semibold text-white sm:text-lg">Rep Leaderboard</h2>
            <p className="mt-1 text-[11px] text-gray-400 sm:text-sm">Based on campaign ownership in the current filters</p>
            <div className="mt-3 overflow-x-auto sm:mt-6">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="border-b border-gray-800 text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                  <tr>
                    <th className="px-2 py-2.5 sm:px-3 sm:py-3">Rep</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Dials</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Connect</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">CRM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {repLeaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-6 text-center text-sm text-gray-400 sm:px-3 sm:py-8">No rep data in this range.</td>
                    </tr>
                  ) : (
                    repLeaderboard.map(item => (
                      <tr key={item.repName}>
                        <td className="px-2 py-2.5 font-medium text-white sm:px-3 sm:py-3">{item.repName}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.dials.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.connectRate}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.crmRate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-amber-400/15 bg-[#111827] p-3 sm:p-5">
            <h2 className="text-sm font-semibold text-white sm:text-lg">Best Time-of-Day Performance</h2>
            <p className="mt-1 text-[11px] text-gray-400 sm:text-sm">Top hours by connected conversations</p>
            <div className="mt-3 overflow-x-auto sm:mt-6">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="border-b border-gray-800 text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                  <tr>
                    <th className="px-2 py-2.5 sm:px-3 sm:py-3">Hour</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Dials</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Connects</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Connect Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {timeOfDay.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-6 text-center text-sm text-gray-400 sm:px-3 sm:py-8">No hourly performance yet.</td>
                    </tr>
                  ) : (
                    timeOfDay.slice(0, 8).map(item => (
                      <tr key={item.hour}>
                        <td className="px-2 py-2.5 font-medium text-white sm:px-3 sm:py-3">{item.label}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.dials.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.connects.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.connectRate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-3 grid gap-2.5 sm:mt-6 sm:gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-fuchsia-400/15 bg-[#111827] p-3 sm:p-5">
            <h2 className="text-sm font-semibold text-white sm:text-lg">Campaign Comparison</h2>
            <p className="mt-1 text-[11px] text-gray-400 sm:text-sm">Relative output across the filtered campaigns</p>
            <div className="mt-3 space-y-2.5 sm:hidden">
              {campaignComparison.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-800 px-4 py-5 text-center text-sm text-gray-400">
                  No campaign data in this range.
                </p>
              ) : (
                campaignComparison.map(item => (
                  <article key={item.name} className="rounded-xl border border-gray-800 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.name}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-gray-500">{item.status}</p>
                      </div>
                      <div className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2.5 py-1 text-[10px] font-medium text-fuchsia-200">
                        {item.dials.toLocaleString()} dials
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-gray-800 bg-[#0b1220] px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Connect</p>
                        <p className="mt-1 text-sm font-semibold text-white">{item.connectRate}</p>
                      </div>
                      <div className="rounded-lg border border-gray-800 bg-[#0b1220] px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Qualified</p>
                        <p className="mt-1 text-sm font-semibold text-white">{item.qualified.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-gray-800 bg-[#0b1220] px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">CRM</p>
                        <p className="mt-1 text-sm font-semibold text-white">{item.crmRate}</p>
                      </div>
                      <div className="rounded-lg border border-gray-800 bg-[#0b1220] px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Dials</p>
                        <p className="mt-1 text-sm font-semibold text-white">{item.dials.toLocaleString()}</p>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
            <div className="mt-3 hidden overflow-x-auto sm:mt-6 sm:block">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="border-b border-gray-800 text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                  <tr>
                    <th className="px-2 py-2.5 sm:px-3 sm:py-3">Campaign</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Dials</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Connect</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Qualified</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">CRM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {campaignComparison.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-6 text-center text-sm text-gray-400 sm:px-3 sm:py-8">No campaign data in this range.</td>
                    </tr>
                  ) : (
                    campaignComparison.map(item => (
                      <tr key={item.name}>
                        <td className="px-2 py-2.5 sm:px-3 sm:py-3">
                          <div>
                            <p className="font-medium text-white">{item.name}</p>
                            <p className="text-[10px] text-gray-500 sm:text-xs">{item.status}</p>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.dials.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.connectRate}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.qualified.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.crmRate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-rose-400/15 bg-[#111827] p-3 sm:p-5">
            <h2 className="text-sm font-semibold text-white sm:text-lg">Call Outcome Summary</h2>
            <p className="mt-1 text-[11px] text-gray-400 sm:text-sm">Outcome volume and share of total dials</p>
            <div className="mt-3 overflow-x-auto sm:mt-6">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="border-b border-gray-800 text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                  <tr>
                    <th className="px-2 py-2.5 sm:px-3 sm:py-3">Outcome</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Calls</th>
                    <th className="px-2 py-2.5 text-right sm:px-3 sm:py-3">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {dispositionBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-6 text-center text-sm text-gray-400 sm:px-3 sm:py-8">No call outcome data in this range.</td>
                    </tr>
                  ) : (
                    dispositionBreakdown.map(item => (
                      <tr key={item.outcome}>
                        <td className="px-2 py-2.5 font-medium text-white sm:px-3 sm:py-3">{item.outcome.replace(/_/g, ' ')}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.count.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300 sm:px-3 sm:py-3">{item.share}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
