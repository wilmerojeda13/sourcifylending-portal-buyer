import type { PlanTier, SubscriptionStatus } from '@/types'

export type FeatureName =
  | 'credit_inquiry_tool'
  | 'ai_agent'
  | 'documents'
  | 'progress_tracking'
  | 'reports'
  | 'credit_optimization'
  | 'business_credit_setup'
  | 'business_credit_monitoring'
  | 'business_resources'
  | 'underwriting'
  | 'opportunities'
  | 'funding_results'
  | 'roi_tracker'
  | 'ai_credits'
  | 'training_videos'
  | 'support'
  | 'settings'

/**
 * Determine if a user can access a specific feature based on plan tier and subscription status.
 *
 * Free users:
 * - Can access: credit_inquiry_tool, funding_results, training_videos, support, settings
 * - Cannot access: AI agent, documents, paid programs, reports, billing management
 *
 * Paid users (active, trialing, or past_due grace period):
 * - Can access: all features
 *
 * Paid users (inactive):
 * - Limited access until reactivation
 */
export function canAccessFeature(
  planTier: PlanTier | null | undefined,
  subscriptionStatus: SubscriptionStatus | null | undefined,
  feature: FeatureName,
  _isAdmin?: boolean
): boolean {
  const isFree = planTier === 'free'
  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing' || subscriptionStatus === 'past_due'

  // Free users can only access specific features
  if (isFree) {
    const freeFeatures: FeatureName[] = [
      'credit_inquiry_tool',
      'funding_results',
      'training_videos',
      'support',
      'settings',
    ]
    return freeFeatures.includes(feature)
  }

  // Paid users can access everything if active or trialing
  if (isActive) {
    return true
  }

  // Inactive paid users can access limited features
  const inactiveAllowedFeatures: FeatureName[] = [
    'funding_results',
    'training_videos',
    'support',
    'settings',
  ]
  return inactiveAllowedFeatures.includes(feature)
}

/**
 * Get the subscription status message for a user.
 */
export function getSubscriptionStatusMessage(
  planTier: PlanTier | null | undefined,
  subscriptionStatus: SubscriptionStatus | null | undefined
): string {
  const isFree = planTier === 'free'
  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing' || subscriptionStatus === 'past_due'

  if (isFree) {
    return 'Free Plan Active'
  }

  if (isActive) {
    return 'Active Subscription'
  }

  if (subscriptionStatus === 'past_due_locked' || subscriptionStatus === 'suspended') {
    return 'Membership Paused'
  }

  if (subscriptionStatus === 'canceled') {
    return 'Subscription Canceled'
  }

  return 'Inactive'
}

/**
 * Determine if a user should see the reactivation flow.
 * Only show for paid users whose subscription is not active.
 */
export function shouldShowReactivationFlow(
  planTier: PlanTier | null | undefined,
  subscriptionStatus: SubscriptionStatus | null | undefined,
  _isAdmin?: boolean
): boolean {
  const isFree = planTier === 'free'
  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing' || subscriptionStatus === 'past_due'

  // Free users never see reactivation
  if (isFree) {
    return false
  }

  // Paid users see it only when inactive
  return !isActive
}

/**
 * Get a user-friendly message explaining why a feature is locked.
 */
export function getLockedFeatureMessage(feature: FeatureName): string {
  const messages: Record<FeatureName, string> = {
    credit_inquiry_tool: 'Available on Free plan',
    ai_agent: 'Available on paid plans only',
    documents: 'Available on paid plans only',
    progress_tracking: 'Available on paid plans only',
    reports: 'Available on paid plans only',
    credit_optimization: 'Available on paid plans only',
    business_credit_setup: 'Available on paid plans only',
    business_credit_monitoring: 'Available on paid plans only',
    business_resources: 'Available on paid plans only',
    underwriting: 'Available on paid plans only',
    opportunities: 'Available on paid plans only',
    funding_results: 'Available on all plans',
    roi_tracker: 'Available on paid plans only',
    ai_credits: 'Available on paid plans only',
    training_videos: 'Available on all plans',
    support: 'Available on all plans',
    settings: 'Available on all plans',
  }

  return messages[feature] || 'Feature not available on your plan'
}
