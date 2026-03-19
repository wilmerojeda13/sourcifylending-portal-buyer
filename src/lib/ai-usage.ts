/**
 * AI Usage Control System
 * Enforces program-level credit limits, daily caps, hourly rate limits,
 * and heavy action limits before any paid AI execution.
 *
 * Credit bucket priority (per business rules):
 *   1. Included monthly credits (reset monthly)
 *   2. Purchased extra credits (persist; do not reset monthly)
 *
 * When monthly credits are exhausted, usage falls back to purchased credits.
 * Purchased credits bypass daily/heavy caps (user paid for them) but still
 * respect the hourly rate limit as an anti-abuse guard.
 */
import { createServiceClient } from '@/lib/supabase/server'

// ─── Action Types ──────────────────────────────────────────────────────────────
export type AIActionType =
  | 'simple_chat'
  | 'guided_recommendation'
  | 'analyzer_interpretation'
  | 'dispute_letter_generation'
  | 'funding_strategy_response'
  | 'document_review'
  | 'file_analysis'
  | 'heavy_agent_workflow'
  | 'underwriting_or_multi_step_deep_analysis'

// ─── Credit source ─────────────────────────────────────────────────────────────
export type CreditSource = 'monthly' | 'purchased'

// ─── Result Types ──────────────────────────────────────────────────────────────
export type UsageCheckResult =
  | {
      allowed: true
      creditCost: number
      isHeavy: boolean
      balanceId: string
      program: string
      creditSource: CreditSource
      purchasedBucketId: string | null
    }
  | { allowed: false; message: string; reason: UsageBlockReason }

export type UsageBlockReason =
  | 'monthly_limit'
  | 'daily_limit'
  | 'heavy_limit'
  | 'hourly_limit'
  | 'no_program'
  | 'suspended'
  | 'no_balance'

// ─── Estimated cost per action (rough USD approximation for logging) ───────────
const ESTIMATED_USD: Record<AIActionType, number> = {
  simple_chat: 0.002,
  guided_recommendation: 0.004,
  analyzer_interpretation: 0.006,
  dispute_letter_generation: 0.006,
  funding_strategy_response: 0.008,
  document_review: 0.01,
  file_analysis: 0.01,
  heavy_agent_workflow: 0.016,
  underwriting_or_multi_step_deep_analysis: 0.02,
}

export function getEstimatedCostUsd(actionType: AIActionType): number {
  return ESTIMATED_USD[actionType] ?? 0.005
}

// ─── Month boundary helpers ────────────────────────────────────────────────────
function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}
function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

// ─── checkAIUsage ──────────────────────────────────────────────────────────────
/**
 * Server-side pre-flight check before running any AI action.
 * Does NOT deduct credits — call recordAIUsage after execution to commit.
 *
 * Priority:
 *   1. Use included monthly credits if available.
 *   2. Fall back to purchased extra credits if monthly is exhausted.
 *   3. Block if both are exhausted.
 *
 * Purchased credits bypass daily/heavy caps but still respect hourly rate limit.
 */
