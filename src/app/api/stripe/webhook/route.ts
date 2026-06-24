import { NextRequest, NextResponse } from 'next/server'
import { stripe, PRICE_IDS } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { generateTasksForUser } from '@/lib/task-templates'
import { logActivity } from '@/lib/activity'
import { logPortalEvent } from '@/lib/portal-events'
import { getAffiliateByStripeCustomer, createCommission, reverseCommissions } from '@/lib/affiliates'
import { sendChargeConfirmationEmail, sendPaymentReminderEmail } from '@/lib/email'
import { logWebhookError, enqueueWebhookRetry } from '@/lib/webhook-error-logs'
import { linkOrphanedAnalyzerResults } from '@/lib/link-analyzer-results'
import type { ProgramId } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { getPartnerCommissionPercent, normalizeAcquisitionPath } from '@/lib/partner-program'
import {
  buildFailedPaymentReason,
  getInvoiceNextPaymentAttemptAt,
  getInvoicePaymentIntentId,
  getInvoiceRetryCount,
  getInvoiceSubscriptionId,
  resolveFailedPaymentStatus,
} from '@/lib/subscription-recovery'

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

const PROGRAM_SETUP_PRICE_IDS: Partial<Record<ProgramId, string>> = {
  program_a: PRICE_IDS.program_a.setup,
  program_b: PRICE_IDS.program_b.setup,
}

const PROGRAM_MONTHLY_PRICE_IDS: Record<ProgramId, string> = {
  program_a: PRICE_IDS.program_a.monthly,
  program_b: PRICE_IDS.program_b.monthly,
  program_c: PRICE_IDS.program_c.monthly,
}

function getSubscriptionRecoveryStatus(stripeStatus: Stripe.Subscription.Status): 'active' | 'trialing' | 'past_due' | 'past_due_locked' | 'canceled' | 'inactive' {
  if (stripeStatus === 'active' || stripeStatus === 'trialing' || stripeStatus === 'past_due' || stripeStatus === 'canceled') {
    return stripeStatus
  }
  if (stripeStatus === 'unpaid') return 'past_due_locked'
  return 'inactive'
}

function lineHasPrice(line: Stripe.InvoiceLineItem, priceId: string | undefined) {
  const linePriceId = (line as Stripe.InvoiceLineItem & {
    pricing?: { price_details?: { price?: string } }
    price?: { id?: string }
  }).pricing?.price_details?.price ?? (line as Stripe.InvoiceLineItem & { price?: { id?: string } }).price?.id
  return !!priceId && linePriceId === priceId
}

