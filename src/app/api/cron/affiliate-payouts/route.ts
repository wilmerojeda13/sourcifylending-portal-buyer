import { NextRequest, NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/site-config'

// This endpoint is called by Vercel Cron on the 1st of each month.
// It delegates to the admin payout run endpoint using an internal service call.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = SITE_URL

  try {
    const res = await fetch(`${baseUrl}/api/admin/affiliates/payouts/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Use a service-level cookie/header approach — in production this would use
        // a service-role JWT or internal admin token. For now we forward the cron secret.
        'x-cron-secret': process.env.CRON_SECRET ?? '',
      },
      body: JSON.stringify({ triggered_by: 'cron' }),
    })

    const data = await res.json()
    console.log('[cron/affiliate-payouts] Result:', data.summary)
    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    console.error('[cron/affiliate-payouts] Error:', err)
    return NextResponse.json({ ok: false, error: 'Cron payout failed' }, { status: 500 })
  }
}
