import type { PlanTier, SubscriptionStatus, AccountState } from '@/types'

/**
 * Normalized account access state derived from feature_tier, billing_status, and member_status.
 * Read-time normalization - no schema changes required.
 */
export type AccountAccessState = 'free_active' | 'paid_active' | 'paid_inactive'

export interface AccountEntitlements {
  access_state: AccountAccessState
  can_use_credit_inquiry_tool: boolean
  can_use_ai_agent: boolean
  can_use_paid_program_features: boolean
  has_prior_paid_history?: boolean
}

/**
 * Determine account access state and entitlements from user profile data.
 *
 * Logic:
 * - If feature_tier === 'free': free_active (free users are always "active" by definition)
 * - If feature_tier === 'paid' or null/undefined:
 *   - If billing_status === 'active' or 'trialing': paid_active
 *   - Otherwise: paid_inactive (or paid_never_active if no prior history)
 * - Legacy users (null feature_tier, null billing_status):
 *   - If member_status === 'prospect': free_active (prospects are free)
 *   - If member_status === 'active_member': paid_active (assumes paid if active_member)
 *   - Otherwise: treat as paid_inactive
 */
export function getAccountEntitlements(
  planTier: PlanTier | null | undefined,
  subscriptionStatus: SubscriptionStatus | null | undefined,
  accountState: AccountState | null | undefined
): AccountEntitlements {
  const isFree = planTier === 'free'
  const isActiveSubscription = subscriptionStatus === 'active' || subscriptionStatus === 'trialing'

  // Free users are always in free_active state
  if (isFree) {
    return {
      access_state: 'free_active',
      can_use_credit_inquiry_tool: true,
      can_use_ai_agent: false,
      can_use_paid_program_features: false,
      has_prior_paid_history: false,
    }
  }

  // Explicitly paid users
  if (planTier === 'paid') {
    if (isActiveSubscription) {
      return {
        access_state: 'paid_active',
        can_use_credit_inquiry_tool: true,
        can_use_ai_agent: true,
        can_use_paid_program_features: true,
        has_prior_paid_history: true,
      }
    }
    // Explicitly marked as paid but not active = lapsed paid user
    return {
      access_state: 'paid_inactive',
      can_use_credit_inquiry_tool: false,
      can_use_ai_agent: false,
      can_use_paid_program_features: false,
      has_prior_paid_history: true,
    }
  }

  // Legacy users with no explicit feature_tier
  // Use member_status as a proxy for paid status
  if (accountState === 'prospect') {
    // Prospect accounts are essentially free users
    return {
      access_state: 'free_active',
      can_use_credit_inquiry_tool: true,
      can_use_ai_agent: false,
      can_use_paid_program_features: false,
      has_prior_paid_history: false,
    }
  }

  if (accountState === 'active_member') {
    // Legacy active_member without explicit feature_tier
    // Assume they were/are paid users
    if (isActiveSubscription) {
      return {
        access_state: 'paid_active',
        can_use_credit_inquiry_tool: true,
        can_use_ai_agent: true,
        can_use_paid_program_features: true,
        has_prior_paid_history: true,
      }
    }
    // active_member but not active subscription = lapsed paid
    return {
      access_state: 'paid_inactive',
      can_use_credit_inquiry_tool: false,
      can_use_ai_agent: false,
      can_use_paid_program_features: false,
      has_prior_paid_history: true,
    }
  }

  // Fallback for any other null/undefined state: treat as paid_inactive to be safe
  // (don't accidentally upgrade someone to free)
  return {
    access_state: 'paid_inactive',
    can_use_credit_inquiry_tool: false,
    can_use_ai_agent: false,
    can_use_paid_program_features: false,
    has_prior_paid_history: false,
  }
}

/**
 * Determine if user should see reactivation flow.
 * Only paid_inactive users with prior paid history should see it.
 */
export function shouldShowReactivationFlow(entitlements: AccountEntitlements): boolean {
  return entitlements.access_state === 'paid_inactive' && !!entitlements.has_prior_paid_history
}

/**
 * Get human-friendly status label for billing/account pages.
 */
export function getAccountStatusLabel(entitlements: AccountEntitlements): string {
  switch (entitlements.access_state) {
    case 'free_active':
      return 'Free Plan Active'
    case 'paid_active':
      return 'Active Subscription'
    case 'paid_inactive':
      return 'Subscription Inactive'
    default:
      return 'Inactive'
  }
}
