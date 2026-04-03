import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { stripe, PRICE_IDS, PROGRAM_INFO } from '@/lib/stripe'
import { logActivity } from '@/lib/activity'
import type { ProgramId } from '@/types'
import { formatPricingLabel, getProgramPricing, isPartnerAssistedRecord, normalizeAcquisitionPath } from '@/lib/partner-program'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { program } = await req.json() as { program: ProgramId }

    if (!['program_a', 'program_b', 'program_c'].includes(program)) {
      return NextResponse.json({ error: 'Invalid program' }, { status: 400 })
    }

    const prices = PRICE_IDS[program]

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', context.activeBusinessId).single()

    const acquisitionPath = normalizeAcquisitionPath(
      isPartnerAssistedRecord({
        acquisition_path: (profile as { acquisition_path?: string | null } | null)?.acquisition_path,
        assigned_partner_affiliate_id: (profile as { assigned_partner_affiliate_id?: string | null } | null)?.assigned_partner_affiliate_id,
      })
        ? 'partner_assisted'
        : (profile as { acquisition_path?: string | null } | null)?.acquisition_path,
    )
    const pricing = getProgramPricing(program, acquisitionPath)

    // ── Get or create Stripe customer ────────────────────────────────────────
    let customerId: string
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', context.activeBusinessId)
      .single()

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: profile?.full_name ?? undefined,
        metadata: {
          user_id: context.activeBusinessId,
          auth_user_id: context.userId,
          program,
          acquisition_path: acquisitionPath,
          assigned_partner_affiliate_id: (profile as { assigned_partner_affiliate_id?: string | null } | null)?.assigned_partner_affiliate_id ?? '',
        },
      })
      customerId = customer.id
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // ── Build checkout session ────────────────────────────────────────────────
    const lineItems: Array<{ price: string; quantity: number }> = [
      { price: (prices as { monthly: string }).monthly, quantity: 1 },
    ]

    if (pricing.hasSetupFee && 'setup' in prices) {
      lineItems.unshift({ price: (prices as { setup: string }).setup, quantity: 1 })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${appUrl}/dashboard?subscribed=true`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      metadata: {
        user_id: context.activeBusinessId,
        auth_user_id: context.userId,
        program,
        session_type: 'subscription',
        acquisition_path: acquisitionPath,
        assigned_partner_affiliate_id: (profile as { assigned_partner_affiliate_id?: string | null } | null)?.assigned_partner_affiliate_id ?? '',
        setup_fee_cents: String(pricing.setupFeeCents),
        monthly_fee_cents: String(pricing.monthlyFeeCents),
      },
      subscription_data: {
        metadata: {
          user_id: context.activeBusinessId,
          auth_user_id: context.userId,
          program,
          acquisition_path: acquisitionPath,
          assigned_partner_affiliate_id: (profile as { assigned_partner_affiliate_id?: string | null } | null)?.assigned_partner_affiliate_id ?? '',
          setup_fee_cents: String(pricing.setupFeeCents),
          monthly_fee_cents: String(pricing.monthlyFeeCents),
        },
      },
    })

    await logActivity(context.activeBusinessId, 'checkout_started', { program, session_id: session.id, auth_user_id: context.userId }, req)

    return NextResponse.json({
      url: session.url,
      pricing_label: formatPricingLabel(program, acquisitionPath),
      acquisition_path: acquisitionPath,
      monthly_fee_cents: pricing.monthlyFeeCents,
      setup_fee_cents: pricing.setupFeeCents,
      program_name: PROGRAM_INFO[program].name,
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
