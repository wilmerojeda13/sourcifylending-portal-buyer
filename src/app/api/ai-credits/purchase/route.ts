import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()

    // ── Guard: must be an active member ────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status, assigned_program')
      .eq('id', user.id)
      .single()

    const isActive =
      profile?.subscription_status === 'active' ||
      profile?.subscription_status === 'trialing'

    if (!isActive) {
      return NextResponse.json(
        { error: 'Active membership required to purchase AI credits.' },
        { status: 403 }
      )
    }

    // ── Validate pack ──────────────────────────────────────────────────────────
    const { pack_id } = await req.json() as { pack_id: string }
    if (!pack_id) return NextResponse.json({ error: 'pack_id is required' }, { status: 400 })

    const { data: pack } = await supabase
      .from('ai_credit_packs')
      .select('*')
      .eq('id', pack_id)
      .eq('is_active', true)
      .single()

    if (!pack) {
      return NextResponse.json({ error: 'Credit pack not found or inactive.' }, { status: 404 })
    }

    // ── Find or create Stripe customer ID ──────────────────────────────────────
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    const siteUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000'

    // ── Build line item ────────────────────────────────────────────────────────
    // Use pre-created Stripe price if available; otherwise use inline price_data
    const lineItem = pack.stripe_price_id
      ? { price: pack.stripe_price_id, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(Number(pack.price_usd) * 100), // cents
            product_data: {
              name: `SourcifyLending — ${pack.name}`,
              description: pack.description ?? `${pack.credits_amount} extra AI credits`,
            },
          },
          quantity: 1,
        }

    // ── Create Stripe Checkout Session ────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(subscription?.stripe_customer_id
        ? { customer: subscription.stripe_customer_id }
        : {}),
      line_items: [lineItem],
      metadata: {
        user_id: user.id,
        pack_id: pack.id,
        credits_amount: String(pack.credits_amount),
        session_type: 'ai_credit_pack',
      },
      success_url: `${siteUrl}/ai-usage?purchased=1`,
      cancel_url: `${siteUrl}/ai-usage`,
      allow_promotion_codes: false,
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          pack_id: pack.id,
          session_type: 'ai_credit_pack',
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[AI-CREDIT-PURCHASE] Checkout session error:', msg)
    return NextResponse.json({ error: 'Failed to create checkout session.' }, { status: 500 })
  }
}
