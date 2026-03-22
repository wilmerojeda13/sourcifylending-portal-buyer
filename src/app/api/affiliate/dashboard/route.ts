import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { countActiveReferrals, AFFILIATE_FREE_ACCESS_THRESHOLD, AFFILIATE_QUALIFICATION_DAYS } from '@/lib/affiliates'

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if (!affiliate) return NextResponse.json({ error: 'Not an affiliate' }, { status: 404 })

    // Run queries in parallel
    const [clicksResult, referralsResult, commissionsResult] = await Promise.all([
      supabase.from('affiliate_clicks').select('id', { count: 'exact', head: true }).eq('affiliate_id', affiliate.id),
      supabase.from('affiliate_referrals').select('referral_status, subscription_active').eq('affiliate_id', affiliate.id),
      supabase.from('affiliate_commissions').select('commission_amount, status').eq('affiliate_id', affiliate.id),
    ])

    const totalClicks = clicksResult.count ?? 0
    const referrals = referralsResult.data ?? []
    const commissions = commissionsResult.data ?? []

    const totalReferrals = referrals.length
    const activeReferrals = referrals.filter(r => r.referral_status === 'active' && r.subscription_active).length

    const totalEarned = commissions.filter(c => c.status !== 'reversed').reduce((sum, c) => sum + c.commission_amount, 0)
    const pendingCommissions = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.commission_amount, 0)
    const approvedCommissions = commissions.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.commission_amount, 0)
    const paidCommissions = commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.commission_amount, 0)

    // Free access status
    let freeAccessStatus: 'locked' | 'qualifying' | 'unlocked' = 'locked'
    let daysRemaining: number | null = null
    const activeCount = await countActiveReferrals(affiliate.id)

    if (affiliate.has_free_program_b_access) {
      freeAccessStatus = 'unlocked'
    } else if (activeCount >= AFFILIATE_FREE_ACCESS_THRESHOLD && affiliate.qualification_start_date) {
      const daysPassed = (Date.now() - new Date(affiliate.qualification_start_date).getTime()) / (1000 * 60 * 60 * 24)
      daysRemaining = Math.max(0, Math.ceil(AFFILIATE_QUALIFICATION_DAYS - daysPassed))
      freeAccessStatus = 'qualifying'
    }

    return NextResponse.json({
      affiliate,
      stats: {
        totalClicks,
        totalReferrals,
        activeReferrals,
        totalEarned,
        pendingCommissions,
        approvedCommissions,
        paidCommissions,
        freeAccessStatus,
        activeCount,
        daysRemaining,
        threshold: AFFILIATE_FREE_ACCESS_THRESHOLD,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
