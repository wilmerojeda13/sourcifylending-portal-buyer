/**
 * underwriting-scorer.ts
 *
 * Deterministic underwriting scoring engine — no AI dependency.
 * Runs synchronously before the OpenAI call in /api/underwriting.
 * Returns a risk score, approval likelihood, and key issue list
 * that the AI then uses as grounding context.
 */

import type { ProgramId } from '@/types'

// ─── Input & Output types ──────────────────────────────────────────────────────

export interface UWScoreInput {
  program: ProgramId
  // From profile (already stored)
  credit_score_range: string | null
  utilization_range: string | null
  inquiry_range: string | null
  nsf_flag: boolean
  business_age: string | null
  entity_type: string | null
  // Shared form fields
  uw_annual_revenue_conf: string
  uw_average_daily_balance: string
  uw_outstanding_balances: string
  uw_recent_derogatory: boolean
  uw_public_records: boolean
  // Program A
  uw_total_credit_limit?: string
  uw_monthly_income?: string
  uw_negative_accounts?: boolean
  uw_existing_card_balances?: string
  uw_authorized_user_status?: boolean
  // Program B
  uw_duns_status?: string
  uw_experian_biz_exists?: boolean
  uw_tradelines_count?: number
  uw_ein_open_date?: string
  uw_existing_biz_debts?: string
}

