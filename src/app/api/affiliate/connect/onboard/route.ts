import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, name, email, stripe_account_id, stripe_connect_status, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!affiliate || affiliate.status === 'suspended') {
    return NextResponse.json({ error: 'Affiliate account not found' }, { status: 404 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sourcifylending.com'

  let stripeAccountId = affiliate.stripe_account_id

  // Create a new Express account if not yet connected
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: affiliate.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: { affiliate_id: affiliate.id },
    })
    stripeAccountId = account.id

    await supabase.from('affiliates').update({
      stripe_account_id: stripeAccountId,
      stripe_connect_status: 'pending',
      updated_at: new Date().toISOString(),
    }).eq('id', affiliate.id)
  }

  // Generate fresh onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${baseUrl}/affiliate/account?connect=refresh`,
    return_url: `${baseUrl}/affiliate/account?connect=success`,
    type: 'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url })
}
