import { createServiceClient } from '@/lib/supabase/server'
import { getPartnerCommissionPercent, type RevenueComponent } from '@/lib/partner-program'

export const AFFILIATE_FREE_ACCESS_THRESHOLD = 5
export const AFFILIATE_QUALIFICATION_DAYS = 14

// ─── Deal-Type Commission Rates (non-negotiable) ──────────────────────────────
export const DEAL_TYPE_RATES = {
  referral_only:    { setup: 10, recurring: 10 },
  affiliate_closed: { setup: 30, recurring: 30 },
} as const

export type DealType = 'referral_only' | 'affiliate_closed' | 'partner_assisted'

export interface AffiliateCommissionSettings {
  program_type: string
  setup_commission_percent: number
  recurring_commission_percent: number
  setup_hold_days: number
  recurring_hold_days: number
  minimum_payout_threshold: number
  setup_commissions_enabled: boolean
  recurring_commissions_enabled: boolean
}

/** Generate a unique 8-character referral code */
export function generateReferralCode(name: string): string {
  const prefix = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X')
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}${suffix}`
}

/** Get commission settings for a specific program */
export async function getCommissionSettings(programType: string): Promise<AffiliateCommissionSettings | null> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('affiliate_settings')
    .select('*')
    .eq('program_type', programType)
    .single()
  return data
}

/** Get affiliate by Stripe customer ID (via referral).
 *  Returns the referral + affiliate record needed for eligibility checks.
 */
export async function getAffiliateByStripeCustomer(stripeCustomerId: string) {
  const supabase = await createServiceClient()
  const { data: referral } = await supabase
    .from('affiliate_referrals')
    .select('*, affiliates(id, user_id, email, created_at, status, is_demo)')
    .eq('stripe_customer_id', stripeCustomerId)
    .not('referral_status', 'in', '("refunded","chargeback")')
    .eq('is_self_referral', false)    // never surface self-referrals for commission
    .eq('is_flagged', false)          // never surface flagged referrals
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return referral
}

// ─── Commission Eligibility Guard ─────────────────────────────────────────────

export interface CommissionEligibilityResult {
  eligible: boolean
  reason?: string
}

/**
 * Central eligibility check before any commission is created.
 * Returns { eligible: false, reason } if any rule is violated.
 *
 * Rules enforced:
 *  1. No self-commission (affiliate user === client user, or email match)
 *  2. No retroactive attribution (referral created before affiliate account)
 *  3. Referral must not be flagged as self-referral
 */
export async function checkCommissionEligibility({
  affiliateId,
  affiliateUserId,
  affiliateEmail,
  affiliateCreatedAt,
  clientUserId,
  clientEmail,
  referralCreatedAt,
  referralIsSelfReferral,
}: {
  affiliateId: string
  affiliateUserId: string | null
  affiliateEmail: string
  affiliateCreatedAt: string
  clientUserId: string | null
  clientEmail: string | null
  referralCreatedAt: string
  referralIsSelfReferral: boolean
}): Promise<CommissionEligibilityResult> {

  // Rule 1a: same user account
  if (affiliateUserId && clientUserId && affiliateUserId === clientUserId) {
    return { eligible: false, reason: 'self_commission_same_user' }
  }

  // Rule 1b: same email address
  if (clientEmail && affiliateEmail.toLowerCase() === clientEmail.toLowerCase()) {
    return { eligible: false, reason: 'self_commission_same_email' }
  }

  // Rule 1c: referral was already flagged as self-referral during signup
  if (referralIsSelfReferral) {
    return { eligible: false, reason: 'self_referral_flagged' }
  }

  // Rule 2: retroactive attribution — referral must be created AFTER affiliate account
  const affiliateTs = new Date(affiliateCreatedAt).getTime()
  const referralTs  = new Date(referralCreatedAt).getTime()
  if (referralTs < affiliateTs) {
    return { eligible: false, reason: 'retroactive_attribution' }
  }

  return { eligible: true }
}

/**
 * Count active paying referred clients for an affiliate.
 * Excludes self-referrals and flagged records (Rules 1 & 5).
 */
export async function countActiveReferrals(affiliateId: string): Promise<number> {
  const supabase = await createServiceClient()
  const { count } = await supabase
    .from('affiliate_referrals')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', affiliateId)
    .eq('referral_status', 'active')
    .eq('subscription_active', true)
    .eq('is_flagged', false)
    .eq('is_self_referral', false)   // Rule 5: affiliate's own account never counts
  return count ?? 0
}

/** Run the free access qualification check for all affiliates */
export async function runFreeAccessQualificationCheck() {
  const supabase = await createServiceClient()
  const { data: affiliates } = await supabase
    .from('affiliates')
    .select('id, has_free_program_b_access, qualification_start_date, status')
    .eq('status', 'active')
    .eq('is_demo', false)

  if (!affiliates) return { processed: 0, unlocked: 0, locked: 0 }

  let unlocked = 0
  let locked = 0

  for (const affiliate of affiliates) {
    const activeCount = await countActiveReferrals(affiliate.id)

    if (activeCount >= AFFILIATE_FREE_ACCESS_THRESHOLD) {
      if (!affiliate.qualification_start_date) {
        // Start qualification period
        await supabase
          .from('affiliates')
          .update({ qualification_start_date: new Date().toISOString() })
          .eq('id', affiliate.id)
      } else {
        // Check if 14 days have passed
        const qualStart = new Date(affiliate.qualification_start_date)
        const daysPassed = (Date.now() - qualStart.getTime()) / (1000 * 60 * 60 * 24)
        if (daysPassed >= AFFILIATE_QUALIFICATION_DAYS && !affiliate.has_free_program_b_access) {
          await supabase
            .from('affiliates')
            .update({
              has_free_program_b_access: true,
              free_access_unlocked_at: new Date().toISOString(),
            })
            .eq('id', affiliate.id)
          unlocked++
        }
      }
    } else {
      // Below threshold — lock immediately
      if (affiliate.has_free_program_b_access || affiliate.qualification_start_date) {
        await supabase
          .from('affiliates')
          .update({
            has_free_program_b_access: false,
            qualification_start_date: null,
          })
          .eq('id', affiliate.id)
        if (affiliate.has_free_program_b_access) locked++
      }
    }
  }

  return { processed: affiliates.length, unlocked, locked }
}

/** Create a commission for a payment.
 *
 *  Rate logic:
 *  - legacy referral_only                   → 10% setup / 10% recurring
 *  - legacy affiliate_closed + approved     → 30% setup / 30% recurring
 *  - partner_assisted                       → 80% setup (A/B only) / 20% recurring
 *
 *  Eligibility checks run before any commission is written:
 *  - no self-commission (Rule 1)
 *  - no retroactive attribution (Rule 2)
 */
export async function createCommission({
  affiliateId,
  referralId,
  userId,
  stripePaymentIntentId,
  stripeInvoiceId,
  programType,
  commissionType,
  grossAmountCents,
  idempotencyKey,
  dealType = 'partner_assisted',
  dealTypeApproved = null,
}: {
  affiliateId: string
  referralId: string | null
  userId: string | null
  stripePaymentIntentId: string | null
  stripeInvoiceId: string | null
  programType: string
  commissionType: 'setup' | 'recurring'
  grossAmountCents: number
  idempotencyKey: string
  dealType?: DealType
  dealTypeApproved?: boolean | null
}) {
  const supabase = await createServiceClient()

  // ── Eligibility guard ───────────────────────────────────────────────────────
  // Fetch affiliate + referral metadata needed for eligibility checks
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, user_id, email, created_at')
    .eq('id', affiliateId)
    .single()

  if (!affiliate) return null   // affiliate record must exist

  if (referralId) {
    const { data: referral } = await supabase
      .from('affiliate_referrals')
      .select('id, user_id, lead_email, created_at, is_self_referral')
      .eq('id', referralId)
      .single()

    if (referral) {
      const eligibility = await checkCommissionEligibility({
        affiliateId,
        affiliateUserId:    affiliate.user_id,
        affiliateEmail:     affiliate.email,
        affiliateCreatedAt: affiliate.created_at,
        clientUserId:       referral.user_id,
        clientEmail:        referral.lead_email,
        referralCreatedAt:  referral.created_at,
        referralIsSelfReferral: referral.is_self_referral ?? false,
      })

      if (!eligibility.eligible) {
        console.log(`[commission-blocked] affiliate=${affiliateId} reason=${eligibility.reason} idempotency=${idempotencyKey}`)
        return null
      }
    }
  }

  // Get commission settings (for hold days, enabled flags, threshold)
  const settings = await getCommissionSettings(programType)
  if (!settings) return null

  // Check if commissions are enabled for this type
  if (commissionType === 'setup' && !settings.setup_commissions_enabled) return null
  if (commissionType === 'recurring' && !settings.recurring_commissions_enabled) return null

  // ── Determine effective rate from deal_type ───────────────────────────────
  // Legacy affiliate_closed may still require approval. New partner_assisted
  // deals are paid using the new setup/recurring schedule immediately after
  // successful collection.
  let globalSettings: { require_approval_for_affiliate_closed: boolean } | null = null
  try {
    const { data } = await supabase.from('affiliate_global_settings').select('*').eq('id', 1).single()
    globalSettings = data
  } catch { /* ignore — default to not requiring approval */ }

  const approvalRequired = globalSettings?.require_approval_for_affiliate_closed ?? false
  const effectiveDealType: DealType =
    dealType === 'affiliate_closed' && approvalRequired && dealTypeApproved !== true
      ? 'referral_only'   // downgrade until approved
      : dealType

  const revenueComponent: RevenueComponent = commissionType === 'setup' ? 'setup_fee' : 'recurring'
  const percent = getPartnerCommissionPercent(
    programType as 'program_a' | 'program_b' | 'program_c',
    revenueComponent,
    effectiveDealType
  )
  if (percent <= 0) return null

  const holdDays = commissionType === 'setup' ? settings.setup_hold_days : settings.recurring_hold_days
  const availableAt = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString()
  const commissionAmount = Math.round(grossAmountCents * (percent / 100))

  const { data, error } = await supabase
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliateId,
      referral_id: referralId,
      user_id: userId,
      stripe_payment_intent_id: stripePaymentIntentId,
      stripe_invoice_id: stripeInvoiceId,
      program_type: programType,
      commission_type: commissionType,
      gross_amount: grossAmountCents,
      commission_percent: percent,
      commission_amount: commissionAmount,
      deal_type: dealType,          // record actual deal_type (not downgraded)
      revenue_component: revenueComponent,
      acquisition_path: effectiveDealType === 'partner_assisted' ? 'partner_assisted' : 'self_serve',
      partner_commission_eligible: true,
      status: 'pending',
      available_at: availableAt,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single()

  if (error?.code === '23505') return null // duplicate idempotency key — already processed
  if (error) throw error
  return data
}

/** Reverse commissions for a payment */
export async function reverseCommissions(
  stripePaymentIntentId: string | null,
  stripeInvoiceId: string | null,
  reason: string,
) {
  const supabase = await createServiceClient()
  const query = supabase.from('affiliate_commissions').update({
    status: 'reversed',
    reversed_at: new Date().toISOString(),
    reversal_reason: reason,
  })
  if (stripePaymentIntentId) {
    await query.eq('stripe_payment_intent_id', stripePaymentIntentId).in('status', ['pending', 'approved'])
  } else if (stripeInvoiceId) {
    await query.eq('stripe_invoice_id', stripeInvoiceId).in('status', ['pending', 'approved'])
  }
}

/** Format cents as dollars */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}