export interface UWScoreResult {
  risk_score: number                                          // 0–100; higher = riskier
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  approval_likelihood: 'high' | 'medium' | 'low' | 'disqualified'
  disqualification_reason: string | null
  key_issues: string[]
  estimated_funding_range: string | null                     // Program A only
  recommended_issuers: string[]                              // Program A only
  determined_stage: string | null                            // Program B only
  next_accounts: string[]                                    // Program B only
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function includes(haystack: string | null | undefined, ...needles: string[]): boolean {
  if (!haystack) return false
  const h = haystack.toLowerCase()
  return needles.some(n => h.includes(n.toLowerCase()))
}

// ─── Main Scoring Function ─────────────────────────────────────────────────────

export function scoreUnderwriting(input: UWScoreInput): UWScoreResult {
  let riskScore = 0
  const keyIssues: string[] = []
  let disqualificationReason: string | null = null

  // ─── HARD STOPS (instant disqualification) ───────────────────────────────────
  if (input.nsf_flag) {
    disqualificationReason = 'NSF/overdraft activity detected in the last 90 days. This must be resolved before proceeding.'
    keyIssues.push('NSF/overdraft activity in last 90 days')
  }

  if (input.uw_public_records) {
    disqualificationReason = disqualificationReason ?? 'Open tax liens, judgments, or bankruptcy on record. These must be resolved before program advancement.'
    keyIssues.push('Open public records (liens, judgments, or bankruptcy)')
  }

  if (input.program === 'program_a' && includes(input.credit_score_range, 'Below 580', '500-579')) {
    disqualificationReason = disqualificationReason ?? 'Personal credit score below 580 does not meet the Program A minimum threshold of 620+.'
    keyIssues.push('Credit score below Program A minimum (620+)')
  }

  if (disqualificationReason) {
    return {
      risk_score: 100,
      risk_level: 'HIGH',
      approval_likelihood: 'disqualified',
      disqualification_reason: disqualificationReason,
      key_issues: keyIssues,
      estimated_funding_range: null,
      recommended_issuers: [],
      determined_stage: null,
      next_accounts: [],
    }
  }

  // ─── RISK SCORING (additive points) ──────────────────────────────────────────

  // Derogatory history
  if (input.uw_recent_derogatory) {
    riskScore += 25
    keyIssues.push('Collections or charge-offs in last 24 months')
  }

  // Credit score
  if (includes(input.credit_score_range, '580-619')) { riskScore += 25; keyIssues.push('Credit score in 580–619 range') }
  else if (includes(input.credit_score_range, '620-639')) { riskScore += 15; keyIssues.push('Credit score in 620–639 range') }
  else if (includes(input.credit_score_range, '640-659')) { riskScore += 10 }
  else if (includes(input.credit_score_range, '660-679')) { riskScore += 5 }

  // Utilization
  if (includes(input.utilization_range, '75%+', '75-99%', '100%+')) {
    riskScore += 30; keyIssues.push('Credit utilization at 75% or higher')
  } else if (includes(input.utilization_range, '50-74%')) {
    riskScore += 15; keyIssues.push('Elevated credit utilization (50–74%)')
  } else if (includes(input.utilization_range, '30-49%')) {
    riskScore += 7
  }

  // Inquiries
  if (includes(input.inquiry_range, '10+', '6-9', '6+')) {
    riskScore += 20; keyIssues.push('6 or more hard inquiries in last 90 days')
  } else if (includes(input.inquiry_range, '4-5', '3-5')) {
    riskScore += 10; keyIssues.push('Elevated inquiry count (4–5)')
  }

  // Bank balance
  if (includes(input.uw_average_daily_balance, '$0', 'under $1', '0-1')) {
    riskScore += 20; keyIssues.push('Average daily bank balance under $1,000')
  } else if (includes(input.uw_average_daily_balance, '$1,000-$5,000', '1k-5k', '1,000-5,000')) {
    riskScore += 8
  }

  // Outstanding personal/business balances
  if (includes(input.uw_outstanding_balances, '$150k+', '150k+', '150,000+')) {
    riskScore += 25; keyIssues.push('Outstanding debt exceeds $150,000')
  } else if (includes(input.uw_outstanding_balances, '$75k-$150k', '75k-150k')) {
    riskScore += 15; keyIssues.push('Outstanding debt in $75,000–$150,000 range')
  } else if (includes(input.uw_outstanding_balances, '$30k-$75k', '30k-75k')) {
    riskScore += 8
  }

  // Business age
  if (includes(input.business_age, 'less than', '0-6 months', '6-12 months', 'under 1')) {
    riskScore += 12; keyIssues.push('Business under 1 year — limited credit history')
  }

  // ── Program A specific scoring ─────────────────────────────────────────────
  if (input.program === 'program_a') {
    if (input.uw_existing_card_balances && includes(input.uw_existing_card_balances, '$15,000+', '15k+', '15,000+')) {
      riskScore += 15; keyIssues.push('High existing card balances may reduce approval odds')
    }
    if (input.uw_negative_accounts) {
      riskScore += 20; keyIssues.push('Negative accounts on credit file')
    }
  }

  // ── Program B specific scoring ─────────────────────────────────────────────
  if (input.program === 'program_b') {
    if (input.uw_duns_status && includes(input.uw_duns_status, 'no', 'none', 'need')) {
      riskScore += 10; keyIssues.push('No D-U-N-S number — must obtain before Foundation stage')
    }
    if (input.uw_ein_open_date && includes(input.uw_ein_open_date, 'not yet', 'not opened')) {
      riskScore += 20; keyIssues.push('EIN business bank account not yet opened')
    }
    if (input.uw_existing_biz_debts && includes(input.uw_existing_biz_debts, '$25k+', '25k+', '25,000+')) {
      riskScore += 10; keyIssues.push('Existing business debt may limit new tradeline approvals')
    }
  }

  // ─── Normalize score to 0–100 ────────────────────────────────────────────────
  riskScore = Math.min(riskScore, 100)

  // ─── Derive approval_likelihood and risk_level ────────────────────────────────
  let approvalLikelihood: UWScoreResult['approval_likelihood']
  let riskLevel: UWScoreResult['risk_level']

  if (riskScore <= 15) {
    approvalLikelihood = 'high'
    riskLevel = 'LOW'
  } else if (riskScore <= 40) {
    approvalLikelihood = 'medium'
    riskLevel = 'MEDIUM'
  } else if (riskScore <= 69) {
    approvalLikelihood = 'low'
    riskLevel = 'HIGH'
  } else {
    approvalLikelihood = 'disqualified'
    riskLevel = 'HIGH'
    if (!disqualificationReason) {
      disqualificationReason = 'Combined risk factors exceed acceptable thresholds. Additional remediation steps are required before program advancement.'
    }
  }

  // ─── Program A: Estimated funding range + recommended issuers ─────────────────
  let estimatedFundingRange: string | null = null
  let recommendedIssuers: string[] = []

  if (input.program === 'program_a') {
    const goodScore = includes(input.credit_score_range, '720+', '700-719', '680-699')
    const okScore   = includes(input.credit_score_range, '660-679', '640-659', '620-639')
    const lowUtil   = includes(input.utilization_range, '0-9%', '10-29%')

    if (goodScore && lowUtil) {
      estimatedFundingRange = '$50,000 – $150,000'
      recommendedIssuers = ['Chase Ink Unlimited', 'Chase Ink Cash', 'U.S. Bank Triple Cash', 'Amex Blue Business Cash']
    } else if (goodScore) {
      estimatedFundingRange = '$25,000 – $75,000'
      recommendedIssuers = ['Chase Ink Unlimited', 'U.S. Bank Triple Cash', 'Amex Blue Business Plus']
    } else if (okScore && lowUtil) {
      estimatedFundingRange = '$15,000 – $50,000'
      recommendedIssuers = ['Chase Ink Unlimited', 'Capital One Spark Cash Plus', 'Amex Blue Business Cash']
    } else {
      estimatedFundingRange = '$5,000 – $25,000'
      recommendedIssuers = ['Chase Ink Business Cash', 'Capital One Spark Cash Plus']
    }
  }

  // ─── Program B: Determined stage + next accounts ──────────────────────────────
  let determinedStage: string | null = null
  let nextAccounts: string[] = []

  if (input.program === 'program_b') {
    const tradelineCount = input.uw_tradelines_count ?? 0

    if (tradelineCount < 3) {
      determinedStage = 'Foundation'
      nextAccounts = ['D&B D-U-N-S Number', 'Experian Business Profile', 'eCredable Business', 'Uline Net 30', 'Quill.com Net 30']
    } else if (tradelineCount < 6) {
      determinedStage = 'Store Credit'
      nextAccounts = ['Uline Net 30', 'Quill.com Net 30', 'Grainger Commercial Account', 'Ohana Office Products Net 30', 'Fastenal Commercial Account']
    } else if (tradelineCount < 9) {
      determinedStage = 'Fleet & Gas'
      nextAccounts = ['WEX Fleet Card', 'AtoB Fuel Card', 'Coast Fleet Card', 'Fuelman Fleet Card']
    } else {
      determinedStage = 'Cash & Revolving'
      nextAccounts = ['BILL Spend & Expense (formerly Divvy)', 'Ramp Business Card', 'Brex Business Card', 'Capital on Tap Business Credit Card']
    }

    // Update profile current_stage will be done in the API route based on this
  }

  return {
    risk_score: riskScore,
    risk_level: riskLevel,
    approval_likelihood: approvalLikelihood,
    disqualification_reason: disqualificationReason,
    key_issues: keyIssues,
    estimated_funding_range: estimatedFundingRange,
    recommended_issuers: recommendedIssuers,
    determined_stage: determinedStage,
    next_accounts: nextAccounts,
  }
}
