import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { referralCode, landingPage } = await req.json()
    if (!referralCode) return NextResponse.json({ ok: false })

    const supabase = await createServiceClient()
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id')
      .eq('referral_code', referralCode.toUpperCase())
      .eq('status', 'active')
      .single()

    if (!affiliate) return NextResponse.json({ ok: false })

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || null
    const userAgent = req.headers.get('user-agent') || null

    await supabase.from('affiliate_clicks').insert({
      affiliate_id: affiliate.id,
      referral_code: referralCode.toUpperCase(),
      landing_page: landingPage,
      ip_address: ip,
      user_agent: userAgent,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
