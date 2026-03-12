import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, PRICE_IDS, PROGRAM_INFO } from '@/lib/stripe'
import { logActivity } from '@/lib/activity'
import type { ProgramId } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { program } = await req.json() as { program: ProgramId }

    if (!['program_a', 'program_b', 'program_c'].includes(program)) {
      return NextResponse.json({ error: 'Invalid program' }, { status: 400 })
    }

    const info = PROGRAM_INFO[program]
    const prices = PRICE_IDS[program]

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()

    // ── Get or create Stripe customer ────────────────────────────────────────
    let customerId: string
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: profile?.full_name ?? undefined,
        metadata: { user_id: user.id, program },
      })
      customerId = customer.id
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // ── Build checkout session ────────────────────────────────────────────────
    let session

    if (info.hasSetup) {
      // Programs A & B:
      //   Step 1 — Charge setup fee today (mode: payment, card saved for future use)
      //   Step 2 — Webhook creates subscription with 30-day trial after payment clears
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          { price: (prices as { setup: string; monthly: string }).setup, quantity: 1 },
        ],
        payment_intent_data: {
          setup_future_usage: 'off_session', // saves the card for the future subscription
          metadata: { user_id: user.id, program, session_type: 'setup_fee' },
        },
        success_url: `${appUrl}/dashboard?subscribed=true`,
        cancel_url:  `${appUrl}/billing?canceled=true`,
        metadata: { user_id: user.id, program, session_type: 'setup_fee' },
      })
    } else {
      // Program C — monthly subscription starts immediately, no setup fee
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          { price: (prices as { monthly: string }).monthly, quantity: 1 },
        ],
        success_url: `${appUrl}/dashboard?subscribed=true`,
        cancel_url:  `${appUrl}/billing?canceled=true`,
        metadata: { user_id: user.id, program, session_type: 'subscription' },
        subscription_data: {
          metadata: { user_id: user.id, program },
        },
      })
    }

    await logActivity(user.id, 'checkout_started', { program, session_id: session.id }, req)

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
