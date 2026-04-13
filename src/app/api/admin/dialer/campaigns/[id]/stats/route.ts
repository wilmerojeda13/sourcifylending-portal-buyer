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

  // Get today's date bounds in UTC (source of truth from database timestamp)
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0))
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0))

  const [calledRes, todayRes, freshRes, totalRes] = await Promise.all([
    // Leads called AT LEAST ONCE in this campaign (persistent progress counter)
    admin.supabase
      .from('dialer_campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .not('last_called_at', 'is', null),

    // Calls Today: SOURCE OF TRUTH - count leads where last_called_at is TODAY
    // This is a direct database count, not session-based
    admin.supabase
      .from('dialer_campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .gte('last_called_at', todayStart.toISOString())
      .lt('last_called_at', todayEnd.toISOString()),

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
