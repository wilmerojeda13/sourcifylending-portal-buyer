import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DIALER_TIME_ZONE, getTimeZoneDayBounds } from '@/lib/timezones'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase, userId: user.id }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaignId = params.id

  // Get today's date bounds in America/New_York so "Today" includes all EST/EDT dispositions.
  const todayBounds = getTimeZoneDayBounds(new Date(), DIALER_TIME_ZONE)

  const [calledRes, todayRes, freshRes, totalRes] = await Promise.all([
    // Leads called AT LEAST ONCE in this campaign (persistent progress counter)
    admin.supabase
      .from('dialer_campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .not('last_called_at', 'is', null),

    // Calls Today: SOURCE OF TRUTH - raw call logs for the campaign today.
    admin.supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('source_system', 'dialer')
      .eq('campaign_id', campaignId)
      .gte('timestamp', todayBounds.start.toISOString())
      .lte('timestamp', todayBounds.end.toISOString()),

    // Truly fresh leads: never called, still status='new'
    admin.supabase
      .from('dialer_campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'new')
      .is('last_called_at', null),

    // Total leads assigned to this campaign
    admin.supabase
      .from('dialer_campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId),
  ])

  return NextResponse.json({
    calls_total:     calledRes.count  ?? 0,
    calls_today:     todayRes.count   ?? 0,
    fresh_remaining: freshRes.count   ?? 0,
    total:           totalRes.count   ?? 0,
  })
}
