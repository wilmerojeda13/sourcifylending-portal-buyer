import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

type DealType = 'referral_only' | 'affiliate_closed'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()

    // Confirm the affiliate owns this referral
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (!affiliate) return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 })

    const { data: referral } = await supabase
      .from('affiliate_referrals')
      .select('id, affiliate_id, deal_type, deal_type_locked')
      .eq('id', params.id)
      .eq('affiliate_id', affiliate.id)
      .maybeSingle()

    if (!referral) return NextResponse.json({ error: 'Referral not found' }, { status: 404 })

    // Hard block: cannot change after payment
    if (referral.deal_type_locked) {
      return NextResponse.json(
        { error: 'Deal type is locked after first payment and cannot be changed.' },
        { status: 409 },
      )
    }

    const body = await req.json()
    const dealType: DealType = body.deal_type
    if (!['referral_only', 'affiliate_closed'].includes(dealType)) {
      return NextResponse.json({ error: 'Invalid deal_type value' }, { status: 400 })
    }

    // Update deal_type — reset approval when changed
    const { data: updated, error } = await supabase
      .from('affiliate_referrals')
      .update({
        deal_type: dealType,
        deal_type_selected_at: new Date().toISOString(),
        deal_type_selected_by: 'affiliate',
        deal_type_approved: null,           // reset approval on change
        deal_type_approved_at: null,
        deal_type_approved_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('id, deal_type, deal_type_locked, deal_type_approved, deal_type_selected_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // ── Anti-abuse: flag if >70% of this affiliate's referrals are affiliate_closed ──
    if (dealType === 'affiliate_closed') {
      try {
        const { count: totalCount } = await supabase
          .from('affiliate_referrals')
          .select('id', { count: 'exact', head: true })
          .eq('affiliate_id', affiliate.id)

        const { count: closedCount } = await supabase
          .from('affiliate_referrals')
          .select('id', { count: 'exact', head: true })
          .eq('affiliate_id', affiliate.id)
          .eq('deal_type', 'affiliate_closed')

        const total = totalCount ?? 0
        const closed = closedCount ?? 0
        if (total >= 3 && closed / total > 0.7) {
          // Check for existing unresolved flag of this type
          const { data: existingFlag } = await supabase
            .from('affiliate_flags')
            .select('id')
            .eq('affiliate_id', affiliate.id)
            .eq('flag_type', 'high_affiliate_closed_rate')
            .in('status', ['pending', 'reviewed'])
            .maybeSingle()

          if (!existingFlag) {
            await supabase.from('affiliate_flags').insert({
              affiliate_id: affiliate.id,
              flag_type: 'high_affiliate_closed_rate',
              reason: `${closed} of ${total} referrals (${Math.round((closed / total) * 100)}%) marked as affiliate_closed — possible abuse`,
              status: 'pending',
              severity: 'medium',
            })
          }
        }
      } catch { /* non-critical — don't fail the request */ }
    }

    return NextResponse.json({ referral: updated })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
