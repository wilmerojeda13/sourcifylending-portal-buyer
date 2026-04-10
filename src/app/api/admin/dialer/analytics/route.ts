import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase }
}

// Outcomes that count as a live connect (reached a human)
const CONNECT_OUTCOMES = [
  'contacted', 'interested', 'callback',
  'follow_up', 'qualified', 'not_interested', 'dnc',
]

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
    // dials: any lead that was called in this window
    (() => {
      let q = supabase.from('dialer_campaign_leads')
        .select('*', { count: 'exact', head: true })
        .gte('last_called_at', start)
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),

    // connects: dials where we reached a human (not no_answer / voicemail)
    (() => {
      let q = supabase.from('dialer_campaign_leads')
        .select('*', { count: 'exact', head: true })
        .gte('last_called_at', start)
        .in('last_call_outcome', CONNECT_OUTCOMES)
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),

    // interested
    (() => {
      let q = supabase.from('dialer_campaign_leads')
        .select('*', { count: 'exact', head: true })
        .gte('last_called_at', start)
        .eq('last_call_outcome', 'interested')
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),

    // qualified: outcome was 'qualified' (includes leads later promoted)
    (() => {
      let q = supabase.from('dialer_campaign_leads')
        .select('*', { count: 'exact', head: true })
        .gte('last_called_at', start)
        .eq('last_call_outcome', 'qualified')
      if (cid) q = q.eq('campaign_id', cid)
      return q.then((r: { count: number | null }) => r.count ?? 0)
    })(),

    // promoted: status flipped to 'promoted' in this window (updated_at is set at promotion time)
    (() => {
      let q = supabase.from('dialer_campaign_leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'promoted')
        .gte('updated_at', start)
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

  // Today = UTC midnight of current day
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // This week = Monday UTC midnight
  const weekStart = new Date(todayStart)
  const dow = weekStart.getUTCDay() // 0=Sun
  weekStart.setUTCDate(weekStart.getUTCDate() - (dow === 0 ? 6 : dow - 1))

  const [today, week] = await Promise.all([
    statsFor(admin.supabase, todayStart.toISOString(), campaignId),
    statsFor(admin.supabase, weekStart.toISOString(),  campaignId),
  ])

  return NextResponse.json({ today, week })
}
