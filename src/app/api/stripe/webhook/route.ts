import { NextRequest, NextResponse } from 'next/server'
import { stripe, PRICE_IDS } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { generateTasksForUser } from '@/lib/task-templates'
import { logActivity } from '@/lib/activity'
import { logPortalEvent } from '@/lib/portal-events'
import { getAffiliateByStripeCustomer, createCommission, reverseCommissions } from '@/lib/affiliates'
import { sendChargeConfirmationEmail } from '@/lib/email'
import type { ProgramId } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { getPartnerCommissionPercent, normalizeAcquisitionPath } from '@/lib/partner-program'

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
  await supabase.from('profiles').update({
    subscription_status: 'active',
    assigned_program: program,
    acquisition_path: acquisitionPath,
    assigned_partner_affiliate_id: assignedPartnerAffiliateId,
    current_stage: PROGRAM_STAGES[program],
    progress_percentage: 0,
    account_state: 'active_member',
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
          acquisition_path: acquisitionPath,
          assigned_partner_affiliate_id: assignedPartnerAffiliateId,
          revenue_component: 'setup_fee',
          partner_commission_eligible: acquisitionPath === 'partner_assisted' && !!assignedPartnerAffiliateId,
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
        .select('user_id, id, acquisition_path, assigned_partner_affiliate_id, program')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (sub) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, business_name, assigned_program, email, acquisition_path, assigned_partner_affiliate_id')
          .eq('id', sub.user_id)
          .maybeSingle()

        const amountPaid = (invoice.amount_paid || 0) / 100
        const program = (profile?.assigned_program || sub.program) as ProgramId | null
        const acquisitionPath = normalizeAcquisitionPath(profile?.acquisition_path || sub.acquisition_path)
        const assignedPartnerAffiliateId = profile?.assigned_partner_affiliate_id || sub.assigned_partner_affiliate_id || null
        if (amountPaid > 0) {
          const paymentDate = new Date().toISOString().split('T')[0]
          if (program) {
            const { setupFeeCents, recurringCents } = getInvoiceComponentAmounts(invoice, program)
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

            if (recurringCents > 0 || paymentRecords.length === 0) {
              const recurringAmount = recurringCents > 0 ? recurringCents / 100 : amountPaid
              paymentRecords.push({
                user_id: sub.user_id,
                subscription_id: sub.id,
                amount: recurringAmount,
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

            await supabase.from('payment_records').insert(paymentRecords)
          }

          // Send charge confirmation email — pull recent agent actions as deliverables
          const toEmail = profile?.email || (invoice.customer_email as string | null) || null
          if (toEmail) {
            const { data: recentActions } = await supabase
              .from('agent_actions')
              .select('title, description')
              .eq('user_id', sub.user_id)
              .eq('visible_to_user', true)
              .order('created_at', { ascending: false })
              .limit(5)

            const programLabel = PROGRAM_NAMES[profile?.assigned_program as ProgramId] ?? profile?.assigned_program ?? 'Membership'
            sendChargeConfirmationEmail({
              toEmail,
              toName: profile?.full_name || profile?.business_name || 'Member',
              amountPaid,
              programLabel,
              invoiceId: invoice.id,
              billingDate: new Date().toISOString(),
              deliverables: recentActions?.map(a => ({ title: a.title, description: a.description ?? undefined })) ?? [],
            }).catch(err => console.error('[ChargeConfirmation] Email error:', err))
          }

          // Admin notification for successful payment
          const clientName = profile?.full_name || profile?.business_name || 'Client'
          const programLabel2 = PROGRAM_NAMES[profile?.assigned_program as ProgramId] ?? profile?.assigned_program ?? 'Membership'
          logPortalEvent({
            userId: sub.user_id,
            eventType: 'payment_succeeded',
            category: 'billing',
            severity: 'success',
            title: `Payment received — ${clientName}`,
            message: `$${amountPaid.toFixed(2)} for ${programLabel2}`,
            metadata: {
              amount: amountPaid,
              program: profile?.assigned_program,
              invoice_id: invoice.id,
              customer_id: customerId,
            },
          })
        }
      }

      // Partner commission creation for collected revenue
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
          const partnerAffiliateId =
            liveSub?.assigned_partner_affiliate_id ||
            referral?.affiliate_id ||
            null
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

            if (referral?.id) {
              await supabase.from('affiliate_referrals').update({
                referral_status: 'active',
                subscription_active: true,
                last_payment_at: new Date().toISOString(),
                onboarding_status: 'active',
              }).eq('id', referral.id)
            }

            if (liveSub?.user_id) {
              try {
                await supabase.from('affiliate_leads')
                  .update({
                    status: 'active',
                    converted_at: new Date().toISOString(),
                    onboarding_status: 'active',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('affiliate_id', partnerAffiliateId)
                  .eq('user_id', liveSub.user_id)
                  .in('status', ['account_created', 'invite_sent', 'lead_created'])
              } catch (e) { console.error('Lead status update error:', e) }
            }
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
