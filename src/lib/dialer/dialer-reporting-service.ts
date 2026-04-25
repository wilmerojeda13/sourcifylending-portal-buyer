import { createServiceClient } from '@/lib/supabase/server'
import { DIALER_TIME_ZONE, getTimeZoneDateRange } from '@/lib/timezones'

export interface DialerReportingFilters {
  startDate: string
  endDate: string
  campaignId?: string
  repId?: string
  source?: string
}

export interface DialerMetrics {
  dials: number
  connects: number
  interested: number
  qualified: number
  promoted: number
  contact_rate: number
  qualified_rate: number
  promoted_rate: number
}

const CONNECT_OUTCOMES = ['contacted', 'qualified']
const INTERESTED_OUTCOMES = ['interested', 'callback', 'follow_up', 'qualified']
const QUALIFIED_OUTCOMES = ['qualified', 'appointment_set', 'booked_call']
const PROMOTED_OUTCOMES = ['qualified']

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

async function executeCountQuery(
  supabase: any,
  baseQuery: any,
): Promise<number> {
  const result = await baseQuery.then((r: { count: number | null }) => r.count ?? 0)
  return result
}

export async function getDialerMetrics(
  filters: DialerReportingFilters,
): Promise<DialerMetrics> {
  const supabase = await createServiceClient()
  const startRange = getTimeZoneDateRange(filters.startDate, DIALER_TIME_ZONE)
  const endRange = getTimeZoneDateRange(filters.endDate, DIALER_TIME_ZONE)

  const startIso = startRange.start.toISOString()
  const endIso = endRange.end.toISOString()

  const buildBaseQuery = () => {
    let q = supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('source_system', 'dialer')
      .gte('timestamp', startIso)
      .lte('timestamp', endIso)

    if (filters.campaignId && filters.campaignId !== 'all') {
      q = q.eq('campaign_id', filters.campaignId)
    }
    if (filters.repId && filters.repId !== 'all') {
      q = q.eq('rep_user_id', filters.repId)
    }
    if (filters.source && filters.source !== 'all') {
      q = q.eq('lead_source', filters.source)
    }

    return q
  }

  const [dials, connects, interested, qualified, promoted] = await Promise.all([
    executeCountQuery(
      supabase,
      buildBaseQuery(),
    ),
    executeCountQuery(
      supabase,
      buildBaseQuery()
        .in('disposition', CONNECT_OUTCOMES),
    ),
    executeCountQuery(
      supabase,
      buildBaseQuery()
        .in('disposition', INTERESTED_OUTCOMES),
    ),
    executeCountQuery(
      supabase,
      buildBaseQuery()
        .in('disposition', QUALIFIED_OUTCOMES),
    ),
    executeCountQuery(
      supabase,
      buildBaseQuery()
        .in('disposition', PROMOTED_OUTCOMES),
    ),
  ])

  return {
    dials,
    connects,
    interested,
    qualified,
    promoted,
    contact_rate: pct(connects, dials),
    qualified_rate: pct(qualified, dials),
    promoted_rate: pct(promoted, dials),
  }
}

export async function getDialerMetricsByDateRange(
  startDate: string,
  endDate: string,
  campaignId?: string,
): Promise<DialerMetrics> {
  return getDialerMetrics({
    startDate,
    endDate,
    campaignId,
  })
}
