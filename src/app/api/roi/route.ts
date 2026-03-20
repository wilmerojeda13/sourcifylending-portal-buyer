import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()

    const [
      { data: payments },
      { data: approvals },
      { data: profile },
      { data: memberships },
    ] = await Promise.all([
      supabase
        .from('payment_records')
        .select('amount, payment_type, payment_status, payment_date, notes')
        .eq('user_id', user.id)
        .order('payment_date', { ascending: true }),
      supabase
        .from('funding_approvals')
        .select('*')
        .eq('user_id', user.id)
        .order('approval_date', { ascending: true }),
      supabase
        .from('profiles')
        .select('assigned_program, created_at')
        .eq('id', user.id)
        .single(),
      supabase
        .from('memberships')
        .select('program_code, status, activated_at')
        .eq('user_id', user.id)
        .eq('status', 'active'),
    ])

    const allPayments = payments ?? []
    const allApprovals = approvals ?? []
    const activePrograms = (memberships ?? []).map(m => m.program_code)

    // ── Investment calculations ───────────────────────────────────────────────
    const isPaid = (p: Record<string, unknown>) =>
      p.payment_status === 'paid' || p.payment_status == null

    const setupTypes = new Set(['setup_fee', 'partial_setup', 'balance_payment', 'partial_deposit'])
    const recurringTypes = new Set(['monthly', 'recurring'])
    const addonTypes = new Set(['add_on'])

    const paidRecords = allPayments.filter(isPaid)

    const setupPaid = paidRecords
      .filter(p => setupTypes.has(p.payment_type as string))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const recurringPaid = paidRecords
      .filter(p => recurringTypes.has(p.payment_type as string))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const addonPaid = paidRecords
      .filter(p => addonTypes.has(p.payment_type as string))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const totalInvested = setupPaid + recurringPaid + addonPaid

    // ── Approved value calculations ───────────────────────────────────────────
    // Credit-style outcomes use approved_limit as effective value
    const CREDIT_TYPES = new Set([
      '0% APR Card', 'Business Credit Card', 'Charge Card',
      'Vendor Account', 'Store Account', 'Fleet Account',
      'Net 30 Account', 'Business Trade Account', 'Line of Credit',
    ])

    const approvedOutcomes = allApprovals.filter(a => a.status === 'Approved')

    function effectiveValue(a: Record<string, unknown>): number {
      if (CREDIT_TYPES.has(a.approval_type as string)) {
        return Number(a.approved_limit) || Number(a.approved_amount) || 0
      }
      return Number(a.approved_amount) || Number(a.approved_limit) || 0
    }

    const totalApprovedValue = approvedOutcomes.reduce((sum, a) => sum + effectiveValue(a), 0)

    // ── ROI calculations ──────────────────────────────────────────────────────
    const netROI = totalApprovedValue - totalInvested
    const roiPercent = totalInvested > 0
      ? Math.round(((totalApprovedValue - totalInvested) / totalInvested) * 100)
      : null

    // ── By approval type breakdown ────────────────────────────────────────────
    const typeMap = new Map<string, { count: number; value: number }>()
    for (const a of approvedOutcomes) {
      const t = (a.approval_type as string) || 'Other'
      const existing = typeMap.get(t) ?? { count: 0, value: 0 }
      typeMap.set(t, {
        count: existing.count + 1,
        value: existing.value + effectiveValue(a),
      })
    }
    const byApprovalType = Array.from(typeMap.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      value: data.value,
    })).sort((a, b) => b.value - a.value)

    // ── By program breakdown ─────────────────────────────────────────────────
    const progMap = new Map<string, { count: number; value: number }>()
    for (const a of approvedOutcomes) {
      const prog = (a.program_type as string) || 'Unknown'
      const existing = progMap.get(prog) ?? { count: 0, value: 0 }
      progMap.set(prog, {
        count: existing.count + 1,
        value: existing.value + effectiveValue(a),
      })
    }
    const byProgram = Array.from(progMap.entries()).map(([program, data]) => ({
      program,
      count: data.count,
      value: data.value,
    }))

    // ── Highlights ───────────────────────────────────────────────────────────
    const mostRecentApproval = approvedOutcomes[approvedOutcomes.length - 1] ?? null
    const largestApproval = approvedOutcomes.reduce<Record<string, unknown> | null>(
      (max, a) => (!max || effectiveValue(a) > effectiveValue(max) ? a : max), null
    )

    // ── Combined timeline ─────────────────────────────────────────────────────
    type TimelineEvent = {
      date: string
      type: 'payment' | 'approval'
      label: string
      amount: number
      subLabel?: string
    }

    const timeline: TimelineEvent[] = []

    for (const p of paidRecords) {
      const typeLabel = setupTypes.has(p.payment_type as string)
        ? 'Setup Fee Payment'
        : recurringTypes.has(p.payment_type as string)
          ? 'Monthly Advisory Fee'
          : addonTypes.has(p.payment_type as string)
            ? 'Add-On Fee'
            : 'Payment'
      timeline.push({
        date: p.payment_date as string,
        type: 'payment',
        label: typeLabel,
        amount: Number(p.amount) || 0,
      })
    }

    for (const a of approvedOutcomes) {
      const val = effectiveValue(a)
      if (val > 0) {
        timeline.push({
          date: a.approval_date as string,
          type: 'approval',
          label: `${a.issuer_name}${a.account_name ? ` — ${a.account_name}` : ''}`,
          amount: val,
          subLabel: a.approval_type as string,
        })
      }
    }

    timeline.sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      totalInvested,
      totalApprovedValue,
      netROI,
      roiPercent,
      setupPaid,
      recurringPaid,
      addonPaid,
      totalPayments: paidRecords.length,
      totalApprovals: approvedOutcomes.length,
      byApprovalType,
      byProgram,
      mostRecentApproval,
      largestApproval,
      timeline,
      activePrograms,
      enrolledSince: profile?.created_at ?? null,
    })
  } catch (err) {
    console.error('[ROI API]', err)
    return NextResponse.json({ error: 'Failed to load ROI data' }, { status: 500 })
  }
}
