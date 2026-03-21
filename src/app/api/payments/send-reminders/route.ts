import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendPaymentReminderEmail, type PaymentReminderType } from '@/lib/email'

const PROGRAM_LABELS: Record<string, string> = {
  program_a: 'Program A — 0% Intro APR Card Strategy',
  program_b: 'Program B — Business Credit Builder',
  program_c: 'Program C — Capital Monitoring Membership',
}

// ─── POST /api/payments/send-reminders ────────────────────────────────────────
// Admin-only job: scans all active users for payment alerts, creates portal
// notifications, and sends reminder emails (with per-period deduplication).
//
// Call from admin panel or cron. Optional body: { force: true } to resend
// even if an email was already sent in the current period.

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()

    // Admin check
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const force = body?.force === true

    const now = new Date()
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` // YYYY-MM
    const weekKey   = `${now.getFullYear()}-W${String(Math.ceil(now.getDate() / 7)).padStart(2, '0')}`

    let sent = 0, skipped = 0, errors = 0

    // ── 1. Balance due: setup fee not fully paid ────────────────────────────
    const { data: arrangements } = await supabase
      .from('payment_arrangements')
      .select(`
        id, user_id, program_code, setup_fee_total, setup_fee_paid,
        next_amount_due, next_due_date, recurring_amount, notes,
        profiles:profiles!payment_arrangements_user_id_fkey(full_name, email)
      `)
      .eq('is_active', true)

    for (const arr of arrangements ?? []) {
      const profile = Array.isArray(arr.profiles) ? arr.profiles[0] : arr.profiles
      if (!profile?.email) continue

      const total   = Number(arr.setup_fee_total ?? 0)
      const paid    = Number(arr.setup_fee_paid  ?? 0)
      const balance = total - paid

      // ── Balance due ──
      if (balance > 1) {
        const alertKey = `${arr.user_id}_balance_due_${periodKey}`
        const result = await processAlert({
          supabase, force, alertKey,
          userId: arr.user_id,
          reminderType: 'balance_due',
          amountDue: Number(arr.next_amount_due ?? balance),
          balanceRemaining: balance,
          dueDate: arr.next_due_date ?? undefined,
          programCode: arr.program_code,
          toEmail: profile.email,
          toName: profile.full_name ?? 'Client',
          notes: arr.notes ?? undefined,
          notifTitle: `Balance Due: $${Math.round(balance).toLocaleString()}`,
          notifMessage: `You have a remaining setup fee balance of $${Math.round(balance).toLocaleString()}${arr.next_due_date ? ` due on ${fmtDate(arr.next_due_date)}` : ''}.`,
        })
        result === 'sent' ? sent++ : result === 'skipped' ? skipped++ : errors++
      }

      // ── Arrangement due: next payment within 14 days (balance paid) ──
      if (balance <= 1 && arr.next_due_date && arr.next_amount_due) {
        const daysUntil = daysUntilDate(arr.next_due_date)
        if (daysUntil !== null && daysUntil <= 14 && daysUntil >= 0) {
          const alertKey = `${arr.user_id}_arrangement_due_${arr.next_due_date}`
          const result = await processAlert({
            supabase, force, alertKey,
            userId: arr.user_id,
            reminderType: 'arrangement_due',
            amountDue: Number(arr.next_amount_due),
            dueDate: arr.next_due_date,
            programCode: arr.program_code,
            toEmail: profile.email,
            toName: profile.full_name ?? 'Client',
            notes: arr.notes ?? undefined,
            notifTitle: dayLabel('Payment Due', daysUntil),
            notifMessage: `Your next scheduled payment of $${Number(arr.next_amount_due).toLocaleString()} is due on ${fmtDate(arr.next_due_date)}.`,
          })
          result === 'sent' ? sent++ : result === 'skipped' ? skipped++ : errors++
        }
      }
    }

    // ── 2. Past due subscriptions ────────────────────────────────────────────
    const { data: pastDueSubs } = await supabase
      .from('subscriptions')
      .select(`
        user_id, program, monthly_fee_standard,
        profiles:profiles!subscriptions_user_id_fkey(full_name, email)
      `)
      .eq('status', 'past_due')

    for (const sub of pastDueSubs ?? []) {
      const profile = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles
      if (!profile?.email) continue

      const alertKey = `${sub.user_id}_past_due_${weekKey}`
      const result = await processAlert({
        supabase, force, alertKey,
        userId: sub.user_id,
        reminderType: 'past_due',
        amountDue: sub.monthly_fee_standard ?? undefined,
        programCode: sub.program ?? undefined,
        toEmail: profile.email,
        toName: profile.full_name ?? 'Client',
        notifTitle: 'Payment Past Due',
        notifMessage: 'Your subscription payment is past due. Please update your payment method to avoid service interruption.',
      })
      result === 'sent' ? sent++ : result === 'skipped' ? skipped++ : errors++
    }

    // ── 3. Subscription renewal within 7 days ───────────────────────────────
    const renewalCutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: renewingSubs } = await supabase
      .from('subscriptions')
      .select(`
        user_id, program, monthly_fee_standard, current_period_end,
        profiles:profiles!subscriptions_user_id_fkey(full_name, email)
      `)
      .eq('status', 'active')
      .lte('current_period_end', renewalCutoff)
      .gte('current_period_end', now.toISOString())

    for (const sub of renewingSubs ?? []) {
      const profile = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles
      if (!profile?.email || !sub.current_period_end) continue

      const daysUntil = daysUntilDate(sub.current_period_end)
      if (daysUntil === null || daysUntil < 0) continue

      // Key by renewal date — one email per renewal date
      const renewalDateKey = sub.current_period_end.split('T')[0]
      const alertKey = `${sub.user_id}_renewal_${renewalDateKey}`

      const result = await processAlert({
        supabase, force, alertKey,
        userId: sub.user_id,
        reminderType: 'renewal_upcoming',
        amountDue: sub.monthly_fee_standard ?? undefined,
        recurringAmount: sub.monthly_fee_standard ?? undefined,
        dueDate: sub.current_period_end,
        programCode: sub.program ?? undefined,
        toEmail: profile.email,
        toName: profile.full_name ?? 'Client',
        notifTitle: dayLabel('Membership Renews', daysUntil),
        notifMessage: `Your membership renews on ${fmtDate(sub.current_period_end)}${sub.monthly_fee_standard ? ` for $${Number(sub.monthly_fee_standard).toLocaleString()}/month` : ''}. Your card on file will be charged automatically.`,
      })
      result === 'sent' ? sent++ : result === 'skipped' ? skipped++ : errors++
    }

    return NextResponse.json({ success: true, sent, skipped, errors })
  } catch (err) {
    console.error('[/api/payments/send-reminders]', err)
    return NextResponse.json({ error: 'Failed to run reminders job' }, { status: 500 })
  }
}

// ─── Core: process one alert (dedup + email + notification) ──────────────────
async function processAlert({
  supabase, force, alertKey, userId, reminderType,
  amountDue, balanceRemaining, recurringAmount, dueDate,
  programCode, toEmail, toName, notes,
  notifTitle, notifMessage,
}: {
  supabase: Awaited<ReturnType<typeof createServiceClient>>
  force: boolean
  alertKey: string
  userId: string
  reminderType: PaymentReminderType
  amountDue?: number
  balanceRemaining?: number
  recurringAmount?: number
  dueDate?: string
  programCode?: string
  toEmail: string
  toName: string
  notes?: string
  notifTitle: string
  notifMessage: string
}): Promise<'sent' | 'skipped' | 'error'> {
  try {
    // Check dedup: upsert the reminder record
    const { data: existing } = await supabase
      .from('payment_reminders')
      .select('id, email_sent_at')
      .eq('alert_key', alertKey)
      .maybeSingle()

    // Skip if already emailed this period (unless force)
    if (!force && existing?.email_sent_at) return 'skipped'

    const programLabel = programCode ? (PROGRAM_LABELS[programCode] ?? programCode) : undefined

    // Upsert reminder record
    const reminderPayload = {
      user_id: userId,
      reminder_type: reminderType,
      alert_key: alertKey,
      amount_due: amountDue ?? null,
      due_date: dueDate ? dueDate.split('T')[0] : null,
      details: { balance_remaining: balanceRemaining, recurring_amount: recurringAmount, program_code: programCode },
      portal_shown_at: new Date().toISOString(),
    }

    if (existing) {
      await supabase.from('payment_reminders').update(reminderPayload).eq('id', existing.id)
    } else {
      await supabase.from('payment_reminders').insert(reminderPayload)
    }

    // Send email
    const emailResult = await sendPaymentReminderEmail({
      toEmail, toName, reminderType,
      amountDue, balanceRemaining, recurringAmount, dueDate,
      programLabel, notes,
    })

    if (emailResult.success) {
      // Mark email sent
      await supabase
        .from('payment_reminders')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('alert_key', alertKey)
    }

    // Create portal notification (always, regardless of email result)
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'reminder',
      title: notifTitle,
      message: notifMessage,
      read: false,
      created_at: new Date().toISOString(),
    })

    return 'sent'
  } catch (err) {
    console.error('[processAlert] error for', alertKey, err)
    return 'error'
  }
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
