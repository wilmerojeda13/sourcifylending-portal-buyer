import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

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

  if (!affiliate.stripe_account_id) {
    return NextResponse.json({ status: 'not_connected', stripe_account_id: null })
  }

  // Sync live status from Stripe
  try {
    const account = await stripe.accounts.retrieve(affiliate.stripe_account_id)
    const newStatus = account.payouts_enabled && account.charges_enabled
      ? 'active'
      : account.details_submitted
        ? 'pending'
        : 'not_connected'

    if (newStatus !== affiliate.stripe_connect_status) {
      await supabase.from('affiliates').update({
        stripe_connect_status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', affiliate.id)
    }

    return NextResponse.json({
      status: newStatus,
      stripe_account_id: affiliate.stripe_account_id,
      payouts_enabled: account.payouts_enabled,
      charges_enabled: account.charges_enabled,
      details_submitted: account.details_submitted,
      requirements: account.requirements,
    })
  } catch {
    return NextResponse.json({ status: affiliate.stripe_connect_status, stripe_account_id: affiliate.stripe_account_id })
  }
}
