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

// POST — apply a credit adjustment to a user
// body: { user_id, adjustment_type, credits_delta, reason }
// adjustment_type: 'bonus' | 'deduction' | 'reset' | 'admin_override'
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { user_id, adjustment_type, credits_delta, reason } = body

  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  if (!adjustment_type) return NextResponse.json({ error: 'adjustment_type required' }, { status: 400 })

  const now = new Date()

  // Log adjustment
  await ctx.supabase.from('ai_credit_adjustments').insert({
    user_id,
    admin_id: ctx.user.id,
    adjustment_type,
    credits_delta: credits_delta ?? 0,
    reason: reason ?? null,
  })

  // Handle 'reset' — set credits_remaining back to allocated
  if (adjustment_type === 'reset') {
    const { data: balance } = await ctx.supabase
      .from('user_ai_balances')
      .select('*')
      .eq('user_id', user_id)
      .lte('billing_period_start', now.toISOString())
      .gte('billing_period_end', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (balance) {
      await ctx.supabase
        .from('user_ai_balances')
        .update({
          credits_used: 0,
          credits_remaining: balance.credits_allocated,
          daily_credits_used: 0,
          heavy_actions_used_today: 0,
          last_daily_reset: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', balance.id)
    }
    return NextResponse.json({ success: true, message: 'Credits reset to full allocation' })
  }

  // Handle 'bonus' or 'deduction' — apply delta to current balance
  if (adjustment_type === 'bonus' || adjustment_type === 'deduction' || adjustment_type === 'admin_override') {
    const delta = adjustment_type === 'deduction' ? -(Math.abs(credits_delta ?? 0)) : (credits_delta ?? 0)

    const { data: balance } = await ctx.supabase
      .from('user_ai_balances')
      .select('*')
      .eq('user_id', user_id)
      .lte('billing_period_start', now.toISOString())
      .gte('billing_period_end', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (balance) {
      const newRemaining = Math.max(0, balance.credits_remaining + delta)
      const newUsed = adjustment_type === 'deduction'
        ? Math.min(balance.credits_allocated, balance.credits_used + Math.abs(delta))
        : Math.max(0, balance.credits_used - delta)

      await ctx.supabase
        .from('user_ai_balances')
        .update({
          credits_remaining: newRemaining,
          credits_used: newUsed,
          updated_at: now.toISOString(),
        })
        .eq('id', balance.id)

      return NextResponse.json({
        success: true,
        message: `Credits ${adjustment_type === 'deduction' ? 'deducted' : 'added'}`,
        new_remaining: newRemaining,
      })
    } else {
      return NextResponse.json({ error: 'No active billing period found for user' }, { status: 404 })
    }
  }

  return NextResponse.json({ success: true })
}

// GET — list adjustments for a user
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('user_id')

  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const { data, error } = await ctx.supabase
    .from('ai_credit_adjustments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ adjustments: data ?? [] })
}

// PATCH — update per-user AI overrides (suspend, custom limits)
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    user_id,
    ai_suspended,
    ai_custom_monthly_credits,
    ai_custom_daily_cap,
    ai_custom_heavy_limit,
    ai_access_notes,
  } = body

  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (ai_suspended !== undefined) updates.ai_suspended = ai_suspended
  if (ai_custom_monthly_credits !== undefined) updates.ai_custom_monthly_credits = ai_custom_monthly_credits
  if (ai_custom_daily_cap !== undefined) updates.ai_custom_daily_cap = ai_custom_daily_cap
  if (ai_custom_heavy_limit !== undefined) updates.ai_custom_heavy_limit = ai_custom_heavy_limit
  if (ai_access_notes !== undefined) updates.ai_access_notes = ai_access_notes

  const { data, error } = await ctx.supabase
    .from('profiles')
    .update(updates)
    .eq('id', user_id)
    .select('id, full_name, ai_suspended, ai_custom_monthly_credits, ai_custom_daily_cap, ai_custom_heavy_limit, ai_access_notes')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
