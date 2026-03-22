import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, stripe_account_id, stripe_connect_status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!affiliate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()

  // Commissions summary
  const { data: commissions } = await supabase
    .from('affiliate_commissions')
    .select('id, commission_amount, status, available_at, paid_at, payout_id')
    .eq('affiliate_id', affiliate.id)
    .not('status', 'eq', 'reversed')

  const pending = (commissions ?? []).filter(c => c.status === 'pending' && c.available_at > now)
  const available = (commissions ?? []).filter(c => c.status === 'pending' && c.available_at <= now)
  const paid = (commissions ?? []).filter(c => c.status === 'paid')

  const pendingCents = pending.reduce((s, c) => s + c.commission_amount, 0)
  const availableCents = available.reduce((s, c) => s + c.commission_amount, 0)
  const paidCents = paid.reduce((s, c) => s + c.commission_amount, 0)

  // Recent payouts
  const { data: payouts } = await supabase
    .from('affiliate_payouts')
    .select('id, amount_cents, status, paid_at, created_at, stripe_transfer_id')
    .eq('affiliate_id', affiliate.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Next payout date = 1st of next month
  const today = new Date()
  const nextPayoutDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)

  return NextResponse.json({
    affiliate_id: affiliate.id,
    stripe_connect_status: affiliate.stripe_connect_status,
    stripe_account_id: affiliate.stripe_account_id,
    balances: {
      pending_cents: pendingCents,
      available_cents: availableCents,
      paid_cents: paidCents,
    },
    minimum_payout_cents: 10_000,
    next_payout_date: nextPayoutDate.toISOString(),
    payouts: payouts ?? [],
  })
}
