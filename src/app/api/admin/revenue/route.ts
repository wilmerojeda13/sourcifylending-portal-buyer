import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [
      { data: payments },
      { data: subscriptions },
      { data: arrangements },
      { data: goals },
      { data: profiles },
    ] = await Promise.all([
      supabase.from('payment_records')
        .select('*')
        .order('payment_date', { ascending: false }),
      supabase.from('subscriptions')
        .select('user_id, setup_fee_standard, setup_fee_paid, monthly_fee_standard, billing_status, access_status')
        .eq('access_status', 'active'),
      supabase.from('payment_arrangements')
        .select('user_id, setup_fee_total, setup_fee_paid, setup_fee_remaining, next_amount_due, next_due_date, is_active')
        .eq('is_active', true),
      supabase.from('revenue_goals')
        .select('*')
        .order('period_start', { ascending: false })
        .limit(4),
      supabase.from('profiles')
        .select('id, full_name, email, business_name, assigned_program'),
    ])

    const allPayments = payments ?? []
    const allSubscriptions = subscriptions ?? []
    const allArrangements = arrangements ?? []

    // Build profile lookup by user id
    const profileMap = new Map<string, Record<string, unknown>>()
    for (const p of (profiles ?? [])) {
      profileMap.set(p.id as string, p as Record<string, unknown>)
    }

    const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM

    const isCollected = (p: Record<string, unknown>) =>
      p.payment_status === 'paid' || p.payment_status == null

    const setupTypes = new Set(['setup_fee', 'partial_setup', 'balance_payment', 'partial_deposit'])

    // ── Metrics ────────────────────────────────────────────────────────────────
    const totalCollected = allPayments
      .filter(isCollected)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const thisMonth = allPayments
      .filter((p) => isCollected(p) && typeof p.payment_date === 'string' && p.payment_date.startsWith(currentMonth))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const setupFeesCollected = allPayments
      .filter((p) => isCollected(p) && setupTypes.has(p.payment_type as string))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const recurringCollected = allPayments
      .filter((p) => isCollected(p) && (p.payment_type === 'recurring' || p.payment_type === 'monthly'))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const addOnCollected = allPayments
      .filter((p) => isCollected(p) && p.payment_type === 'add_on')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const arrangementOutstanding = allArrangements
      .reduce((sum, a) => sum + (Number(a.setup_fee_remaining) || 0), 0)

    const pendingPayments = allPayments
      .filter((p) => p.payment_status === 'pending')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const outstandingBalance = arrangementOutstanding + pendingPayments

    const mrr = allSubscriptions
      .filter((s) => s.access_status === 'active' && Number(s.monthly_fee_standard) > 0)
      .reduce((sum, s) => sum + (Number(s.monthly_fee_standard) || 0), 0)

    const paidUserIds = new Set(
      allPayments.filter(isCollected).map((p) => p.user_id as string)
    )
    const activePayingClients = paidUserIds.size

    // ── By Client ──────────────────────────────────────────────────────────────
    const clientMap = new Map<string, {
      userId: string
      fullName: string
      email: string
      businessName: string | null
      program: string | null
      totalPaid: number
      setupPaid: number
      recurringPaid: number
      lastPaymentDate: string | null
    }>()

    for (const p of allPayments) {
      const uid = p.user_id as string
      if (!uid) continue
      const profile = profileMap.get(uid) ?? null
      if (!clientMap.has(uid)) {
        clientMap.set(uid, {
          userId: uid,
          fullName: (profile?.full_name as string) || 'Unknown',
          email: (profile?.email as string) || '',
          businessName: (profile?.business_name as string) || null,
          program: (profile?.assigned_program as string) || null,
          totalPaid: 0,
          setupPaid: 0,
          recurringPaid: 0,
          lastPaymentDate: null,
        })
      }
      const entry = clientMap.get(uid)!
      if (isCollected(p)) {
        const amt = Number(p.amount) || 0
        entry.totalPaid += amt
        if (setupTypes.has(p.payment_type as string)) entry.setupPaid += amt
        if (p.payment_type === 'recurring' || p.payment_type === 'monthly') entry.recurringPaid += amt
        if (!entry.lastPaymentDate || (p.payment_date as string) > entry.lastPaymentDate) {
          entry.lastPaymentDate = p.payment_date as string
        }
      }
    }

    // Build arrangement lookup by user_id
    const arrangementByUser = new Map<string, Record<string, unknown>>()
    for (const a of allArrangements) {
      arrangementByUser.set(a.user_id as string, a as Record<string, unknown>)
    }

    // Build subscription lookup by user_id
    const subByUser = new Map<string, Record<string, unknown>>()
    for (const s of allSubscriptions) {
      subByUser.set(s.user_id as string, s as Record<string, unknown>)
    }

    const byClient = Array.from(clientMap.values()).map((c) => {
      const arrangement = arrangementByUser.get(c.userId)
      const sub = subByUser.get(c.userId)
      return {
        ...c,
        outstandingBalance: Number(arrangement?.setup_fee_remaining) || 0,
        nextPaymentDue: (arrangement?.next_due_date as string) || null,
        billingStatus: (sub?.billing_status as string) || null,
      }
    })

    // ── By Program ─────────────────────────────────────────────────────────────
    const programMap = new Map<string, { totalCollected: number; clientIds: Set<string> }>()

    for (const p of allPayments) {
      if (!isCollected(p)) continue
      const profile = profileMap.get(p.user_id as string) ?? null
      const prog = (profile?.assigned_program as string) || 'none'
      if (!programMap.has(prog)) {
        programMap.set(prog, { totalCollected: 0, clientIds: new Set() })
      }
      const entry = programMap.get(prog)!
      entry.totalCollected += Number(p.amount) || 0
      if (p.user_id) entry.clientIds.add(p.user_id as string)
    }

    const byProgram = Array.from(programMap.entries()).map(([program, data]) => ({
      program: program === 'none' ? null : program,
      totalCollected: data.totalCollected,
      clientCount: data.clientIds.size,
    }))

    // ── Recent Activity ────────────────────────────────────────────────────────
    const recentActivity = allPayments.slice(0, 20).map((p) => {
      const profile = profileMap.get(p.user_id as string) ?? null
      const clientName = (profile?.full_name as string)
        || (profile?.business_name as string)
        || 'Unknown Client'
      const amt = Number(p.amount) || 0
      const formattedAmt = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(Math.abs(amt))
      return {
        id: p.id as string,
        description: `${clientName} paid ${formattedAmt} (${p.payment_type || 'other'})`,
        amount: amt,
        date: p.payment_date as string,
        status: (p.payment_status as string) || 'paid',
        paymentSource: (p.payment_source as string) || null,
      }
    })

    return NextResponse.json({
      metrics: {
        totalCollected,
        thisMonth,
        setupFeesCollected,
        recurringCollected,
        addOnCollected,
        outstandingBalance,
        mrr,
        activePayingClients,
      },
      byClient,
      byProgram,
      recentActivity,
      goals: goals ?? [],
    })
  } catch (error) {
    console.error('[Revenue API] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { period_type, period_start, period_end, revenue_goal } = await req.json()

    if (!period_type || !period_start || !revenue_goal) {
      return NextResponse.json({ error: 'period_type, period_start, and revenue_goal are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('revenue_goals')
      .insert({
        period_type,
        period_start,
        period_end: period_end || null,
        revenue_goal: Number(revenue_goal),
        created_by: user.email,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, goal: data })
  } catch (error) {
    console.error('[Revenue API] POST Error:', error)
    return NextResponse.json({ error: 'Failed to create revenue goal' }, { status: 500 })
  }
}