function getInvoiceComponentAmounts(invoice: Stripe.Invoice, program: ProgramId) {
  const lines = invoice.lines?.data ?? []
  const setupFeeCents = lines
    .filter((line) => lineHasPrice(line, PROGRAM_SETUP_PRICE_IDS[program]))
    .reduce((sum, line) => sum + (line.amount ?? 0), 0)
  const recurringCents = lines
    .filter((line) => lineHasPrice(line, PROGRAM_MONTHLY_PRICE_IDS[program]))
    .reduce((sum, line) => sum + (line.amount ?? 0), 0)

  return { setupFeeCents, recurringCents }
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
  acquisitionPath: 'self_serve' | 'partner_assisted' = 'self_serve',
  assignedPartnerAffiliateId: string | null = null,
  setupFeeAmountCents = 0,
  recurringAmountCents: number | null = null,
) {
  // 1. Upsert subscription record
  await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    status: 'active',
    program,
    acquisition_path: acquisitionPath,
    assigned_partner_affiliate_id: assignedPartnerAffiliateId,
    setup_fee_amount_cents: setupFeeAmountCents,
    recurring_amount_cents: recurringAmountCents,
    current_period_end: periodEnd ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  // 2. Upsert memberships table
  await upsertMembership(supabase, userId, program, subscriptionId)

  // 3. Update profile — also promote prospect → active_member on upgrade
  // Ensure feature_tier is set to 'paid' for users completing paid checkout
  await supabase.from('profiles').update({
    billing_status: 'active',
    assigned_program: program,
    acquisition_path: acquisitionPath,
    assigned_partner_affiliate_id: assignedPartnerAffiliateId,
    current_stage: PROGRAM_STAGES[program],
    progress_percentage: 0,
    member_status: 'active_member',
    feature_tier: 'paid',
    portal_blocked: false,
    updated_at: new Date().toISOString(),
  }).eq('id', userId)

  // 4. Generate tasks — replace if they exist but don't match the purchased program
  const { data: existing } = await supabase
    .from('tasks').select('task_id, program').eq('user_id', userId).limit(1)
  const existingProgram = existing?.[0]?.program
  const needsGeneration = !existing || existing.length === 0 || existingProgram !== program
  if (needsGeneration) {
    if (existing && existing.length > 0) {
      await supabase.from('tasks').delete().eq('user_id', userId)
    }
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

  // 6. Enroll in paid onboarding email sequence (upsert — safe to call on re-subscription)
  await supabase.from('onboarding_enrollments').upsert(
    { user_id: userId, enrolled_at: new Date().toISOString() },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )
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
      const session    = event.data.object as Stripe.Checkout.Session
      const userId     = session.metadata?.user_id
      const program    = session.metadata?.program as ProgramId
      const sessionType = session.metadata?.session_type   // 'setup_fee' | 'subscription' | 'ai_credit_pack'
      const customerId = session.customer as string
      const acquisitionPath = normalizeAcquisitionPath(session.metadata?.acquisition_path)
      const assignedPartnerAffiliateId = session.metadata?.assigned_partner_affiliate_id || null
      const setupFeeAmountCents = parseInt(session.metadata?.setup_fee_cents ?? '0', 10) || 0
      const monthlyFeeAmountCents = parseInt(session.metadata?.monthly_fee_cents ?? '0', 10) || 0

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
        // Guard: only allow add_membership if user has active paid subscription
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id, status')
          .eq('user_id', userId)
          .maybeSingle()

        if (!existingSub || (existingSub.status !== 'active' && existingSub.status !== 'trialing')) {
          console.log(`[STRIPE-WEBHOOK] Blocking add_membership for user ${userId}: no active paid subscription`)
          break
        }

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
        // Legacy compatibility path for older setup-fee-only checkouts.
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string)
        const paymentMethodId = paymentIntent.payment_method as string
        const prices = PRICE_IDS[program] as { setup: string; monthly: string }
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: prices.monthly }],
          default_payment_method: paymentMethodId,
          metadata: {
            user_id: userId,
            program,
            acquisition_path: acquisitionPath,
            assigned_partner_affiliate_id: assignedPartnerAffiliateId ?? '',
            setup_fee_cents: String(setupFeeAmountCents),
            monthly_fee_cents: String(monthlyFeeAmountCents),
          },
        })

        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()
        await activateUser(
          supabase,
          userId,
          program,
          subscription.id,
          customerId,
          periodEnd,
          acquisitionPath,
          assignedPartnerAffiliateId,
          setupFeeAmountCents,
          monthlyFeeAmountCents || null,
        )

        // Link analyzer results if user completed free analyzer before signup
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name, business_name')
          .eq('id', userId)
          .single()
        if (profile?.email) {
          const analyzerResult = await linkOrphanedAnalyzerResults(supabase, userId, profile.email)
          if (analyzerResult.linked > 0) {
            const clientName = profile.full_name || profile.business_name || 'Client'
            logPortalEvent({
              userId,
              eventType: 'analyzer_results_linked',
              category: 'billing',
              severity: 'success',
              title: 'Analyzer Results Linked',
              message: `Free analyzer results linked to ${clientName}'s account`,
              metadata: { linked_count: analyzerResult.linked, program },
            })
          }
        }

        logPortalEvent({
          userId,
          eventType: 'subscription_created',
          category: 'subscriptions',
          severity: 'success',
          title: `Subscription created: ${PROGRAM_NAMES[program] || program}`,
          message: `New subscription for ${PROGRAM_NAMES[program] || program}`,
          metadata: { program, subscription_id: subscription.id },
        })
        await logActivity(userId, 'checkout_completed', { program, session_type: 'setup_fee', subscription_id: subscription.id, acquisition_path: acquisitionPath })
      } else {
        const subscriptionId = session.subscription as string
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString()
        await activateUser(
          supabase,
          userId,
          program,
          subscriptionId,
          customerId,
          periodEnd,
          acquisitionPath,
          assignedPartnerAffiliateId,
          setupFeeAmountCents,
          monthlyFeeAmountCents || null,
        )

        // Link analyzer results if user completed free analyzer before signup
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name, business_name')
          .eq('id', userId)
          .single()
        if (profile?.email) {
          const analyzerResult = await linkOrphanedAnalyzerResults(supabase, userId, profile.email)
          if (analyzerResult.linked > 0) {
            const clientName = profile.full_name || profile.business_name || 'Client'
            logPortalEvent({
              userId,
              eventType: 'analyzer_results_linked',
              category: 'billing',
              severity: 'success',
              title: 'Analyzer Results Linked',
              message: `Free analyzer results linked to ${clientName}'s account`,
              metadata: { linked_count: analyzerResult.linked, program },
            })
          }
        }

        logPortalEvent({
          userId,
          eventType: 'subscription_created',
          category: 'subscriptions',
          severity: 'success',
          title: `Subscription created: ${PROGRAM_NAMES[program] || program}`,
          message: `New subscription for ${PROGRAM_NAMES[program] || program}`,
          metadata: { program, subscription_id: subscriptionId },
        })
        await logActivity(userId, 'checkout_completed', {
          program,
          session_type: 'subscription',
          subscription_id: subscriptionId,
          acquisition_path: acquisitionPath,
        })
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

      // ── Log non-invoice checkout payments only ──────────────────────────
      if (sessionType === 'setup_fee' && session.amount_total && session.amount_total > 0) {
        const sessionId = session.id
        const setupAmount = session.amount_total / 100
        const { error: paymentError } = await supabase.from('payment_records').insert({
          user_id: userId,
          amount: setupAmount,
          payment_date: new Date().toISOString().split('T')[0],
          payment_source: 'stripe_checkout',
          payment_type: sessionType === 'setup_fee' ? 'setup_fee' : 'recurring',
          payment_status: 'paid',
          stripe_customer_id: typeof customerId === 'string' ? customerId : null,
          stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          stripe_checkout_session_id: sessionId,
          acquisition_path: acquisitionPath,
          assigned_partner_affiliate_id: assignedPartnerAffiliateId,
          revenue_component: 'setup_fee',
          partner_commission_eligible: acquisitionPath === 'partner_assisted' && !!assignedPartnerAffiliateId,
          notes: `Stripe checkout completed: ${sessionId}`,
          logged_by: 'stripe_webhook',
        })

        if (!paymentError) {
          logPortalEvent({
            userId,
            eventType: 'payment_received',
            category: 'billing',
            severity: 'success',
            title: `Payment received: $${setupAmount.toFixed(2)}`,
            message: `Setup fee of $${setupAmount.toFixed(2)} successfully paid`,
            metadata: { amount: setupAmount, payment_type: 'setup_fee', session_id: sessionId },
          })
        }
      }

      break
    }

    // ── Subscription updated (e.g. trial ended, payment method changed) ────
    case 'customer.subscription.updated': {
      const sub    = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) break

      // Guard: only process subscription updates if subscription record exists in our DB
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('stripe_subscription_id', sub.id)
        .maybeSingle()

      if (!existingSub) {
        console.log(`[STRIPE-WEBHOOK] Ignoring subscription update: no matching subscription record for ${sub.id}`)
        break
      }

      const status = getSubscriptionRecoveryStatus(sub.status)

      const prevStatus = (event.data.previous_attributes as Stripe.Subscription | undefined)?.status

      await supabase.from('subscriptions').update({
        status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
        suspended_at: status === 'past_due_locked' ? new Date().toISOString() : null,
        final_payment_failure_at: status === 'past_due_locked' ? new Date().toISOString() : null,
        next_payment_attempt_at: status === 'active' || status === 'trialing' ? null : null,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId)

      await supabase.from('profiles').update({
        billing_status: status,
        feature_tier: 'paid',
        portal_blocked: false,
        updated_at: new Date().toISOString(),
      }).eq('id', userId)

      // ─── Re-upgrade: Restore access to preserved work ──────────────────────────
      // When a user who downgraded to free re-activates their subscription, restore access
      // to all preserved work (tasks, documents, program memberships) without data loss
      if ((status === 'active' || status === 'trialing') &&
          prevStatus && prevStatus !== 'active' && prevStatus !== 'trialing') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('feature_tier, portal_blocked')
          .eq('id', userId)
          .maybeSingle()

        if (profile?.feature_tier === 'free') {
          // User was downgraded to free and is now re-upgrading
          // Restore feature_tier and unlock access to all preserved work
          await supabase.from('profiles').update({
            feature_tier: 'paid',
            portal_blocked: false,
            member_status: 'active_member',
            updated_at: new Date().toISOString(),
          }).eq('id', userId)
        }
      }

      if ((status === 'active' || status === 'trialing') &&
          prevStatus && prevStatus !== 'active' && prevStatus !== 'trialing') {
        await logActivity(userId, 'subscription_reactivated', { status, previous_status: prevStatus })
        const { data: reactivatedProfile } = await supabase
          .from('profiles').select('full_name, business_name, assigned_program').eq('id', userId).maybeSingle()
        logPortalEvent({
          userId,
          eventType: 'subscription_reactivated',
          category: 'subscriptions',
          severity: 'success',
          title: `Subscription reactivated — ${reactivatedProfile?.full_name ?? reactivatedProfile?.business_name ?? 'Client'}`,
          message: `${PROGRAM_NAMES[reactivatedProfile?.assigned_program as ProgramId] ?? 'Membership'} reactivated (was ${prevStatus})`,
          metadata: { previous_status: prevStatus, program: reactivatedProfile?.assigned_program },
        })
      }

      break
    }

    // ── Subscription canceled ───────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const sub    = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) break

      // Guard: only process subscription deletions if subscription record exists in our DB
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('stripe_subscription_id', sub.id)
        .maybeSingle()

      if (!existingSub) {
        console.log(`[STRIPE-WEBHOOK] Ignoring subscription deletion: no matching subscription record for ${sub.id}`)
        break
      }

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
        billing_status: 'canceled',
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

      // Admin notification for cancellation
      const { data: canceledProfile } = await supabase
        .from('profiles').select('full_name, business_name, assigned_program').eq('id', userId).maybeSingle()
      logPortalEvent({
        userId,
        eventType: 'subscription_canceled',
        category: 'subscriptions',
        severity: 'warning',
        title: `Subscription canceled — ${canceledProfile?.full_name ?? canceledProfile?.business_name ?? 'Client'}`,
        message: `${PROGRAM_NAMES[canceledProfile?.assigned_program as ProgramId] ?? 'Membership'} subscription has been canceled`,
        metadata: { subscription_id: sub.id, program: canceledProfile?.assigned_program },
      })

      // Update referral status when subscription is canceled
      // sub.customer can be a string ID or an expanded Stripe.Customer object — extract safely
      const canceledCustomerId = typeof sub.customer === 'string'
        ? sub.customer
        : (sub.customer as Stripe.Customer | null)?.id ?? null
      if (canceledCustomerId) {
        try {
          await supabase.from('affiliate_referrals')
            .update({ referral_status: 'canceled', subscription_active: false })
            .eq('stripe_customer_id', canceledCustomerId)
        } catch (e) { console.error('Referral update error:', e) }
      }

      break
    }

    // ── Payment failed ──────────────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const invoice    = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const failedStatus = resolveFailedPaymentStatus(invoice)
      const nextPaymentAttemptAt = getInvoiceNextPaymentAttemptAt(invoice)
      const retryCount = getInvoiceRetryCount(invoice)
      const paymentIntentId = getInvoicePaymentIntentId(invoice)
      const subscriptionId = getInvoiceSubscriptionId(invoice)
      const failureReason = buildFailedPaymentReason(invoice)
      const paymentIntent = (invoice as Stripe.Invoice & {
        payment_intent?: Stripe.PaymentIntent | string | null
      }).payment_intent
      const lastPaymentError = paymentIntent && typeof paymentIntent !== 'string'
        ? paymentIntent.last_payment_error
        : null

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id, program')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (sub?.user_id) {
        await supabase.from('subscriptions').update({
          status: failedStatus,
          failed_payment_reason: failureReason,
          failed_payment_code: lastPaymentError?.code ?? null,
          failed_payment_decline_code: lastPaymentError?.decline_code ?? null,
          last_failed_payment_at: new Date().toISOString(),
          next_payment_attempt_at: nextPaymentAttemptAt,
          last_failed_invoice_id: invoice.id,
          last_failed_payment_intent_id: paymentIntentId,
          last_failed_charge_id: typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id ?? null,
          payment_retry_count: retryCount,
          final_payment_failure_at: failedStatus === 'past_due_locked' ? new Date().toISOString() : null,
          suspended_at: failedStatus === 'past_due_locked' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq('stripe_customer_id', customerId)

        // ─── Automatic downgrade to free tier on payment failure ─────────────────
        // When a recurring payment fails, automatically downgrade to free tier
        // and block portal access until payment is recovered
        await supabase.from('profiles').update({
          billing_status: failedStatus,
          feature_tier: 'paid',
          portal_blocked: false,
          member_status: 'active_member',
          updated_at: new Date().toISOString(),
        }).eq('id', sub.user_id)

        const membershipStatusUpdate = {
          status: failedStatus,
          updated_at: new Date().toISOString(),
        }
        if (subscriptionId) {
          await supabase.from('memberships').update(membershipStatusUpdate).eq('stripe_subscription_id', subscriptionId)
        } else {
          await supabase.from('memberships').update(membershipStatusUpdate).eq('user_id', sub.user_id).eq('status', 'active')
        }

        await supabase.from('notifications').insert({
          user_id: sub!.user_id,
          type: 'system',
          title: failedStatus === 'past_due_locked' ? 'Membership Paused' : 'Payment Failed',
          message: failedStatus === 'past_due_locked'
            ? 'Your membership is paused due to failed payment. Update your card to restore access.'
            : 'Payment failed. Please update your payment method.',
          read: false,
          created_at: new Date().toISOString(),
        })

        const { data: profileForEmail } = await supabase
          .from('profiles')
          .select('full_name, business_name, email, assigned_program')
          .eq('id', sub.user_id)
          .maybeSingle()

        const toEmail = profileForEmail?.email || (invoice.customer_email as string | null)
        if (toEmail) {
          sendPaymentReminderEmail({
            toEmail,
            toName: profileForEmail?.full_name || profileForEmail?.business_name || 'Client',
            reminderType: 'past_due',
            amountDue: invoice.amount_remaining ? invoice.amount_remaining / 100 : undefined,
            dueDate: nextPaymentAttemptAt ?? undefined,
            programLabel: PROGRAM_NAMES[profileForEmail?.assigned_program as ProgramId] ?? 'SourcifyLending Membership',
            notes: failureReason,
          }).catch(err => console.error('[PaymentReminder] Email error:', err))
        }

        await logActivity(sub.user_id, 'payment_failed', {
          customer_id: customerId,
          invoice_id: invoice.id,
          subscription_id: subscriptionId,
          retry_count: retryCount,
          next_payment_attempt_at: nextPaymentAttemptAt,
          status: failedStatus,
          failure_reason: failureReason,
        })
        logPortalEvent({
          userId: sub.user_id,
          eventType: 'payment_failed',
          category: 'billing',
          severity: failedStatus === 'past_due_locked' ? 'critical' : 'warning',
          title: failedStatus === 'past_due_locked' ? 'Payment failed - membership paused' : 'Payment failed - grace period active',
          message: failedStatus === 'past_due_locked'
            ? 'Stripe has no next retry scheduled. Premium access is paused until the client updates their payment method.'
            : 'Subscription payment failed. Client remains active during Stripe dunning and can update their payment method.',
          metadata: {
            customer_id: customerId,
            invoice_id: invoice.id,
            subscription_id: subscriptionId,
            retry_count: retryCount,
            next_payment_attempt_at: nextPaymentAttemptAt,
            failure_reason: failureReason,
            decline_code: lastPaymentError?.decline_code ?? null,
            payment_intent_id: paymentIntentId,
          },
        })

      }

      break
    }

    // ── Charge refunded ─────────────────────────────────────────────────────
    case 'invoice.payment_succeeded':
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id, id, acquisition_path, assigned_partner_affiliate_id, program')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (sub) {
        await supabase.from('subscriptions').update({
          status: 'active',
          next_payment_attempt_at: null,
          payment_retry_count: 0,
          final_payment_failure_at: null,
          suspended_at: null,
          updated_at: new Date().toISOString(),
        }).eq('stripe_customer_id', customerId)

        await supabase.from('memberships').update({
          status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('user_id', sub.user_id).in('status', ['past_due', 'past_due_locked', 'suspended'])

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, business_name, assigned_program, email, acquisition_path, assigned_partner_affiliate_id, billing_status, feature_tier')
          .eq('id', sub.user_id)
          .maybeSingle()

        if (profile && ['past_due', 'past_due_locked', 'suspended', 'inactive'].includes(profile.billing_status ?? '')) {
          await supabase.from('profiles').update({
            billing_status: 'active',
            feature_tier: 'paid',
            portal_blocked: false,
            member_status: 'active_member',
            updated_at: new Date().toISOString(),
          }).eq('id', sub.user_id)

          await supabase.from('notifications').insert({
            user_id: sub.user_id,
            type: 'system',
            title: 'Payment Received - Access Restored',
            message: 'Your payment was successful. Your paid membership access has been restored.',
            read: false,
            created_at: new Date().toISOString(),
          })

          await logActivity(sub.user_id, 'subscription_reactivated', { customer_id: customerId, recovery: 'from_payment_failure' })
        }

        const amountPaid = (invoice.amount_paid || 0) / 100
        const program = (profile?.assigned_program || sub.program) as ProgramId | null
        if (amountPaid > 0 && program) {
          const acquisitionPath = normalizeAcquisitionPath(profile?.acquisition_path || sub.acquisition_path)
          const assignedPartnerAffiliateId = profile?.assigned_partner_affiliate_id || sub.assigned_partner_affiliate_id || null
          const { setupFeeCents, recurringCents } = getInvoiceComponentAmounts(invoice, program)
          const paymentDate = new Date().toISOString().split('T')[0]
          const paymentRecords: Array<Record<string, unknown>> = []

          if (setupFeeCents > 0) {
            paymentRecords.push({
              user_id: sub.user_id,
              subscription_id: sub.id,
              amount: setupFeeCents / 100,
              payment_date: paymentDate,
              payment_source: 'stripe_invoice',
              payment_type: 'setup_fee',
              payment_status: 'paid',
              client_name_snapshot: profile?.full_name || profile?.business_name || null,
              program_code: profile?.assigned_program || program,
              stripe_customer_id: customerId,
              stripe_invoice_id: invoice.id,
              acquisition_path: acquisitionPath,
              assigned_partner_affiliate_id: assignedPartnerAffiliateId,
              revenue_component: 'setup_fee',
              partner_commission_eligible: acquisitionPath === 'partner_assisted' && !!assignedPartnerAffiliateId,
              notes: `Stripe setup fee collected: ${invoice.id}`,
              logged_by: 'stripe_webhook',
            })
          }

          const recurringAmountCents = recurringCents > 0 ? recurringCents : invoice.amount_paid - setupFeeCents
          if (recurringAmountCents > 0 || paymentRecords.length === 0) {
            paymentRecords.push({
              user_id: sub.user_id,
              subscription_id: sub.id,
              amount: (recurringAmountCents > 0 ? recurringAmountCents : invoice.amount_paid) / 100,
              payment_date: paymentDate,
              payment_source: 'stripe_invoice',
              payment_type: 'recurring',
              payment_status: 'paid',
              client_name_snapshot: profile?.full_name || profile?.business_name || null,
              program_code: profile?.assigned_program || program,
              stripe_customer_id: customerId,
              stripe_invoice_id: invoice.id,
              acquisition_path: acquisitionPath,
              assigned_partner_affiliate_id: assignedPartnerAffiliateId,
              revenue_component: 'recurring',
              partner_commission_eligible: acquisitionPath === 'partner_assisted' && !!assignedPartnerAffiliateId,
              notes: `Stripe invoice paid: ${invoice.id}`,
              logged_by: 'stripe_webhook',
            })
          }

          const { error: paymentError } = await supabase.from('payment_records').insert(paymentRecords)
          if (!paymentError && paymentRecords.length > 0) {
            const totalAmount = paymentRecords.reduce((sum, r) => sum + (r.amount as number), 0)
            logPortalEvent({
              userId: sub.user_id,
              eventType: 'payment_received',
              category: 'billing',
              severity: 'success',
              title: `Payment received: $${totalAmount.toFixed(2)}`,
              message: `Payment of $${totalAmount.toFixed(2)} successfully processed`,
              metadata: { amount: totalAmount, invoice_id: invoice.id, records_count: paymentRecords.length },
            })
          }

          const toEmail = profile?.email || (invoice.customer_email as string | null) || null
          if (toEmail) {
            const { data: recentActions } = await supabase
              .from('agent_actions')
              .select('title, description')
              .eq('user_id', sub.user_id)
              .eq('visible_to_user', true)
              .order('created_at', { ascending: false })
              .limit(5)

            sendChargeConfirmationEmail({
              toEmail,
              toName: profile?.full_name || profile?.business_name || 'Member',
              amountPaid,
              programLabel: PROGRAM_NAMES[profile?.assigned_program as ProgramId] ?? profile?.assigned_program ?? 'Membership',
              invoiceId: invoice.id,
              billingDate: new Date().toISOString(),
              deliverables: recentActions?.map(a => ({ title: a.title, description: a.description ?? undefined })) ?? [],
            }).catch(err => console.error('[ChargeConfirmation] Email error:', err))
          }

          logPortalEvent({
            userId: sub.user_id,
            eventType: 'payment_succeeded',
            category: 'billing',
            severity: 'success',
            title: `Payment received - ${profile?.full_name || profile?.business_name || 'Client'}`,
            message: `$${amountPaid.toFixed(2)} for ${PROGRAM_NAMES[profile?.assigned_program as ProgramId] ?? profile?.assigned_program ?? 'Membership'}`,
            metadata: {
              amount: amountPaid,
              program: profile?.assigned_program,
              invoice_id: invoice.id,
              customer_id: customerId,
            },
          })
        }
      }

      const invPaid = event.data.object as Stripe.Invoice
      if (invPaid.customer && invPaid.status === 'paid' && invPaid.amount_paid > 0) {
        try {
          const payingCustomerId = invPaid.customer as string
          const { data: liveSub } = await supabase
            .from('subscriptions')
            .select('user_id, program, acquisition_path, assigned_partner_affiliate_id')
            .eq('stripe_customer_id', payingCustomerId)
            .maybeSingle()

          let referral = await getAffiliateByStripeCustomer(payingCustomerId)
          const partnerAffiliateId = liveSub?.assigned_partner_affiliate_id || referral?.affiliate_id || null
          const acquisitionPath = normalizeAcquisitionPath(liveSub?.acquisition_path)
          const programType = (liveSub?.program || referral?.program_type || 'program_a') as ProgramId

          if (partnerAffiliateId && acquisitionPath === 'partner_assisted') {
            if (!referral && liveSub?.user_id) {
              const { data: fallbackReferral } = await supabase
                .from('affiliate_referrals')
                .select('id, affiliate_id, user_id, deal_type, deal_type_approved, program_type, affiliates(id, user_id, email, created_at, status, is_demo)')
                .eq('affiliate_id', partnerAffiliateId)
                .eq('user_id', liveSub.user_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
              referral = fallbackReferral
            }

            const { setupFeeCents, recurringCents } = getInvoiceComponentAmounts(invPaid, programType)
            const lineItems = [
              { component: 'setup_fee' as const, amount: setupFeeCents, commissionType: 'setup' as const },
              { component: 'recurring' as const, amount: recurringCents > 0 ? recurringCents : invPaid.amount_paid - setupFeeCents, commissionType: 'recurring' as const },
            ].filter((item) => item.amount > 0)

            for (const item of lineItems) {
              const percent = getPartnerCommissionPercent(programType, item.component, referral?.deal_type)
              if (percent <= 0) continue
              await createCommission({
                affiliateId: partnerAffiliateId,
                referralId: referral?.id ?? null,
                userId: liveSub?.user_id ?? referral?.user_id ?? null,
                stripePaymentIntentId: invPaid.payment_intent as string | null,
                stripeInvoiceId: invPaid.id,
                programType,
                commissionType: item.commissionType,
                grossAmountCents: item.amount,
                idempotencyKey: `inv_${invPaid.id}_${item.component}_${partnerAffiliateId}`,
                dealType: referral?.deal_type ?? 'partner_assisted',
                dealTypeApproved: referral?.deal_type_approved as boolean | null ?? true,
              })
            }
          }
        } catch (e) { console.error('Affiliate commission error:', e) }
      }

      break
    }

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

    // Log error to database for tracking
    const errorLogId = await logWebhookError(supabase, event.id, event.type, err, {
      event_type: event.type,
      timestamp: new Date().toISOString(),
    })

    // Enqueue for retry
    await enqueueWebhookRetry(supabase, event.id, event.type, event.data, errorLogId || undefined)

    // Return 200 to prevent Stripe from endlessly retrying — error is logged for investigation
    return NextResponse.json({
      received: true,
      warning: 'Processing error logged and queued for retry',
      error_log_id: errorLogId,
    })
  }

  return NextResponse.json({ received: true })
}
