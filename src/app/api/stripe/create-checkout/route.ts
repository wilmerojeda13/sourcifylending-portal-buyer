import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { stripe, PRICE_IDS, PROGRAM_INFO } from '@/lib/stripe'
import { logActivity } from '@/lib/activity'
import type { ProgramId } from '@/types'
import { formatPricingLabel, getProgramPricing, isPartnerAssistedRecord, normalizeAcquisitionPath } from '@/lib/partner-program'
import { APP_URL } from '@/lib/site-config'

type CheckoutProgramId = ProgramId | 'all_access'

const VALID_PROGRAMS: CheckoutProgramId[] = ['program_a', 'program_b', 'program_c']

function getStripePriceIds(program: ProgramId): { monthly: string; setup?: string } {
  return PRICE_IDS[program] as { monthly: string; setup?: string }
}

function summarizeStripeError(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) {
    return `${error.type}: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown checkout error'
}

function getClientErrorMessage(error: unknown) {
  if (error instanceof Error && /STRIPE_SECRET_KEY|Invalid API Key|Missing .*Stripe/i.test(error.message)) {
    return 'Stripe is not configured correctly for checkout.'
  }

  return 'Checkout failed. Please try again later.'
}

function getStripeConfigErrorCode(issue: string | null, missingPriceIds: string[]) {
  if (issue === 'Missing STRIPE_SECRET_KEY') return 'STRIPE_SECRET_KEY_MISSING'
  if (issue === 'Invalid STRIPE_SECRET_KEY prefix') return 'STRIPE_SECRET_KEY_INVALID_PREFIX'
  if (missingPriceIds.length > 0) return 'STRIPE_PRICE_IDS_MISSING'
  return null
}

function getStripeSecretKeyIssue() {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return 'Missing STRIPE_SECRET_KEY'
  if (!/^(sk|rk)_(live|test)_/.test(key)) return 'Invalid STRIPE_SECRET_KEY prefix'
  return null
}

function getMissingStripePriceIds() {
  return [
    ...(PRICE_IDS.program_a.setup ? [] : ['STRIPE_PRICE_ID_PROGRAM_A_SETUP']),
    ...(PRICE_IDS.program_a.monthly ? [] : ['STRIPE_PRICE_ID_PROGRAM_A_MONTHLY']),
    ...(PRICE_IDS.program_b.setup ? [] : ['STRIPE_PRICE_ID_PROGRAM_B_SETUP']),
    ...(PRICE_IDS.program_b.monthly ? [] : ['STRIPE_PRICE_ID_PROGRAM_B_MONTHLY']),
    ...(PRICE_IDS.program_c.monthly ? [] : ['STRIPE_PRICE_ID_PROGRAM_C_MONTHLY']),
  ]
}

function getPublicBaseUrl(req: NextRequest) {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return APP_URL
}

async function assertStripePriceAmount(priceId: string, expectedAmountCents: number, label: string) {
  const price = await stripe.prices.retrieve(priceId)
  if (!price.active) {
    throw new Error(`Stripe price ${priceId} for ${label} is inactive`)
  }

  if (price.recurring?.interval !== 'month') {
    throw new Error(
      `Stripe price mismatch for ${label}: expected a recurring monthly price but ${priceId} is ${price.unit_amount ?? 'unknown'} cents/${price.recurring?.interval ?? 'non-recurring'}`
    )
  }

  if (price.unit_amount !== expectedAmountCents) {
    console.warn('Stripe price amount differs from configured portal pricing:', {
      label,
      priceId,
      expectedAmountCents,
      actualAmountCents: price.unit_amount,
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { program } = await req.json() as { program: CheckoutProgramId }

    if (program === 'all_access') {
      return NextResponse.json({
        error: 'All Access checkout is not configured yet. Please add a matching Stripe price before enabling this plan.',
      }, { status: 400 })
    }

    if (!VALID_PROGRAMS.includes(program)) {
      return NextResponse.json({ error: 'Invalid program' }, { status: 400 })
    }

    const missingPriceIds = getMissingStripePriceIds()
    if (missingPriceIds.length > 0) {
      console.error('Checkout config missing Stripe price IDs:', {
        program,
        missingPriceIds,
        configErrorCode: getStripeConfigErrorCode(null, missingPriceIds),
        stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      })
      return NextResponse.json({
        error: `Stripe configuration is incomplete: missing ${missingPriceIds.join(', ')}`,
      }, { status: 500 })
    }

    const stripeKeyIssue = getStripeSecretKeyIssue()
    if (stripeKeyIssue) {
      console.error('Checkout config missing/invalid Stripe secret key:', {
        stripeKeyIssue,
        program,
        configErrorCode: getStripeConfigErrorCode(stripeKeyIssue, missingPriceIds),
        stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        stripePublishableConfigured: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      })
      return NextResponse.json({ error: 'Stripe is not configured correctly for checkout.' }, { status: 500 })
    }

    const checkoutProgram = program as ProgramId
    const prices = getStripePriceIds(checkoutProgram)
    if (!prices?.monthly) {
      return NextResponse.json({
        error: `Stripe configuration is incomplete: missing monthly price for ${program}`,
      }, { status: 500 })
    }

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

    const pricing = getProgramPricing(checkoutProgram, acquisitionPath)
    await assertStripePriceAmount(prices.monthly, pricing.monthlyFeeCents, `${checkoutProgram} monthly`)

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

    const appUrl = getPublicBaseUrl(req)

    const lineItems: Array<{ price: string; quantity: number }> = [
      { price: prices.monthly, quantity: 1 },
    ]

    if (pricing.hasSetupFee && 'setup' in prices && prices.setup) {
      lineItems.unshift({ price: prices.setup, quantity: 1 })
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
    const message = summarizeStripeError(error)
    console.error('Checkout error:', {
      message,
      errorName: error instanceof Error ? error.name : typeof error,
      error,
    })
    return NextResponse.json({ error: getClientErrorMessage(error) }, { status: 500 })
  }
}
