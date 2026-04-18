import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { PROGRAM_INFO } from '@/lib/stripe'
import { syncActiveBusinessProfile, syncEditableBusinessProfile } from '@/lib/admin-business-sync'
import type { ProgramId } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { action, user_id, ...payload } = await req.json() as {
      action: string
      user_id: string
      [key: string]: unknown
    }

    if (!action || !user_id) {
      return NextResponse.json({ error: 'action and user_id required' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, assigned_program')
      .eq('id', user_id)
      .single()

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user_id)
      .maybeSingle()

    let result: Record<string, unknown> = {}

    if (action === 'create_customer') {
      const customer = await stripe.customers.create({
        email: profile?.email,
        name: profile?.full_name ?? undefined,
        metadata: { supabase_user_id: user_id },
      })
      await supabase.from('subscriptions').upsert(
        { user_id, stripe_customer_id: customer.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      result = { stripe_customer_id: customer.id }
    }

    else if (action === 'attach_customer') {
      const { stripe_customer_id } = payload as { stripe_customer_id: string }
      if (!stripe_customer_id) return NextResponse.json({ error: 'stripe_customer_id required' }, { status: 400 })
      await supabase.from('subscriptions').upsert(
        { user_id, stripe_customer_id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      result = { stripe_customer_id }
    }

    else if (action === 'attach_subscription') {
      const { stripe_subscription_id } = payload as { stripe_subscription_id: string }
      if (!stripe_subscription_id) return NextResponse.json({ error: 'stripe_subscription_id required' }, { status: 400 })
      await supabase.from('subscriptions').upsert(
        { user_id, stripe_subscription_id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      result = { stripe_subscription_id }
    }

    else if (action === 'send_invoice') {
      const { amount_cents, description, due_days = 7 } = payload as {
        amount_cents: number
        description: string
        due_days?: number
      }
      if (!amount_cents || !description) {
        return NextResponse.json({ error: 'amount_cents and description required' }, { status: 400 })
      }

      let customerId = sub?.stripe_customer_id
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: profile?.email,
          name: profile?.full_name ?? undefined,
          metadata: { supabase_user_id: user_id },
        })
        customerId = customer.id
        await supabase.from('subscriptions').upsert(
          { user_id, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      }

      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: due_days,
        metadata: { supabase_user_id: user_id },
      })

      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: Math.round(amount_cents),
        currency: 'usd',
        description,
      })

      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id)
      await stripe.invoices.sendInvoice(finalizedInvoice.id)

      result = {
        invoice_id: finalizedInvoice.id,
        invoice_url: finalizedInvoice.hosted_invoice_url,
      }
    }

    else if (action === 'create_payment_link') {
      const { amount_cents, description } = payload as {
        amount_cents: number
        description: string
      }
      if (!amount_cents || !description) {
        return NextResponse.json({ error: 'amount_cents and description required' }, { status: 400 })
      }

      const price = await stripe.prices.create({
        currency: 'usd',
        unit_amount: Math.round(amount_cents),
        product_data: { name: description },
      })

      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { supabase_user_id: user_id },
      })

      result = { payment_link_url: paymentLink.url, payment_link_id: paymentLink.id }
    }

    else if (action === 'start_recurring') {
      const program = profile?.assigned_program as ProgramId | null
      if (!program) return NextResponse.json({ error: 'User has no assigned program' }, { status: 400 })

      const programInfo = PROGRAM_INFO[program]
      let customerId = sub?.stripe_customer_id

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: profile?.email,
          name: profile?.full_name ?? undefined,
          metadata: { supabase_user_id: user_id },
        })
        customerId = customer.id
      }

      const { price_id } = payload as { price_id: string }
      if (!price_id) return NextResponse.json({ error: 'price_id required' }, { status: 400 })

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price_id }],
        metadata: { supabase_user_id: user_id, program },
      })

      await supabase.from('subscriptions').upsert(
        {
          user_id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          status: 'active',
          access_status: 'active',
          billing_status: 'recurring_active',
          billing_source: 'stripe_invoice',
          program,
          monthly_fee_standard: programInfo.monthlyFee,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

      await supabase.from('profiles').update({
        billing_status: 'active',
        feature_tier: 'paid',
        updated_at: new Date().toISOString(),
      }).eq('id', user_id)

      await syncEditableBusinessProfile(supabase, user_id, {
        billing_status: 'active',
        feature_tier: 'paid',
        updated_at: new Date().toISOString(),
      })
      await syncActiveBusinessProfile(supabase, user_id)

      result = { stripe_subscription_id: subscription.id }
    }

    else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Admin billing stripe-action error:', error)
    return NextResponse.json({ error: 'Stripe action failed' }, { status: 500 })
  }
}
