import { getAccountEntitlements, shouldShowReactivationFlow, getAccountStatusLabel } from '../account-state'
import type { PlanTier, SubscriptionStatus, AccountState } from '@/types'

describe('account-state', () => {
  describe('getAccountEntitlements', () => {
    // ── FREE USERS ──────────────────────────────────────────────────────────

    test('free_active: explicitly marked free user', () => {
      const entitlements = getAccountEntitlements('free', 'active', 'active_member')
      expect(entitlements.access_state).toBe('free_active')
      expect(entitlements.can_use_credit_inquiry_tool).toBe(true)
      expect(entitlements.can_use_ai_agent).toBe(false)
      expect(entitlements.can_use_paid_program_features).toBe(false)
      expect(entitlements.has_prior_paid_history).toBe(false)
    })

    test('free_active: free user with inactive subscription (should still be free_active)', () => {
      const entitlements = getAccountEntitlements('free', 'inactive', 'active_member')
      expect(entitlements.access_state).toBe('free_active')
      expect(entitlements.can_use_credit_inquiry_tool).toBe(true)
    })

    test('free_active: legacy prospect account', () => {
      const entitlements = getAccountEntitlements(null, null, 'prospect')
      expect(entitlements.access_state).toBe('free_active')
      expect(entitlements.can_use_credit_inquiry_tool).toBe(true)
      expect(entitlements.can_use_ai_agent).toBe(false)
    })

    // ── PAID ACTIVE USERS ───────────────────────────────────────────────────

    test('paid_active: explicitly marked paid user with active subscription', () => {
      const entitlements = getAccountEntitlements('paid', 'active', 'active_member')
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.can_use_credit_inquiry_tool).toBe(true)
      expect(entitlements.can_use_ai_agent).toBe(true)
      expect(entitlements.can_use_paid_program_features).toBe(true)
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    test('paid_active: explicitly marked paid user with trialing subscription', () => {
      const entitlements = getAccountEntitlements('paid', 'trialing', 'active_member')
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.can_use_ai_agent).toBe(true)
    })

    test('paid_active: legacy active_member with active subscription', () => {
      const entitlements = getAccountEntitlements(null, 'active', 'active_member')
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.can_use_ai_agent).toBe(true)
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    // ── PAID INACTIVE USERS ─────────────────────────────────────────────────

    test('paid_inactive: explicitly marked paid user with inactive subscription', () => {
      const entitlements = getAccountEntitlements('paid', 'inactive', 'active_member')
      expect(entitlements.access_state).toBe('paid_inactive')
      expect(entitlements.can_use_credit_inquiry_tool).toBe(false)
      expect(entitlements.can_use_ai_agent).toBe(false)
      expect(entitlements.can_use_paid_program_features).toBe(false)
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    test('paid_inactive: explicitly marked paid user with canceled subscription', () => {
      const entitlements = getAccountEntitlements('paid', 'canceled', 'active_member')
      expect(entitlements.access_state).toBe('paid_inactive')
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    test('paid_active: explicitly marked paid user with past_due subscription stays in grace period', () => {
      const entitlements = getAccountEntitlements('paid', 'past_due', 'active_member')
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.can_use_paid_program_features).toBe(true)
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    test('paid_inactive: explicitly marked paid user with past_due_locked subscription', () => {
      const entitlements = getAccountEntitlements('paid', 'past_due_locked', 'active_member')
      expect(entitlements.access_state).toBe('paid_inactive')
      expect(entitlements.can_use_paid_program_features).toBe(false)
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    test('paid_inactive: explicitly marked paid user with suspended subscription', () => {
      const entitlements = getAccountEntitlements('paid', 'suspended', 'active_member')
      expect(entitlements.access_state).toBe('paid_inactive')
      expect(entitlements.can_use_paid_program_features).toBe(false)
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    test('paid_inactive: legacy active_member with inactive subscription (lapsed paid)', () => {
      const entitlements = getAccountEntitlements(null, 'inactive', 'active_member')
      expect(entitlements.access_state).toBe('paid_inactive')
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    // ── LEGACY NULL CASES ───────────────────────────────────────────────────

    test('legacy fallback: completely null user (no feature_tier, subscription, or state)', () => {
      const entitlements = getAccountEntitlements(null, null, null)
      // Fallback to paid_inactive to be safe (don't accidentally upgrade)
      expect(entitlements.access_state).toBe('paid_inactive')
      expect(entitlements.can_use_ai_agent).toBe(false)
    })

    test('legacy: null feature_tier but active subscription', () => {
      const entitlements = getAccountEntitlements(null, 'active', null)
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.has_prior_paid_history).toBe(true)
    })
  })

  describe('shouldShowReactivationFlow', () => {
    test('paid_inactive user with prior paid history should show reactivation', () => {
      const entitlements = getAccountEntitlements('paid', 'inactive', 'active_member')
      expect(shouldShowReactivationFlow(entitlements)).toBe(true)
    })

    test('free_active user should NOT show reactivation', () => {
      const entitlements = getAccountEntitlements('free', 'active', 'prospect')
      expect(shouldShowReactivationFlow(entitlements)).toBe(false)
    })

    test('paid_active user should NOT show reactivation', () => {
      const entitlements = getAccountEntitlements('paid', 'active', 'active_member')
      expect(shouldShowReactivationFlow(entitlements)).toBe(false)
    })

    test('legacy prospect should NOT show reactivation', () => {
      const entitlements = getAccountEntitlements(null, null, 'prospect')
      expect(shouldShowReactivationFlow(entitlements)).toBe(false)
    })
  })

  describe('getAccountStatusLabel', () => {
    test('free_active returns "Free Plan Active"', () => {
      const entitlements = getAccountEntitlements('free', 'active', 'prospect')
      expect(getAccountStatusLabel(entitlements)).toBe('Free Plan Active')
    })

    test('paid_active returns "Active Subscription"', () => {
      const entitlements = getAccountEntitlements('paid', 'active', 'active_member')
      expect(getAccountStatusLabel(entitlements)).toBe('Active Subscription')
    })

    test('paid_inactive returns "Subscription Inactive"', () => {
      const entitlements = getAccountEntitlements('paid', 'inactive', 'active_member')
      expect(getAccountStatusLabel(entitlements)).toBe('Subscription Inactive')
    })
  })

  describe('regression: paid program users unaffected', () => {
    test('Program A user with active subscription keeps full access', () => {
      const entitlements = getAccountEntitlements('paid', 'active', 'active_member')
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.can_use_ai_agent).toBe(true)
      expect(entitlements.can_use_paid_program_features).toBe(true)
    })

    test('Program B user with active subscription keeps full access', () => {
      const entitlements = getAccountEntitlements('paid', 'active', 'active_member')
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.can_use_ai_agent).toBe(true)
      expect(entitlements.can_use_paid_program_features).toBe(true)
    })

    test('Program A user with trialing subscription keeps full access', () => {
      const entitlements = getAccountEntitlements('paid', 'trialing', 'active_member')
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.can_use_ai_agent).toBe(true)
    })

    test('Inactive paid user does NOT get upgraded to free', () => {
      const entitlements = getAccountEntitlements('paid', 'canceled', 'active_member')
      expect(entitlements.access_state).not.toBe('free_active')
      expect(entitlements.access_state).toBe('paid_inactive')
      expect(entitlements.has_prior_paid_history).toBe(true)
    })

    test('Legacy paid user (null feature_tier, active subscription) keeps access', () => {
      const entitlements = getAccountEntitlements(null, 'active', 'active_member')
      expect(entitlements.access_state).toBe('paid_active')
      expect(entitlements.can_use_ai_agent).toBe(true)
    })
  })
})
