import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { stripe, PRICE_IDS, PROGRAM_INFO, PAID_PROGRAM_TRIAL_DAYS, getMissingStripePriceIds, getStripeSecretKeyIssue } from '@/lib/stripe'
import { logActivity } from '@/lib/activity'
import type { ProgramId } from '@/types'
import { formatPricingLabel, getProgramPricing, isPartnerAssistedRecord, normalizeAcquisitionPath } from '@/lib/partner-program'
import { getPublicBaseUrl } from '@/lib/site-config'
import { findExistingStripeCheckoutState, syncStripeSubscriptionToSupabase } from '@/lib/stripe-subscription-sync'

type CheckoutProgramId = ProgramId | 'all_access'

const VALID_PROGRAMS: CheckoutProgramId[] = ['program_a', 'program_b', 'program_c']
const PROGRAM_B_MONTHLY_FALLBACK_PRICE_ID = 'price_1SuKXkJHkSbRjnIvfH2kHe13'

function getStripePriceIds(program: CheckoutProgramId): { monthly: string; setup?: string } {
  if (program === 'all_access') {
    return PRICE_IDS.all_access as { monthly: string; setup?: string }
  }

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

function isInactiveStripeProductError(error: unknown) {
  return error instanceof Stripe.errors.StripeError &&
    /product is not active/i.test(error.message)
}

function isReusableCheckoutSessionValid(input: {
  session: Stripe.Checkout.Session
  program: ProgramId
  monthlyFeeCents: number
  setupFeeCents: number
}) {
  const { session, program, monthlyFeeCents, setupFeeCents } = input
  const expectedTrialDays = setupFeeCents === 0 ? PAID_PROGRAM_TRIAL_DAYS : 0
  const sessionProgram = session.metadata?.selected_program || session.metadata?.program || null
  const sessionMonthlyFee = parseInt(session.metadata?.monthly_fee_cents ?? '', 10)
  const sessionSetupFee = parseInt(session.metadata?.setup_fee_cents ?? '', 10)
  const sessionTrialDays = parseInt(session.metadata?.trial_days ?? '', 10)

  if (sessionProgram !== program) return false
  if (!Number.isNaN(sessionMonthlyFee) && sessionMonthlyFee !== monthlyFeeCents) return false
  if (!Number.isNaN(sessionSetupFee) && sessionSetupFee !== setupFeeCents) return false
  if (expectedTrialDays > 0) {
    if (session.metadata?.selected_program !== program) return false
    if (Number.isNaN(sessionTrialDays) || sessionTrialDays !== expectedTrialDays) return false
  }

  return true
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
    const appUrl = getPublicBaseUrl(req)
    const prices = getStripePriceIds(program)
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
    await assertStripePriceAmount(prices.monthly, pricing.monthlyFeeCents, `${program} monthly`)

    const localSubscription = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, status, program')
      .eq('user_id', context.activeBusinessId)
      .maybeSingle()

    if (localSubscription.data?.stripe_subscription_id && ['active', 'trialing', 'past_due', 'past_due_locked'].includes(localSubscription.data.status ?? '')) {
      return NextResponse.json({
        error: 'You already have an active trial or subscription.',
        code: 'SUBSCRIPTION_ALREADY_ACTIVE',
        redirect_url: `${appUrl}/billing`,
        subscription_status: localSubscription.data.status,
        program: localSubscription.data.program,
      }, { status: 409 })
    }

    const existingStripeState = await findExistingStripeCheckoutState({
      userId: context.activeBusinessId,
      email: user.email!,
      program: checkoutProgram,
    })

    if (existingStripeState.activeSubscription) {
      await syncStripeSubscriptionToSupabase(supabase, {
        subscription: existingStripeState.activeSubscription,
        userId: context.activeBusinessId,
        fallbackProgram: existingStripeState.activeProgram,
      })

      return NextResponse.json({
        error: 'You already have an active trial or subscription.',
        code: 'SUBSCRIPTION_ALREADY_ACTIVE',
        redirect_url: `${appUrl}/billing`,
        subscription_status: existingStripeState.activeSubscription.status,
        program: existingStripeState.activeProgram,
      }, { status: 409 })
    }

    let customerId: string
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', context.activeBusinessId)
      .single()

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id
    } else if (existingStripeState.customerId) {
      customerId = existingStripeState.customerId
    } else {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: profile?.full_name ?? undefined,
        metadata: {
          user_id: context.activeBusinessId,
          auth_user_id: context.userId,
          program,
          selected_program: program,
          acquisition_path: acquisitionPath,
          assigned_partner_affiliate_id: (profile as { assigned_partner_affiliate_id?: string | null } | null)?.assigned_partner_affiliate_id ?? '',
        },
      })
      customerId = customer.id
    }

    const lineItems: Array<{ price: string; quantity: number }> = [
      { price: prices.monthly, quantity: 1 },
    ]

    if (pricing.hasSetupFee && 'setup' in prices && prices.setup) {
      lineItems.unshift({ price: prices.setup, quantity: 1 })
    }

    const shouldApplyTrial = pricing.setupFeeCents === 0

    if (existingStripeState.openCheckoutSession?.url) {
      const isReusableSessionValid = isReusableCheckoutSessionValid({
        session: existingStripeState.openCheckoutSession,
        program: checkoutProgram,
        monthlyFeeCents: pricing.monthlyFeeCents,
        setupFeeCents: pricing.setupFeeCents,
      })

      if (isReusableSessionValid) {
        return NextResponse.json({
          url: existingStripeState.openCheckoutSession.url,
          resumed_existing_session: true,
          program_name: PROGRAM_INFO[program].name,
        })
      }

      try {
        await stripe.checkout.sessions.expire(existingStripeState.openCheckoutSession.id)
      } catch (error) {
        console.warn('Failed to expire stale checkout session before creating a fresh one', {
          sessionId: existingStripeState.openCheckoutSession.id,
          program,
          error: summarizeStripeError(error),
        })
      }
    }

    const sessionPayload: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      success_url: `${appUrl}/dashboard?subscribed=true`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      metadata: {
        user_id: context.activeBusinessId,
        auth_user_id: context.userId,
        program,
        selected_program: program,
        session_type: 'subscription',
        acquisition_path: acquisitionPath,
        assigned_partner_affiliate_id: (profile as { assigned_partner_affiliate_id?: string | null } | null)?.assigned_partner_affiliate_id ?? '',
        setup_fee_cents: String(pricing.setupFeeCents),
        monthly_fee_cents: String(pricing.monthlyFeeCents),
        trial_days: shouldApplyTrial ? String(PAID_PROGRAM_TRIAL_DAYS) : '0',
      },
      subscription_data: {
        metadata: {
          user_id: context.activeBusinessId,
          auth_user_id: context.userId,
          program,
          selected_program: program,
          acquisition_path: acquisitionPath,
          assigned_partner_affiliate_id: (profile as { assigned_partner_affiliate_id?: string | null } | null)?.assigned_partner_affiliate_id ?? '',
          setup_fee_cents: String(pricing.setupFeeCents),
          monthly_fee_cents: String(pricing.monthlyFeeCents),
          trial_days: shouldApplyTrial ? String(PAID_PROGRAM_TRIAL_DAYS) : '0',
        },
        ...(shouldApplyTrial ? { trial_period_days: PAID_PROGRAM_TRIAL_DAYS } : {}),
      },
    }

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create({
        ...sessionPayload,
        line_items: lineItems,
      })
    } catch (error) {
      const canRetryProgramB = checkoutProgram === 'program_b' && isInactiveStripeProductError(error)
      if (!canRetryProgramB) {
        throw error
      }

      console.warn('Retrying Program B checkout with active fallback monthly price', {
        originalMonthlyPriceId: prices.monthly,
        fallbackMonthlyPriceId: PROGRAM_B_MONTHLY_FALLBACK_PRICE_ID,
      })

      const fallbackLineItems = lineItems.map((item, index) => (
        index === lineItems.length - 1
          ? { ...item, price: PROGRAM_B_MONTHLY_FALLBACK_PRICE_ID }
          : item
      ))

      session = await stripe.checkout.sessions.create({
        ...sessionPayload,
        line_items: fallbackLineItems,
      })
    }

    await logActivity(context.activeBusinessId, 'checkout_started', { program, session_id: session.id, auth_user_id: context.userId }, req)

    return NextResponse.json({
      url: session.url,
      pricing_label: formatPricingLabel(program, acquisitionPath),
      acquisition_path: acquisitionPath,
      monthly_fee_cents: pricing.monthlyFeeCents,
      setup_fee_cents: pricing.setupFeeCents,
      trial_days: shouldApplyTrial ? PAID_PROGRAM_TRIAL_DAYS : 0,
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
