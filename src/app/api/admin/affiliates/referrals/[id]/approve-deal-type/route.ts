import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DEAL_TYPE_RATES } from '@/lib/affiliates'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!data?.is_admin) return null
  return { user, supabase }
}

/**
 * PATCH /api/admin/affiliates/referrals/[id]/approve-deal-type
 * Body: { approved: true | false }
 *
 * When approved=true for an affiliate_closed deal:
 *   - Upgrades all pending commissions for this referral to 30% rate
 * When approved=false:
 *   - Downgrades any pending commissions back to referral_only (10%) rate
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { user, supabase } = admin

  const body = await req.json()
  if (typeof body.approved !== 'boolean') {
    return NextResponse.json({ error: '"approved" must be true or false' }, { status: 400 })
  }

  // Fetch the referral
  const { data: referral } = await supabase
    .from('affiliate_referrals')
    .select('id, affiliate_id, deal_type, deal_type_approved, deal_type_locked')
    .eq('id', params.id)
    .maybeSingle()

  if (!referral) return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
  if (referral.deal_type !== 'affiliate_closed') {
    return NextResponse.json({ error: 'Only affiliate_closed referrals need approval' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Update approval status on referral
  const { data: updatedReferral, error: refErr } = await supabase
    .from('affiliate_referrals')
    .update({
      deal_type_approved: body.approved,
      deal_type_approved_at: now,
      deal_type_approved_by: user.id,
      updated_at: now,
    })
    .eq('id', params.id)
    .select('id, deal_type, deal_type_approved, deal_type_approved_at')
    .single()

  if (refErr) return NextResponse.json({ error: refErr.message }, { status: 400 })

  // Retroactively adjust pending commissions for this referral
  // Get all pending commissions tied to this referral
  const { data: pendingComms } = await supabase
    .from('affiliate_commissions')
    .select('id, commission_type, gross_amount, commission_percent')
    .eq('referral_id', params.id)
    .eq('deal_type', 'affiliate_closed')
    .in('status', ['pending', 'approved'])

  let adjustedCount = 0
  if (pendingComms && pendingComms.length > 0) {
    for (const comm of pendingComms) {
      const targetRates = body.approved
        ? DEAL_TYPE_RATES.affiliate_closed
        : DEAL_TYPE_RATES.referral_only
      const targetPercent = comm.commission_type === 'setup'
        ? targetRates.setup
        : targetRates.recurring

      if (comm.commission_percent !== targetPercent) {
        const newAmount = Math.round(comm.gross_amount * (targetPercent / 100))
        await supabase.from('affiliate_commissions').update({
          commission_percent: targetPercent,
          commission_amount: newAmount,
        }).eq('id', comm.id)
        adjustedCount++
      }
    }
  }

  return NextResponse.json({
    referral: updatedReferral,
    commissions_adjusted: adjustedCount,
    approved: body.approved,
  })
}
