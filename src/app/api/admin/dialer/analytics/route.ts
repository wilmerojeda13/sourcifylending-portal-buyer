import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DIALER_TIME_ZONE, getTimeZoneDayBounds, getTimeZoneWeekStart } from '@/lib/timezones'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase }
}

const CONNECT_OUTCOMES = ['contacted', 'qualified']

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

// Run 5 count-only queries for a given time window, optionally scoped to one campaign.
// count: 'exact', head: true — PostgREST returns COUNT(*) with zero rows, immune to max-rows cap.
async function statsFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  start: string,
  campaignId?: string,
) {
  const cid = campaignId

  const [dials, connects, interested, qualified, promoted] = await Promise.all([
    (() => {
      let q = supabase.from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('source_system', 'dialer')
        .gte('timestamp', start)
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),
    (() => {
      let q = supabase.from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('source_system', 'dialer')
        .gte('timestamp', start)
        .in('disposition', CONNECT_OUTCOMES)
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),
    (() => {
      let q = supabase.from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('source_system', 'dialer')
        .gte('timestamp', start)
        .eq('disposition', 'interested')
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),
    (() => {
      let q = supabase.from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('source_system', 'dialer')
        .gte('timestamp', start)
        .eq('disposition', 'qualified')
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),
    (() => {
      let q = supabase.from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('source_system', 'dialer')
        .eq('disposition', 'qualified')
        .gte('timestamp', start)
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),
  ])

  return {
    dials,
    connects,
    interested,
    qualified,
    promoted,
    contact_rate:   pct(connects,  dials),
    qualified_rate: pct(qualified, dials),
    promoted_rate:  pct(promoted,  dials),
  }
}

export async function GET(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp         = new URL(req.url).searchParams
  const campaignId = sp.get('campaign_id') ?? undefined

  // Today and week windows are anchored to America/New_York to avoid UTC drift.
  const todayStart = getTimeZoneDayBounds(new Date(), DIALER_TIME_ZONE).start
  const weekStart = getTimeZoneWeekStart(new Date(), DIALER_TIME_ZONE)

  const [todayCount, weekCount] = await Promise.all([
    (() => {
      let q = admin.supabase.from('call_logs').select('*', { count: 'exact', head: true }).eq('source_system', 'dialer').gte('timestamp', todayStart.toISOString())
      if (campaignId) q = q.eq('campaign_id', campaignId)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),
    (() => {
      let q = admin.supabase.from('call_logs').select('*', { count: 'exact', head: true }).eq('source_system', 'dialer').gte('timestamp', weekStart.toISOString())
      if (campaignId) q = q.eq('campaign_id', campaignId)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),
  ])

  const [today, week] = await Promise.all([
    statsFor(admin.supabase, todayStart.toISOString(), campaignId),
    statsFor(admin.supabase, weekStart.toISOString(),  campaignId),
  ])

  return NextResponse.json({
    today: { ...today, dials: todayCount },
    week: { ...week, dials: weekCount },
    timezone: 'America/New_York',
  })
}
