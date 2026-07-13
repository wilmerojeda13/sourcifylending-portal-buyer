export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getBusinessContext } from '@/lib/business-context'
import { createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

function toIsoDate(value: number | null) {
  return value ? new Date(value * 1000).toISOString() : null
}

function toPaymentMethodSummary(paymentMethod: unknown) {
  if (!paymentMethod || typeof paymentMethod !== 'object') return null

  const card = 'card' in paymentMethod ? paymentMethod.card : null
  if (!card || typeof card !== 'object') return null

  return {
    brand: 'brand' in card ? card.brand ?? null : null,
    last4: 'last4' in card ? card.last4 ?? null : null,
    exp_month: 'exp_month' in card ? card.exp_month ?? null : null,
    exp_year: 'exp_year' in card ? card.exp_year ?? null : null,
  }
}

export async function GET() {
  try {
    const context = await getBusinessContext()
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createServiceClient()
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id')
      .eq('user_id', context.activeBusinessId)
      .maybeSingle()

    if (!subscription?.stripe_subscription_id && !subscription?.stripe_customer_id) {
      return NextResponse.json({ subscription: null, payment_method: null })
    }

    let liveSubscription: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>> | null = null
    if (subscription?.stripe_subscription_id) {
      liveSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id, {
        expand: ['default_payment_method'],
      })
    }

    let paymentMethodSummary = toPaymentMethodSummary(liveSubscription?.default_payment_method)
    if (!paymentMethodSummary && subscription?.stripe_customer_id) {
      const customer = await stripe.customers.retrieve(subscription.stripe_customer_id, {
        expand: ['invoice_settings.default_payment_method'],
      })

      if (!customer.deleted) {
        paymentMethodSummary = toPaymentMethodSummary(customer.invoice_settings?.default_payment_method)
      }
    }

    return NextResponse.json({
      subscription: liveSubscription ? {
        stripe_subscription_id: liveSubscription.id,
        status: liveSubscription.status,
        current_period_start: toIsoDate(liveSubscription.current_period_start),
        current_period_end: toIsoDate(liveSubscription.current_period_end),
        cancel_at_period_end: Boolean(liveSubscription.cancel_at_period_end),
        cancel_at: toIsoDate(liveSubscription.cancel_at),
        canceled_at: toIsoDate(liveSubscription.canceled_at),
      } : null,
      payment_method: paymentMethodSummary,
    })
  } catch (error) {
    console.error('Subscription status error:', error)
    return NextResponse.json({ error: 'Failed to load subscription status' }, { status: 500 })
  }
}
