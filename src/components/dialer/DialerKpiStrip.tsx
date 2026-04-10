'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface PeriodStats {
  dials:          number
  connects:       number
  interested:     number
  qualified:      number
  promoted:       number
  contact_rate:   number
  qualified_rate: number
  promoted_rate:  number
}

interface Analytics {
  today: PeriodStats
  week:  PeriodStats
}

interface Props {
  campaignId?: string
  className?: string
}

function Metric({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="flex flex-col items-center min-w-[52px]">
      <span className="text-[13px] font-bold text-gray-100 leading-tight tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sub && (
        <span className="text-[10px] text-gray-500 leading-none">{sub}</span>
      )}
      <span className="text-[10px] text-gray-500 mt-0.5 leading-none">{label}</span>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-6 bg-gray-700 shrink-0" />
}

function Row({
  label,
  s,
  highlight,
}: {
  label: string
  s: PeriodStats
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2',
      highlight ? 'bg-gray-900' : 'bg-gray-800/40',
    )}>
      <span className={cn(
        'text-[10px] font-bold uppercase tracking-widest w-12 shrink-0',
        highlight ? 'text-gray-300' : 'text-gray-500',
      )}>{label}</span>
      <Divider />
      <Metric label="Dials"    value={s.dials} />
      <Divider />
      <Metric label="Connects" value={s.connects} sub={`${s.contact_rate}%`} />
      <Divider />
      <Metric label="Interested" value={s.interested} />
      <Divider />
      <Metric label="Qualified" value={s.qualified} sub={`${s.qualified_rate}%`} />
      <Divider />
      <Metric
        label="→ CRM"
        value={s.promoted}
        sub={s.promoted > 0 ? `${s.promoted_rate}%` : undefined}
      />
    </div>
  )
}

export default function DialerKpiStrip({ campaignId, className }: Props) {
  const [data, setData]       = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = campaignId
      ? `/api/admin/dialer/analytics?campaign_id=${campaignId}`
      : '/api/admin/dialer/analytics'
    fetch(url)
      .then(r => r.json())
      .then(j => setData(j))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [campaignId])

  if (loading) return (
    <div className={cn('h-[66px] bg-gray-900 border border-gray-800 rounded-xl animate-pulse', className)} />
  )

  if (!data) return null

  return (
    <div className={cn('rounded-xl border border-gray-800 overflow-hidden text-center', className)}>
      <Row label="Today" s={data.today} highlight />
      <Row label="Week"  s={data.week} />
    </div>
  )
}
