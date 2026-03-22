import { NextRequest, NextResponse } from 'next/server'
import { stripe, PRICE_IDS, thirtyDaysFromNow } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { generateTasksForUser } from '@/lib/task-templates'
import { logActivity } from '@/lib/activity'
import { logPortalEvent } from '@/lib/portal-events'
import { getAffiliateByStripeCustomer, createCommission, reverseCommissions } from '@/lib/affiliates'
import type { ProgramId } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// ─── Program Metadata ─────────────────────────────────────────────────────────
const PROGRAM_STAGES: Record<ProgramId, string> = {
  program_a: 'Credit Readiness',
  program_b: 'Foundation',
  program_c: 'Monthly Review',
}

const PROGRAM_NAMES: Record<ProgramId, string> = {
  program_a: '0% Intro APR Advisory',
  program_b: 'Business Credit Builder',
  program_c: 'Capital Monitoring Membership',
}

// ─── Helper: upsert into memberships table ────────────────────────────────────
async function upsertMembership(
  supabase: SupabaseClient,
  userId: string,
  program: ProgramId,
  stripeSubscriptionId: string,
) {
  await supabase.from('memberships').upsert(
    {
      user_id: userId,
      program_code: program,
      status: 'active',
      stripe_subscription_id: stripeSubscriptionId,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,program_code' }
  )
}

// ─── Helper: activate a user after successful payment ─────────────────────────
async function activateUser(
  supabase: SupabaseClient,
  userId: string,
  program: ProgramId,
  subscriptionId: string,
  customerId: string,
  periodEnd?: string,
) {
  // 1. Upsert subscription record
  await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    status: 'active',
    program,
    current_period_end: periodEnd ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  // 2. Upsert memberships table
  await upsertMembership(supabase, userId, program, subscriptionId)

  // 3. Update profile — also promote prospect → active_member on upgrade
  await supabase.from('profiles').update({
    subscription_status: 'active',
    assigned_program: program,
    current_stage: PROGRAM_STAGES[program],
    progress_percentage: 0,
    account_state: 'active_member',
    updated_at: new Date().toISOString(),
  }).eq('id', userId)

  // 4. Generate tasks if none exist yet
  const { data: existing } = await supabase
    .from('tasks').select('task_id').eq('user_id', userId).limit(1)
  if (!existing || existing.length === 0) {
    const tasks = generateTasksForUser(userId, program)
    for (const task of tasks) {
      await supabase.from('tasks').insert({ ...task, created_at: new Date().toISOString() })
    }
  }

  // 5. Welcome notification
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'system',
    title: '🎉 Welcome to SourcifyLending!',
    message: `Your ${PROGRAM_NAMES[program]} program is now active. Head to your dashboard to see your first task.`,
    read: false,
    created_at: new Date().toISOString(),
  })
}

