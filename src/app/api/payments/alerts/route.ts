import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── GET /api/payments/alerts ─────────────────────────────────────────────────
// Returns computed payment alerts for the logged-in user.
// Reads from payment_arrangements + subscriptions — no extra table needed.

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [
      { data: arrangement },
      { data: subscription },
    ] = await Promise.all([
      authClient
        .from('payment_arrangements')
        .select('setup_fee_total, setup_fee_paid, recurring_amount, next_amount_due, next_due_date, notes, program_code')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
      authClient
        .from('subscriptions')
        .select('status, current_period_end, setup_fee_standard, setup_fee_paid, monthly_fee_standard, billing_status, program')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    const alerts: PaymentAlert[] = []

    // 1. Past due — highest urgency
    if (subscription?.status === 'past_due') {
      alerts.push({
        type: 'past_due',
        urgency: 'critical',
        title: 'Payment Past Due',
        message: 'Your subscription payment is overdue. Please update your payment method to avoid service interruption.',
        amountDue: subscription.monthly_fee_standard ?? undefined,
      })
    }

    // 2. Setup fee balance remaining from payment arrangement
    if (arrangement) {
      const total = Number(arrangement.setup_fee_total ?? 0)
      const paid  = Number(arrangement.setup_fee_paid  ?? 0)
      const balance = total - paid

      if (balance > 1) {  // >$1 to avoid floating point noise
        alerts.push({
          type: 'balance_due',
          urgency: 'warning',
          title: `Balance Due: $${Math.round(balance).toLocaleString()}`,
          message: `You have a remaining setup fee balance of $${Math.round(balance).toLocaleString()}${
            arrangement.next_due_date ? ` due on ${fmtDate(arrangement.next_due_date)}` : ''
          }. Please ensure payment is made to keep your account in good standing.`,
          amountDue: Number(arrangement.next_amount_due ?? balance),
          balanceRemaining: balance,
          dueDate: arrangement.next_due_date ?? undefined,
          notes: arrangement.notes ?? undefined,
        })
      } else if (arrangement.next_due_date && arrangement.next_amount_due) {
        // Balance is paid — check for next recurring arrangement payment
        const daysUntil = daysUntilDate(arrangement.next_due_date)
        if (daysUntil !== null && daysUntil <= 14 && daysUntil >= 0) {
          alerts.push({
            type: 'arrangement_due',
            urgency: daysUntil <= 3 ? 'warning' : 'info',
            title: dayLabel('Payment Due', daysUntil),
            message: `Your next scheduled payment of $${Number(arrangement.next_amount_due).toLocaleString()} is due on ${fmtDate(arrangement.next_due_date)}.`,
            amountDue: Number(arrangement.next_amount_due),
            dueDate: arrangement.next_due_date,
            daysUntilDue: daysUntil,
            notes: arrangement.notes ?? undefined,
          })
        }
      }
    }

    // 3. Stripe subscription renewal coming up (skip if already past_due)
    if (subscription?.current_period_end && subscription.status !== 'past_due') {
      const daysUntil = daysUntilDate(subscription.current_period_end)
      if (daysUntil !== null && daysUntil <= 7 && daysUntil >= 0) {
        alerts.push({
          type: 'renewal_upcoming',
          urgency: 'info',
          title: dayLabel('Subscription Renews', daysUntil),
          message: `Your membership renews on ${fmtDate(subscription.current_period_end)}${
            subscription.monthly_fee_standard ? ` for $${Number(subscription.monthly_fee_standard).toLocaleString()}/month` : ''
          }. Your card on file will be charged automatically.`,
          amountDue: subscription.monthly_fee_standard ?? undefined,
          dueDate: subscription.current_period_end,
          daysUntilDue: daysUntil,
        })
      }
    }

    return NextResponse.json({ alerts })
  } catch (err) {
    console.error('[/api/payments/alerts]', err)
    return NextResponse.json({ alerts: [] })
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PaymentAlert {
  type: 'balance_due' | 'arrangement_due' | 'renewal_upcoming' | 'past_due'
  urgency: 'critical' | 'warning' | 'info'
  title: string
  message: string
  amountDue?: number
  balanceRemaining?: number
  dueDate?: string
  daysUntilDue?: number
  notes?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function daysUntilDate(iso: string): number | null {
  try {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  } catch {
    return null
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function dayLabel(prefix: string, days: number): string {
  if (days <= 0) return `${prefix} Today`
  if (days === 1) return `${prefix} Tomorrow`
  return `${prefix} in ${days} Days`
}
