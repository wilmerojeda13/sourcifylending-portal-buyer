import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { stripe, PRICE_IDS } from '@/lib/stripe'

// Only Program C is available as a self-service add-on
const ADD_ON_PROGRAMS = ['program_c'] as const

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { program } = await req.json() as { program: string }

    if (!ADD_ON_PROGRAMS.includes(program as typeof ADD_ON_PROGRAMS[number])) {
      return NextResponse.json({ error: 'Invalid add-on program' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // Verify user has an active primary membership (program_a or program_b)
    const { data: memberships } = await supabase
      .from('memberships')
      .select('program_code')
      .eq('user_id', context.activeBusinessId)
      .eq('status', 'active')

    const activeCodes = (memberships ?? []).map((m) => m.program_code)
    const hasPrimary = activeCodes.includes('program_a') || activeCodes.includes('program_b')
    if (!hasPrimary) {
      return NextResponse.json(
        { error: 'An active Program A or Program B membership is required to add Program C.' },
        { status: 400 }
      )
    }

    // Verify they don't already have this add-on
    if (activeCodes.includes(program)) {
      return NextResponse.json({ error: 'You already have this membership.' }, { status: 400 })
    }

    // Get or look up Stripe customer ID
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', context.activeBusinessId)
      .maybeSingle()

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', context.activeBusinessId)
      .single()

    let customerId = sub?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email,
        name: profile?.full_name ?? undefined,
        metadata: { supabase_user_id: context.activeBusinessId, auth_user_id: context.userId },
      })
      customerId = customer.id
      await supabase.from('subscriptions').upsert(
        { user_id: context.activeBusinessId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    }

    const priceId = PRICE_IDS.program_c.monthly

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/billing?add_on=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/billing?add_on=canceled`,
      metadata: {
        user_id: context.activeBusinessId,
        auth_user_id: context.userId,
        program,
        session_type: 'add_membership',
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('POST /api/stripe/add-membership error:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