// ─── Main Webhook Handler ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature error:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  try {
  switch (event.type) {

    // ── Checkout completed ──────────────────────────────────────────────────
    case 'checkout.session.completed': {
      const session    = event.data.object as Stripe.CheckoutSession
      const userId     = session.metadata?.user_id
      const program    = session.metadata?.program as ProgramId
      const sessionType = session.metadata?.session_type   // 'setup_fee' | 'subscription' | 'ai_credit_pack'
      const customerId = session.customer as string

      if (!userId) break

      // ── AI Credit Pack purchase ─────────────────────────────────────────
      if (sessionType === 'ai_credit_pack') {
        const packId         = session.metadata?.pack_id
        const creditsAmount  = parseInt(session.metadata?.credits_amount ?? '0', 10)
        const sessionId      = session.id
        const paymentIntentId = session.payment_intent as string | null

        if (!packId || !creditsAmount || !sessionId) break

        // Idempotency guard — skip if already processed
        const { data: existing } = await supabase
          .from('ai_credit_purchase_transactions')
          .select('id')
          .eq('stripe_checkout_session_id', sessionId)
          .maybeSingle()

        if (existing) {
          console.log(`[AI-CREDITS-WEBHOOK] Already processed session ${sessionId}, skipping.`)
          break
        }

        // 1. Create purchased credit bucket
        const now = new Date().toISOString()
        const { data: bucket, error: bucketErr } = await supabase
          .from('user_purchased_ai_credits')
          .insert({
            user_id: userId,
            credits_purchased: creditsAmount,
            credits_used: 0,
            credits_remaining: creditsAmount,
            source_type: 'stripe_purchase',
            source_reference_id: sessionId,
            purchase_date: now,
            status: 'active',
          })
          .select('id')
          .single()

        if (bucketErr || !bucket) {
          console.error('[AI-CREDITS-WEBHOOK] Failed to create credit bucket:', bucketErr)
          break
        }

        // 2. Log the transaction (UNIQUE on session ID — safe to insert)
        await supabase.from('ai_credit_purchase_transactions').insert({
          user_id: userId,
          ai_credit_pack_id: packId,
          purchased_credits_bucket_id: bucket.id,
          stripe_checkout_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
          amount_paid: session.amount_total != null ? session.amount_total / 100 : null,
          credits_added: creditsAmount,
          transaction_status: 'completed',
        })

        // 3. Welcome notification
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'system',
          title: '✅ AI Credits Added!',
          message: `${creditsAmount} extra AI credits have been added to your account and are ready to use.`,
          read: false,
          created_at: now,
        })

        // 4. Log to payment_records for revenue tracker
        if (session.amount_total && session.amount_total > 0) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, business_name, assigned_program')
            .eq('id', userId)
            .maybeSingle()

          await supabase.from('payment_records').insert({
            user_id: userId,
            amount: session.amount_total / 100,
            payment_date: new Date().toISOString().split('T')[0],
            payment_source: 'stripe_checkout',
            payment_type: 'add_on',
            payment_status: 'paid',
            client_name_snapshot: profile?.full_name || profile?.business_name || null,
            program_code: profile?.assigned_program || null,
            stripe_customer_id: typeof customerId === 'string' ? customerId : null,
            stripe_payment_intent_id: typeof paymentIntentId === 'string' ? paymentIntentId : null,
            notes: `AI credit pack: ${creditsAmount} credits (${packId})`,
            logged_by: 'stripe_webhook',
          })
        }

        console.log(`[AI-CREDITS-WEBHOOK] Granted ${creditsAmount} credits to user ${userId}`)
        break
      }

      if (!program) break

      // ── Add-on membership (Program C added to existing A or B) ────────────
      if (sessionType === 'add_membership') {
        const subscriptionId = session.subscription as string
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString()

        // Insert/update the new membership row only — don't overwrite primary subscription
        await upsertMembership(supabase, userId, program, subscriptionId)

        // Keep subscriptions table customer linked
        await supabase.from('subscriptions').upsert(
          { user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )

        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'system',
          title: '✅ Add-on Membership Activated!',
          message: `Your ${PROGRAM_NAMES[program]} add-on is now active and ready to use.`,
          read: false,
          created_at: new Date().toISOString(),
        })

        await logActivity(userId, 'checkout_completed', { program, session_type: 'add_membership', subscription_id: subscriptionId, period_end: periodEnd })
        break
      }

      if (sessionType === 'setup_fee') {
        // ── Programs A & B: setup fee paid ─────────────────────────────────
        // Retrieve payment intent to get the saved payment method
        const paymentIntent = await stripe.paymentIntents.retrieve(
          session.payment_intent as string
        )
        const paymentMethodId = paymentIntent.payment_method as string

        // Create monthly subscription starting 30 days from now
        const prices = PRICE_IDS[program] as { setup: string; monthly: string }
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: prices.monthly }],
          trial_end: thirtyDaysFromNow(),
          default_payment_method: paymentMethodId,
          metadata: { user_id: userId, program },
        })

        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()
        await activateUser(supabase, userId, program, subscription.id, customerId, periodEnd)
        await logActivity(userId, 'checkout_completed', { program, session_type: 'setup_fee', subscription_id: subscription.id })

        // Extra notification about the delayed billing
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'system',
          title: '📅 Subscription Starts in 30 Days',
          message: `Your setup fee has been processed. Your monthly subscription will begin on ${new Date(thirtyDaysFromNow() * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`,
          read: false,
          created_at: new Date().toISOString(),
        })

      } else {
        // ── Program C: standard monthly subscription ───────────────────────
        const subscriptionId = session.subscription as string
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString()
        await activateUser(supabase, userId, program, subscriptionId, customerId, periodEnd)
        await logActivity(userId, 'checkout_completed', { program, session_type: 'subscription', subscription_id: subscriptionId })
      }

      // ── Portal event: subscription created ─────────────────────────────
      logPortalEvent({
        userId,
        eventType: 'subscription_created',
        category: 'subscriptions',
        severity: 'success',
        title: `New subscription: ${PROGRAM_NAMES[program]}`,
        message: `User completed checkout for ${PROGRAM_NAMES[program]}`,
        metadata: { program, session_type: sessionType ?? 'subscription', customer_id: customerId },
      })

      // ── Log setup fee / checkout payment record ─────────────────────────
      if (session.amount_total && session.amount_total > 0) {
        const sessionId = session.id
        const setupAmount = session.amount_total / 100
        await supabase.from('payment_records').insert({
          user_id: userId,
          amount: setupAmount,
          payment_date: new Date().toISOString().split('T')[0],
          payment_source: 'stripe_checkout',
          payment_type: sessionType === 'setup_fee' ? 'setup_fee' : 'recurring',
          payment_status: 'paid',
          stripe_customer_id: typeof customerId === 'string' ? customerId : null,
          stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          stripe_checkout_session_id: sessionId,
          notes: `Stripe checkout completed: ${sessionId}`,
          logged_by: 'stripe_webhook',
        }).select().maybeSingle()
      }

      break
    }

    // ── Subscription updated (e.g. trial ended, payment method changed) ────
    case 'customer.subscription.updated': {
      const sub    = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) break

      const status = (sub.status === 'active' || sub.status === 'trialing')
        ? sub.status
        : 'inactive'

      const prevStatus = (event.data.previous_attributes as Stripe.Subscription | undefined)?.status

      await supabase.from('subscriptions').update({
        status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId)

      await supabase.from('profiles').update({
        subscription_status: status,
        updated_at: new Date().toISOString(),
      }).eq('id', userId)

      if ((status === 'active' || status === 'trialing') &&
          prevStatus && prevStatus !== 'active' && prevStatus !== 'trialing') {
        await logActivity(userId, 'subscription_reactivated', { status, previous_status: prevStatus })
      }

      break
    }

    // ── Subscription canceled ───────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const sub    = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) break

      // Mark the specific membership row as canceled (matched by stripe_subscription_id)
      await supabase.from('memberships').update({
        status: 'canceled',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('stripe_subscription_id', sub.id)

      await supabase.from('subscriptions').update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId)

      await supabase.from('profiles').update({
        subscription_status: 'canceled',
        updated_at: new Date().toISOString(),
      }).eq('id', userId)

      // Lock all in-progress tasks
      await supabase.from('tasks')
        .update({ status: 'locked' })
        .eq('user_id', userId)
        .eq('status', 'pending')

      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'system',
        title: 'Membership Canceled',
        message: 'Your membership has been canceled. Your progress is saved — reactivate anytime to pick up where you left off.',
        read: false,
        created_at: new Date().toISOString(),
      })

      await logActivity(userId, 'subscription_canceled', { subscription_id: sub.id })

      // Update referral status when subscription is canceled
      const deletedSub = event.data.object as Stripe.Subscription
      if (deletedSub.customer) {
        try {
          await supabase.from('affiliate_referrals')
            .update({ referral_status: 'canceled', subscription_active: false })
            .eq('stripe_customer_id', deletedSub.customer as string)
        } catch (e) { console.error('Referral update error:', e) }
      }

      break
    }

    // ── Payment failed ──────────────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const invoice    = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (sub?.user_id) {
        await supabase.from('subscriptions').update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('stripe_customer_id', customerId)

        await supabase.from('profiles').update({
          subscription_status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('id', sub.user_id)

        await supabase.from('notifications').insert({
          user_id: sub.user_id,
          type: 'system',
          title: '⚠️ Payment Failed',
          message: 'Your recent payment failed. Please update your billing info to avoid a service interruption.',
          read: false,
          created_at: new Date().toISOString(),
        })

        await logActivity(sub.user_id, 'payment_failed', { customer_id: customerId })
        logPortalEvent({
          userId: sub.user_id,
          eventType: 'payment_failed',
          category: 'billing',
          severity: 'critical',
          title: 'Payment failed',
          message: 'A subscription payment has failed. The user has been notified.',
          metadata: { customer_id: customerId },
        })
      }

      break
    }

    // ── Invoice paid (recurring subscription payment) ───────────────────────
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id, id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (sub) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, business_name, assigned_program')
          .eq('id', sub.user_id)
          .maybeSingle()

        const amountPaid = (invoice.amount_paid || 0) / 100
        if (amountPaid > 0) {
          await supabase.from('payment_records').insert({
            user_id: sub.user_id,
            subscription_id: sub.id,
            amount: amountPaid,
            payment_date: new Date().toISOString().split('T')[0],
            payment_source: 'stripe_invoice',
            payment_type: 'recurring',
            payment_status: 'paid',
            client_name_snapshot: profile?.full_name || profile?.business_name || null,
            program_code: profile?.assigned_program || null,
            stripe_customer_id: customerId,
            stripe_invoice_id: invoice.id,
            notes: `Stripe invoice paid: ${invoice.id}`,
            logged_by: 'stripe_webhook',
          })
        }
      }

      // Affiliate commission for recurring payments
      const invPaid = event.data.object as Stripe.Invoice
      if (invPaid.customer && invPaid.status === 'paid' && invPaid.amount_paid > 0) {
        try {
          const referral = await getAffiliateByStripeCustomer(invPaid.customer as string)
          // getAffiliateByStripeCustomer already filters out self-referrals and flagged records.
          // Additional guard: check the paying Stripe customer is not the affiliate themselves
          // (catches cases where affiliate's own Stripe customer ID matches a referral record).
          const payingCustomerId = invPaid.customer as string
          let affiliateOwnCustomerId: string | null = null
          if (referral?.affiliates?.user_id) {
            const { data: affSub } = await supabase
              .from('subscriptions')
              .select('stripe_customer_id')
              .eq('user_id', referral.affiliates.user_id)
              .maybeSingle()
            affiliateOwnCustomerId = affSub?.stripe_customer_id ?? null
          }
          const isSelfPayment = affiliateOwnCustomerId && affiliateOwnCustomerId === payingCustomerId

          if (referral && referral.affiliates && !isSelfPayment) {
            // Determine commission type and program
            const programType = referral.program_type || 'program_a'
            const isSetup = invPaid.metadata?.commission_type === 'setup'
            const commType = isSetup ? 'setup' : 'recurring'
            const dealType = (referral.deal_type as 'referral_only' | 'affiliate_closed') || 'referral_only'
            const dealTypeApproved = referral.deal_type_approved as boolean | null ?? null

            await createCommission({
              affiliateId: referral.affiliate_id,
              referralId: referral.id,
              userId: referral.user_id,
              stripePaymentIntentId: invPaid.payment_intent as string | null,
              stripeInvoiceId: invPaid.id,
              programType,
              commissionType: commType,
              grossAmountCents: invPaid.amount_paid,
              idempotencyKey: `inv_${invPaid.id}_${commType}`,
              dealType,
              dealTypeApproved,
            })

            // Lock deal_type after first payment — cannot be changed after this point
            await supabase.from('affiliate_referrals').update({
              referral_status: 'active',
              subscription_active: true,
              last_payment_at: new Date().toISOString(),
              deal_type_locked: true,
            }).eq('id', referral.id)
          }
        } catch (e) { console.error('Affiliate commission error:', e) }
      }

      break
    }

    // ── Charge refunded ─────────────────────────────────────────────────────
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const customerId = charge.customer as string

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id, id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (sub) {
        const refundAmount = (charge.amount_refunded || 0) / 100
        if (refundAmount > 0) {
          await supabase.from('payment_records').insert({
            user_id: sub.user_id,
            subscription_id: sub.id,
            amount: -refundAmount,
            payment_date: new Date().toISOString().split('T')[0],
            payment_source: 'stripe_invoice',
            payment_type: 'refund',
            payment_status: 'refunded',
            stripe_customer_id: typeof customerId === 'string' ? customerId : null,
            stripe_payment_intent_id: typeof charge.payment_intent === 'string' ? charge.payment_intent : null,
            notes: `Stripe refund: charge ${charge.id}`,
            logged_by: 'stripe_webhook',
          })
        }
      }

      // Reverse affiliate commissions
      const refundCharge = event.data.object as Stripe.Charge
      if (refundCharge.payment_intent) {
        try {
          await reverseCommissions(refundCharge.payment_intent as string, null, 'charge_refunded')
        } catch (e) { console.error('Commission reversal error:', e) }
      }

      break
    }
  }

  } catch (err) {
    console.error('[Stripe Webhook] Unhandled error processing event:', event.type, err)
    // Return 200 to prevent Stripe from endlessly retrying — log the error for investigation
    return NextResponse.json({ received: true, warning: 'Processing error logged' })
  }

  return NextResponse.json({ received: true })
}
