import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getPurchasedCreditsRemaining } from '@/lib/ai-usage'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const now = new Date()

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('assigned_program, ai_suspended, ai_custom_monthly_credits, ai_custom_daily_cap, ai_custom_heavy_limit, billing_status')
      .eq('id', user.id)
      .single()

    // Get current balance
    const { data: balance } = await supabase
      .from('user_ai_balances')
      .select('*')
      .eq('user_id', user.id)
      .lte('billing_period_start', now.toISOString())
      .gte('billing_period_end', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Get program limits
    const { data: programLimits } = await supabase
      .from('ai_program_limits')
      .select('*')
      .eq('program', profile?.assigned_program ?? '')
      .eq('is_active', true)
      .single()

    // Get recent usage events (last 10 for display)
    const { data: recentEvents } = await supabase
      .from('user_ai_usage_events')
      .select('id, action_type, credits_charged, request_status, credit_source, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Get purchased credit buckets (active only)
    const { data: purchasedBuckets } = await supabase
      .from('user_purchased_ai_credits')
      .select('id, credits_purchased, credits_used, credits_remaining, purchase_date, expires_at, source_type')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('purchase_date', { ascending: true })

    // Total purchased credits remaining
    const purchasedCreditsRemaining = (purchasedBuckets ?? []).reduce(
      (sum, b) => sum + (b.credits_remaining ?? 0),
      0
    )

    // Available credit packs (for buy-more CTA)
    const isActive =
      profile?.billing_status === 'active' ||
      profile?.billing_status === 'trialing'

    let creditPacks: unknown[] = []
    if (isActive) {
      const { data: packs } = await supabase
        .from('ai_credit_packs')
        .select('id, name, description, credits_amount, price_usd, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      creditPacks = packs ?? []
    }

    // Compute effective limits (custom overrides take precedence)
    const effectiveLimits = programLimits
      ? {
          monthly_credits: profile?.ai_custom_monthly_credits ?? programLimits.monthly_credits,
          daily_credit_cap: profile?.ai_custom_daily_cap ?? programLimits.daily_credit_cap,
          max_heavy_actions_per_day:
            profile?.ai_custom_heavy_limit ?? programLimits.max_heavy_actions_per_day,
          max_requests_per_hour: programLimits.max_requests_per_hour,
        }
      : null

    return NextResponse.json({
      profile: {
        assigned_program: profile?.assigned_program,
        ai_suspended: profile?.ai_suspended,
        subscription_status: profile?.billing_status,
      },
      balance,
      program_limits: programLimits,
      effective_limits: effectiveLimits,
      recent_events: recentEvents ?? [],
      purchased_credits_remaining: purchasedCreditsRemaining,
      purchased_buckets: purchasedBuckets ?? [],
      credit_packs: creditPacks,
    })
  } catch (err) {
    console.error('AI usage GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
