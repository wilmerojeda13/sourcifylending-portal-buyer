import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logBillingEvent } from '@/lib/billing-events'
import { logPortalEvent } from '@/lib/portal-events'

export async function POST(req: NextRequest) {
  // Verify admin access (add your auth check here)
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  try {
    // Find active subscriptions without payment records in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: activeSubs, error: subsError } = await supabase
      .from('subscriptions')
      .select('user_id, program, setup_fee_amount_cents, recurring_amount_cents, created_at')
      .eq('status', 'active')
      .gt('created_at', oneDayAgo)

    if (subsError) {
      return NextResponse.json({ error: 'Failed to query subscriptions', details: subsError }, { status: 500 })
    }

    if (!activeSubs || activeSubs.length === 0) {
      return NextResponse.json({ reconciled: 0, message: 'No new subscriptions to reconcile' })
    }

    let reconciledCount = 0
    let skippedCount = 0

    for (const sub of activeSubs) {
      try {
        // Check if payment records exist for this subscription
        const { data: payments, error: paymentError } = await supabase
          .from('payment_records')
          .select('id')
          .eq('user_id', sub.user_id)
          .gt('created_at', oneDayAgo)
          .limit(1)

        if (paymentError) {
          console.error(`[Reconciliation] Error querying payments for user ${sub.user_id}:`, paymentError)
          skippedCount++
          continue
        }

        // If payment records exist, skip
        if (payments && payments.length > 0) {
          skippedCount++
          continue
        }

        // No payment records found — create one for the subscription
        const setupAmount = (sub.setup_fee_amount_cents ?? 0) / 100
        const recurringAmount = (sub.recurring_amount_cents ?? 0) / 100
        const totalAmount = setupAmount + recurringAmount

        if (totalAmount <= 0) {
          skippedCount++
          continue
        }

        const paymentDate = new Date(sub.created_at).toISOString().split('T')[0]

        const { error: insertError } = await supabase.from('payment_records').insert({
          user_id: sub.user_id,
          amount: totalAmount,
          payment_date: paymentDate,
          payment_source: 'stripe_webhook', // Original source
          payment_type: setupAmount > 0 ? 'setup_fee' : 'recurring',
          payment_status: 'paid',
          logged_by: 'reconciliation_job',
          notes: `Reconciled payment for subscription created ${sub.created_at}`,
        })

        if (insertError) {
          console.error(`[Reconciliation] Failed to insert payment for user ${sub.user_id}:`, insertError)
          skippedCount++
          continue
        }

        // Log billing event
        await logBillingEvent(supabase, sub.user_id, 'payment_logged', {
          amount: totalAmount,
          payment_type: setupAmount > 0 ? 'setup_fee' : 'recurring',
          source: 'reconciliation',
        })

        console.log(`[Reconciliation] Created payment record for user ${sub.user_id}: $${totalAmount}`)
        reconciledCount++
      } catch (err) {
        console.error(`[Reconciliation] Error processing subscription for user ${sub.user_id}:`, err)
        skippedCount++
      }
    }

    // Log admin alert if many subscriptions were missing payments
    if (reconciledCount > 5) {
      await logPortalEvent({
        eventType: 'billing_reconciliation_alert',
        category: 'billing',
        severity: 'warning',
        title: 'Bulk payment reconciliation completed',
        message: `${reconciledCount} missing payment records were created during reconciliation. Check webhook logs for potential failures.`,
        metadata: {
          reconciled_count: reconciledCount,
          skipped_count: skippedCount,
          total_processed: activeSubs.length,
        },
      })
    }

    return NextResponse.json({
      reconciled: reconciledCount,
      skipped: skippedCount,
      total: activeSubs.length,
      message: `Reconciliation complete: ${reconciledCount} payments created, ${skippedCount} skipped`,
    })
  } catch (err) {
    console.error('[Billing Reconciliation] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
