import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DIALER_TIME_ZONE, getTimeZoneDayBounds, getTimeZoneWeekStart, getTimeZoneDateKey } from '@/lib/timezones'
import { getDialerMetrics } from '@/lib/dialer/dialer-reporting-service'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const { data: p } = await auth.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const campaignId = sp.get('campaign_id') ?? undefined

  const today = new Date()
  const todayKey = getTimeZoneDateKey(today, DIALER_TIME_ZONE)
  const todayBounds = getTimeZoneDayBounds(today, DIALER_TIME_ZONE)
  const weekStart = getTimeZoneWeekStart(today, DIALER_TIME_ZONE)

  const weekStartKey = getTimeZoneDateKey(weekStart, DIALER_TIME_ZONE)

  const [todayMetrics, weekMetrics] = await Promise.all([
    getDialerMetrics({
      startDate: todayKey,
      endDate: todayKey,
      campaignId,
    }),
    getDialerMetrics({
      startDate: weekStartKey,
      endDate: todayKey,
      campaignId,
    }),
  ])

  return NextResponse.json({
    today: todayMetrics,
    week: weekMetrics,
    timezone: DIALER_TIME_ZONE,
  })
}