export async function checkAIUsage(
  userId: string,
  actionType: AIActionType
): Promise<UsageCheckResult> {
  try {
    const supabase = await createServiceClient()

    // ── 1. Load profile with program and overrides ──
    const { data: profile } = await supabase
      .from('profiles')
      .select(
        'assigned_program, ai_suspended, ai_custom_monthly_credits, ai_custom_daily_cap, ai_custom_heavy_limit, subscription_status'
      )
      .eq('id', userId)
      .single()

    if (!profile?.assigned_program) {
      return {
        allowed: false,
        message: 'No program assigned. Please complete your enrollment to use AI features.',
        reason: 'no_program',
      }
    }

    if (profile.ai_suspended) {
      return {
        allowed: false,
        message: 'Your AI access has been suspended. Please contact support.',
        reason: 'suspended',
      }
    }

    // ── 2. Load action cost ──
    const { data: actionCost } = await supabase
      .from('ai_action_costs')
      .select('credit_cost, is_heavy, is_active')
      .eq('action_type', actionType)
      .single()

    const creditCost = actionCost?.credit_cost ?? 1
    const isHeavy = actionCost?.is_heavy ?? false

    // ── 3. Load program limits ──
    const { data: limits } = await supabase
      .from('ai_program_limits')
      .select('*')
      .eq('program', profile.assigned_program)
      .eq('is_active', true)
      .single()

    if (!limits) {
      return {
        allowed: false,
        message: 'Program AI limits not configured. Please contact support.',
        reason: 'no_balance',
      }
    }

    // Apply per-user overrides if set
    const monthlyCredits = profile.ai_custom_monthly_credits ?? limits.monthly_credits
    const dailyCreditCap = profile.ai_custom_daily_cap ?? limits.daily_credit_cap
    const maxHeavyPerDay = profile.ai_custom_heavy_limit ?? limits.max_heavy_actions_per_day
    const maxRequestsPerHour = limits.max_requests_per_hour

    // ── 4. Get or create monthly balance for current billing period ──
    const now = new Date()
    const billingStart = getMonthStart(now)
    const billingEnd = getMonthEnd(now)

    let { data: balance } = await supabase
      .from('user_ai_balances')
      .select('*')
      .eq('user_id', userId)
      .lte('billing_period_start', now.toISOString())
      .gte('billing_period_end', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!balance) {
      const { data: newBalance, error: createErr } = await supabase
        .from('user_ai_balances')
        .insert({
          user_id: userId,
          program: profile.assigned_program,
          billing_period_start: billingStart.toISOString(),
          billing_period_end: billingEnd.toISOString(),
          credits_allocated: monthlyCredits,
          credits_used: 0,
          credits_remaining: monthlyCredits,
          daily_credits_used: 0,
          heavy_actions_used_today: 0,
          last_daily_reset: now.toISOString(),
        })
        .select()
        .single()

      if (createErr || !newBalance) {
        console.error('Failed to create AI balance:', createErr)
        return {
          allowed: false,
          message: 'Unable to initialize your usage data. Please try again.',
          reason: 'no_balance',
        }
      }
      balance = newBalance
    }

    // ── 5. Reset daily counters if it's a new day ──
    const lastReset = new Date(balance.last_daily_reset)
    const needsDailyReset = lastReset.toDateString() !== now.toDateString()

    let dailyCreditsUsed = balance.daily_credits_used
    let heavyUsedToday = balance.heavy_actions_used_today

    if (needsDailyReset) {
      dailyCreditsUsed = 0
      heavyUsedToday = 0
      await supabase
        .from('user_ai_balances')
        .update({
          daily_credits_used: 0,
          heavy_actions_used_today: 0,
          last_daily_reset: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', balance.id)
    }

    // ── 6. Enforce hourly request rate (applies to ALL credit sources) ──
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await supabase
      .from('user_ai_usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('request_status', ['success'])
      .gte('created_at', oneHourAgo)

    if ((recentCount ?? 0) >= maxRequestsPerHour) {
      return {
        allowed: false,
        message: "You're sending requests too quickly. Please wait a few minutes and try again.",
        reason: 'hourly_limit',
      }
    }

    // ── 7. Try monthly credits first ──────────────────────────────────────────
    const monthlyHasCredits = balance.credits_remaining >= creditCost

    if (monthlyHasCredits) {
      // ── 7a. Enforce daily credit cap (monthly bucket only) ──
      if (dailyCreditsUsed + creditCost > dailyCreditCap) {
        // Before blocking, check if purchased credits can cover this
        // (purchased credits bypass daily cap, handled in step 8)
      } else {
        // ── 7b. Enforce heavy action daily limit (monthly bucket only) ──
        if (isHeavy && heavyUsedToday >= maxHeavyPerDay) {
          // Before blocking, check purchased credits (bypass heavy limit too)
        } else {
          // ── Monthly credits available and within daily/heavy caps ──
          return {
            allowed: true,
            creditCost,
            isHeavy,
            balanceId: balance.id,
            program: profile.assigned_program,
            creditSource: 'monthly',
            purchasedBucketId: null,
          }
        }
      }
    }

    // ── 8. Monthly credits exhausted or daily/heavy cap hit — try purchased ──
    // Load the oldest active purchased credit bucket with enough remaining credits.
    const isActiveMember =
      profile.subscription_status === 'active' ||
      profile.subscription_status === 'trialing'

    if (isActiveMember) {
      const { data: purchasedBuckets } = await supabase
        .from('user_purchased_ai_credits')
        .select('id, credits_remaining')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gte('credits_remaining', creditCost)
        .order('purchase_date', { ascending: true }) // FIFO — consume oldest first
        .limit(1)

      const oldestBucket = purchasedBuckets?.[0] ?? null

      if (oldestBucket) {
        // Purchased credits available — bypass daily/heavy caps
        return {
          allowed: true,
          creditCost,
          isHeavy,
          balanceId: balance.id,
          program: profile.assigned_program,
          creditSource: 'purchased',
          purchasedBucketId: oldestBucket.id,
        }
      }
    }

    // ── 9. Both buckets exhausted — return appropriate block reason ──

    // Determine the specific reason for better UX messaging
    if (!monthlyHasCredits) {
      const resetDate = new Date(balance.billing_period_end)
      const resetStr = resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
      return {
        allowed: false,
        message: `You've used your included AI credits for this billing period. You can wait until your reset date (${resetStr}) or purchase extra AI credits to continue now.`,
        reason: 'monthly_limit',
      }
    }

    if (dailyCreditsUsed + creditCost > dailyCreditCap) {
      return {
        allowed: false,
        message: "You've reached today's AI usage limit. Please try again tomorrow or purchase extra AI credits.",
        reason: 'daily_limit',
      }
    }

    return {
      allowed: false,
      message: "You've used today's advanced AI analysis limit. Please try again tomorrow or purchase extra AI credits.",
      reason: 'heavy_limit',
    }
  } catch (err) {
    console.error('AI usage check error:', err)
    // On unexpected error, allow through — don't block users due to system issues
    return {
      allowed: true,
      creditCost: 1,
      isHeavy: false,
      balanceId: '',
      program: '',
      creditSource: 'monthly',
      purchasedBucketId: null,
    }
  }
}

// ─── recordAIUsage ─────────────────────────────────────────────────────────────
/**
 * Records a usage event and deducts credits from the correct bucket.
 * Call this AFTER the AI action completes.
 * Only deducts on 'success' — blocked/failed events are logged but not charged.
 *
 * If creditSource === 'purchased', deducts from the specified purchased bucket.
 * Otherwise deducts from the monthly balance (balanceId).
 */
export async function recordAIUsage(
  userId: string,
  program: string,
  actionType: AIActionType,
  creditCost: number,
  isHeavy: boolean,
  balanceId: string,
  status: 'success' | 'failed' | 'blocked',
  model: string,
  estimatedCostUsd: number,
  metadata?: Record<string, unknown>,
  creditSource: CreditSource = 'monthly',
  purchasedBucketId: string | null = null
): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const now = new Date()

    // ── Log the event (with credit_source for audit) ──
    await supabase.from('user_ai_usage_events').insert({
      user_id: userId,
      program,
      action_type: actionType,
      credits_charged: status === 'success' ? creditCost : 0,
      estimated_cost_usd: status === 'success' ? estimatedCostUsd : 0,
      model_used: model,
      request_status: status,
      credit_source: status === 'success' ? creditSource : 'monthly',
      metadata_json: metadata ?? null,
    })

    if (status !== 'success') return

    // ── Deduct from the correct bucket ──
    if (creditSource === 'purchased' && purchasedBucketId) {
      // Deduct from purchased credit bucket
      const { data: bucket } = await supabase
        .from('user_purchased_ai_credits')
        .select('credits_used, credits_remaining')
        .eq('id', purchasedBucketId)
        .single()

      if (bucket) {
        const newRemaining = Math.max(0, bucket.credits_remaining - creditCost)
        const newUsed = bucket.credits_used + creditCost
        await supabase
          .from('user_purchased_ai_credits')
          .update({
            credits_used: newUsed,
            credits_remaining: newRemaining,
            // Mark as consumed once fully depleted
            status: newRemaining === 0 ? 'consumed' : 'active',
            updated_at: now.toISOString(),
          })
          .eq('id', purchasedBucketId)
      }
    } else if (creditSource === 'monthly' && balanceId) {
      // Deduct from monthly balance
      const { data: currentBalance } = await supabase
        .from('user_ai_balances')
        .select('credits_used, credits_remaining, daily_credits_used, heavy_actions_used_today')
        .eq('id', balanceId)
        .single()

      if (currentBalance) {
        await supabase
          .from('user_ai_balances')
          .update({
            credits_used: currentBalance.credits_used + creditCost,
            credits_remaining: Math.max(0, currentBalance.credits_remaining - creditCost),
            daily_credits_used: currentBalance.daily_credits_used + creditCost,
            heavy_actions_used_today: isHeavy
              ? currentBalance.heavy_actions_used_today + 1
              : currentBalance.heavy_actions_used_today,
            updated_at: now.toISOString(),
          })
          .eq('id', balanceId)
      }
    }
  } catch (err) {
    // Silent failure — never let logging crash the response
    console.error('AI usage record error:', err)
  }
}

// ─── getUserAIStatus ───────────────────────────────────────────────────────────
/**
 * Fetches the current AI usage summary for a user (for display in portal).
 */
export async function getUserAIStatus(userId: string) {
  try {
    const supabase = await createServiceClient()
    const now = new Date()

    const [
      { data: profile },
      { data: balance },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('assigned_program, ai_suspended, ai_custom_monthly_credits, ai_custom_daily_cap, ai_custom_heavy_limit')
        .eq('id', userId)
        .single(),
      supabase
        .from('user_ai_balances')
        .select('*')
        .eq('user_id', userId)
        .lte('billing_period_start', now.toISOString())
        .gte('billing_period_end', now.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    return { profile, balance }
  } catch {
    return { profile: null, balance: null }
  }
}

// ─── getPurchasedCreditsTotal ──────────────────────────────────────────────────
/**
 * Returns the total purchased AI credits remaining for a user.
 */
export async function getPurchasedCreditsRemaining(userId: string): Promise<number> {
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('user_purchased_ai_credits')
      .select('credits_remaining')
      .eq('user_id', userId)
      .eq('status', 'active')

    return (data ?? []).reduce((sum, row) => sum + (row.credits_remaining ?? 0), 0)
  } catch {
    return 0
  }
}
