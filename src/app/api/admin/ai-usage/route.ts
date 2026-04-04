import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return null
  return { user, supabase }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') ?? 'overview'
  const userId = searchParams.get('user_id')

  // ── View: overview — program-level usage stats ──
  if (view === 'overview') {
    const [
      { data: programStats },
      { data: blockedAttempts },
      { data: topUsers },
    ] = await Promise.all([
      // Credits used per program
      ctx.supabase
        .from('user_ai_usage_events')
        .select('program, credits_charged, estimated_cost_usd, request_status')
        .eq('request_status', 'success'),

      // Recent blocked attempts
      ctx.supabase
        .from('user_ai_usage_events')
        .select('id, user_id, program, action_type, metadata_json, created_at')
        .eq('request_status', 'blocked')
        .order('created_at', { ascending: false })
        .limit(20),

      // Top users by credits used (this month)
      ctx.supabase
        .from('user_ai_balances')
        .select('user_id, program, credits_used, credits_remaining, credits_allocated')
        .order('credits_used', { ascending: false })
        .limit(20),
    ])

    // Aggregate program stats
    const byProgram: Record<string, { total_credits: number; total_cost_usd: number; request_count: number }> = {}
    for (const row of programStats ?? []) {
      if (!row.program) continue
      if (!byProgram[row.program]) byProgram[row.program] = { total_credits: 0, total_cost_usd: 0, request_count: 0 }
      byProgram[row.program].total_credits += row.credits_charged ?? 0
      byProgram[row.program].total_cost_usd += parseFloat(row.estimated_cost_usd ?? 0)
      byProgram[row.program].request_count += 1
    }

    // Enrich top users with names
    const userIds = Array.from(new Set((topUsers ?? []).map((u) => u.user_id)))
    let profileMap: Record<string, { full_name: string; email: string }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await ctx.supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      for (const p of profiles ?? []) profileMap[p.id] = { full_name: p.full_name, email: p.email }
    }

    const enrichedTopUsers = (topUsers ?? []).map((u) => ({
      ...u,
      full_name: profileMap[u.user_id]?.full_name ?? 'Unknown',
      email: profileMap[u.user_id]?.email ?? '',
    }))

    return NextResponse.json({
      by_program: byProgram,
      blocked_attempts: blockedAttempts ?? [],
      top_users: enrichedTopUsers,
    })
  }

  // ── View: user — specific user's usage ──
  if (view === 'user' && userId) {
    const now = new Date()

    const [
      { data: events },
      { data: balances },
      { data: adjustments },
      { data: profile },
    ] = await Promise.all([
      ctx.supabase
        .from('user_ai_usage_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      ctx.supabase
        .from('user_ai_balances')
        .select('*')
        .eq('user_id', userId)
        .order('billing_period_start', { ascending: false })
        .limit(6),
      ctx.supabase
        .from('ai_credit_adjustments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      ctx.supabase
        .from('profiles')
        .select('full_name, email, assigned_program, ai_suspended, ai_custom_monthly_credits, ai_custom_daily_cap, ai_custom_heavy_limit, ai_access_notes')
        .eq('id', userId)
        .single(),
    ])

    // Current balance
    const currentBalance = (balances ?? []).find((b) => {
      const start = new Date(b.billing_period_start)
      const end = new Date(b.billing_period_end)
      return start <= now && now <= end
    })

    return NextResponse.json({
      profile,
      events: events ?? [],
      balances: balances ?? [],
      current_balance: currentBalance ?? null,
      adjustments: adjustments ?? [],
    })
  }

  // ── View: recent — latest 50 events across all users ──
  if (view === 'recent') {
    const { data: events } = await ctx.supabase
      .from('user_ai_usage_events')
      .select('id, user_id, program, action_type, credits_charged, estimated_cost_usd, request_status, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    const userIds = Array.from(new Set((events ?? []).map((e) => e.user_id)))
    let profileMap: Record<string, { full_name: string; email: string }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await ctx.supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      for (const p of profiles ?? []) profileMap[p.id] = { full_name: p.full_name, email: p.email }
    }

    const enriched = (events ?? []).map((e) => ({
      ...e,
      full_name: profileMap[e.user_id]?.full_name ?? 'Unknown',
      email: profileMap[e.user_id]?.email ?? '',
    }))

    return NextResponse.json({ events: enriched })
  }

  return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
}
