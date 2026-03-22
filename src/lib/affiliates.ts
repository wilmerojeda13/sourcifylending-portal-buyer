import { createServiceClient } from '@/lib/supabase/server'

export const AFFILIATE_FREE_ACCESS_THRESHOLD = 5
export const AFFILIATE_QUALIFICATION_DAYS = 14

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

/** Get affiliate by Stripe customer ID (via referral) */
export async function getAffiliateByStripeCustomer(stripeCustomerId: string) {
  const supabase = await createServiceClient()
  const { data: referral } = await supabase
    .from('affiliate_referrals')
    .select('*, affiliates(*)')
    .eq('stripe_customer_id', stripeCustomerId)
    .not('referral_status', 'in', '("refunded","chargeback")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return referral
}

/** Count active paying referred clients for an affiliate */
export async function countActiveReferrals(affiliateId: string): Promise<number> {
  const supabase = await createServiceClient()
  const { count } = await supabase
    .from('affiliate_referrals')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', affiliateId)
    .eq('referral_status', 'active')
    .eq('subscription_active', true)
    .eq('is_flagged', false)
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

/** Create a commission for a payment */
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
}) {
  const supabase = await createServiceClient()

  // Get commission settings
  const settings = await getCommissionSettings(programType)
  if (!settings) return null

  // Check if commissions are enabled for this type
  if (commissionType === 'setup' && !settings.setup_commissions_enabled) return null
  if (commissionType === 'recurring' && !settings.recurring_commissions_enabled) return null

  const percent = commissionType === 'setup'
    ? settings.setup_commission_percent
    : settings.recurring_commission_percent

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
