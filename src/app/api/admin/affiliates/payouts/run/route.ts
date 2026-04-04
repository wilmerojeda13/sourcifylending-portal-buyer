import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const MINIMUM_PAYOUT_CENTS = 10_000 // $100.00

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!data?.is_admin) return null
  return { user, supabase }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { user, supabase } = admin

  const body = await req.json().catch(() => ({}))
  const targetAffiliateId: string | null = body.affiliate_id ?? null
  const triggeredBy = body.triggered_by ?? 'admin'
  const now = new Date().toISOString()

  // Get all active affiliates with a connected Stripe account
  let affiliateQuery = supabase
    .from('affiliates')
    .select('id, name, email, stripe_account_id, stripe_connect_status')
    .eq('status', 'active')
    .eq('stripe_connect_status', 'active')
    .not('stripe_account_id', 'is', null)
    .eq('is_demo', false)

  if (targetAffiliateId) {
    affiliateQuery = affiliateQuery.eq('id', targetAffiliateId)
  }

  const { data: affiliates } = await affiliateQuery
  if (!affiliates || affiliates.length === 0) {
    return NextResponse.json({ ok: true, message: 'No eligible affiliates found.', results: [] })
  }

  const results: Array<{
    affiliate_id: string
    affiliate_name: string
    status: 'paid' | 'skipped' | 'failed'
    amount_cents?: number
    payout_id?: string
    reason?: string
  }> = []

  for (const affiliate of affiliates) {
    try {
      // Get eligible commissions: pending + hold period passed
      const { data: commissions } = await supabase
        .from('affiliate_commissions')
        .select('id, commission_amount')
        .eq('affiliate_id', affiliate.id)
        .eq('status', 'pending')
        .lte('available_at', now)
        .is('payout_id', null)

      if (!commissions || commissions.length === 0) {
        results.push({ affiliate_id: affiliate.id, affiliate_name: affiliate.name, status: 'skipped', reason: 'No available commissions' })
        continue
      }

      const totalCents = commissions.reduce((s, c) => s + c.commission_amount, 0)

      if (totalCents < MINIMUM_PAYOUT_CENTS) {
        results.push({ affiliate_id: affiliate.id, affiliate_name: affiliate.name, status: 'skipped', reason: `Below minimum ($${(totalCents / 100).toFixed(2)} < $100)` })
        continue
      }

      // Create payout record first (as pending)
      const commissionIds = commissions.map(c => c.id)
      const { data: payoutRecord, error: payoutErr } = await supabase
        .from('affiliate_payouts')
        .insert({
          affiliate_id: affiliate.id,
          stripe_account_id: affiliate.stripe_account_id,
          amount_cents: totalCents,
          status: 'pending',
          commission_ids: commissionIds,
          triggered_by: triggeredBy,
          triggered_by_user: user.id,
        })
        .select('id')
        .single()

      if (payoutErr || !payoutRecord) {
        results.push({ affiliate_id: affiliate.id, affiliate_name: affiliate.name, status: 'failed', reason: 'Failed to create payout record' })
        continue
      }

      // Send Stripe transfer
      let transferId: string | null = null
      try {
        const transfer = await stripe.transfers.create({
          amount: totalCents,
          currency: 'usd',
          destination: affiliate.stripe_account_id,
          description: `SourcifyLending affiliate commission payout — ${affiliate.name}`,
          metadata: {
            affiliate_id: affiliate.id,
            payout_id: payoutRecord.id,
            commission_count: String(commissions.length),
          },
        })
        transferId = transfer.id
      } catch (stripeErr) {
        // Mark payout as failed
        await supabase.from('affiliate_payouts').update({
          status: 'failed',
          failure_reason: (stripeErr as Error).message,
          updated_at: now,
        }).eq('id', payoutRecord.id)

        results.push({ affiliate_id: affiliate.id, affiliate_name: affiliate.name, status: 'failed', reason: (stripeErr as Error).message })
        continue
      }

      // Mark payout as paid
      await supabase.from('affiliate_payouts').update({
        status: 'paid',
        stripe_transfer_id: transferId,
        paid_at: now,
        updated_at: now,
      }).eq('id', payoutRecord.id)

      // Mark commissions as paid and link to payout
      await supabase.from('affiliate_commissions').update({
        status: 'paid',
        paid_at: now,
        payout_id: payoutRecord.id,
      }).in('id', commissionIds)

      results.push({
        affiliate_id: affiliate.id,
        affiliate_name: affiliate.name,
        status: 'paid',
        amount_cents: totalCents,
        payout_id: payoutRecord.id,
      })

      console.log(`[payout] Paid $${(totalCents / 100).toFixed(2)} to ${affiliate.name} (${affiliate.id}) via transfer ${transferId}`)
    } catch (err) {
      console.error(`[payout] Error processing affiliate ${affiliate.id}:`, err)
      results.push({ affiliate_id: affiliate.id, affiliate_name: affiliate.name, status: 'failed', reason: 'Unexpected error' })
    }
  }

  const paid = results.filter(r => r.status === 'paid')
  const skipped = results.filter(r => r.status === 'skipped')
  const failed = results.filter(r => r.status === 'failed')
  const totalPaidCents = paid.reduce((s, r) => s + (r.amount_cents ?? 0), 0)

  return NextResponse.json({
    ok: true,
    summary: {
      paid: paid.length,
      skipped: skipped.length,
      failed: failed.length,
      total_paid_cents: totalPaidCents,
    },
    results,
  })
}
