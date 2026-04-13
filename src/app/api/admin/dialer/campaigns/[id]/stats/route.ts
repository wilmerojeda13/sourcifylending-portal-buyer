import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
  const userId = admin.userId

  // Rolling 24-hour window for 'Today' (local user time via 24h ago)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [calledRes, todayRes, freshRes, totalRes] = await Promise.all([
    // Leads called AT LEAST ONCE in this campaign (persistent progress counter)
    admin.supabase
      .from('dialer_campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .not('last_called_at', 'is', null),

    // Call attempts logged in last 24 hours by THIS USER (personalized count)
    admin.supabase
      .from('dialer_analytics_logs')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .gte('created_at', twentyFourHoursAgo.toISOString()),

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
