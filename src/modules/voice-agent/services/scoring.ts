/**
 * Lead Quality Scoring Engine
 *
 * Calculates a 0–100 quality score for each lead based on
 * data completeness, source type, phone validity, and history.
 * Score drives priority tier assignment and dial order.
 */
import type { VoiceLead, PriorityTier } from '@/types'

export interface ScoringWeights {
  inbound_facebook:       number  // +20 prior inbound/facebook engagement
  full_name_present:      number  // +15 full business + owner name
  valid_phone:            number  // +10 valid phone
  email_present:          number  // +10 business email present
  target_geography:       number  // +10 target geography
  is_duplicate:           number  // -20 duplicate
  invalid_number:         number  // -25 invalid number
  prior_opt_out:          number  // -30 prior opt-out
  personal_line:          number  // -15 likely personal line
  incomplete_purchased:   number  // -15 incomplete purchased lead
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  inbound_facebook:     20,
  full_name_present:    15,
  valid_phone:          10,
  email_present:        10,
  target_geography:     10,
  is_duplicate:        -20,
  invalid_number:      -25,
  prior_opt_out:       -30,
  personal_line:       -15,
  incomplete_purchased:-15,
}

// Target states for geographic scoring
const TARGET_STATES = ['FL','TX','CA','NY','GA','IL','PA','OH','AZ','NC']

export interface ScoreInput {
  lead_source:    string
  business_name:  string | null
  owner_name:     string | null
  email:          string | null
  phone_e164:     string | null
  phone_validated: boolean
  line_type:      string
  geography:      string | null
  is_duplicate:   boolean
  do_not_call:    boolean
  validation_status: string
}

/**
 * Compute the initial quality score for a lead.
 * Returns clamped score 0–100.
 */
export function computeLeadScore(
  input: ScoreInput,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): { score: number; reasons: string[] } {
  let score   = 50  // baseline
  const reasons: string[] = []

  // Hard suppress — score = 0
  if (input.do_not_call) {
    return { score: 0, reasons: ['do_not_call'] }
  }

  // Source bonus
  if (input.lead_source === 'inbound' || input.lead_source === 'facebook') {
    score += weights.inbound_facebook
    reasons.push(`source_${input.lead_source}: +${weights.inbound_facebook}`)
  }

  // Name completeness
  if (input.business_name?.trim() && input.owner_name?.trim()) {
    score += weights.full_name_present
    reasons.push(`full_name_present: +${weights.full_name_present}`)
  } else if (input.lead_source === 'purchased' && (!input.business_name?.trim() || !input.owner_name?.trim())) {
    score += weights.incomplete_purchased
    reasons.push(`incomplete_purchased: ${weights.incomplete_purchased}`)
  }

  // Phone validity
  if (input.phone_validated && input.validation_status === 'valid') {
    score += weights.valid_phone
    reasons.push(`valid_phone: +${weights.valid_phone}`)
  } else if (input.validation_status === 'invalid') {
    score += weights.invalid_number
    reasons.push(`invalid_phone: ${weights.invalid_number}`)
  }

  // Email present
  if (input.email?.trim()) {
    score += weights.email_present
    reasons.push(`email_present: +${weights.email_present}`)
  }

  // Target geography
  if (input.geography) {
    const stateCode = input.geography.trim().toUpperCase()
    if (TARGET_STATES.includes(stateCode) || TARGET_STATES.some(s => input.geography?.toUpperCase().includes(s))) {
      score += weights.target_geography
      reasons.push(`target_geography: +${weights.target_geography}`)
    }
  }

  // Duplicate penalty
  if (input.is_duplicate) {
    score += weights.is_duplicate
    reasons.push(`is_duplicate: ${weights.is_duplicate}`)
  }

  // Personal line penalty
  if (input.line_type === 'mobile' || input.line_type === 'voip') {
    // Mobile is OK for business, VoIP gets small penalty
    if (input.line_type === 'voip') {
      score += Math.round(weights.personal_line / 2)
      reasons.push(`voip_line: ${Math.round(weights.personal_line / 2)}`)
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons }
}

/**
 * Determine priority tier from score.
 * Tier 1: 70–100 (high quality)
 * Tier 2: 40–69  (medium)
 * Tier 3: 0–39   (low)
 */
export function scoreToTier(score: number): PriorityTier {
  if (score >= 70) return 1
  if (score >= 40) return 2
  return 3
}

/**
 * Apply a post-call score adjustment based on disposition.
 */
const DISPOSITION_DELTAS: Record<string, number> = {
  transferred_live:   35,
  decision_maker:     30,
  send_link:          25,
  callback_requested: 20,
  interested:         15,
  wrong_number:      -25,
  bad_number:        -30,
  do_not_call:       -50,
  business_closed:   -20,
  voicemail:         -10,
  no_answer:          -5,
  gatekeeper:         -5,
  not_interested:    -10,
  personal_line:     -15,
}

export function dispositionScoreDelta(disposition: string): number {
  return DISPOSITION_DELTAS[disposition] ?? 0
}

/**
 * Re-score a batch of leads after a campaign run.
 * Returns updated leads with new scores and tiers.
 */
export function rescoreLeads(
  leads: Pick<VoiceLead, 'id' | 'lead_quality_score' | 'last_disposition' | 'call_attempt_count' | 'do_not_call'>[],
): Array<{ id: string; new_score: number; new_tier: PriorityTier; delta: number }> {
  return leads.map(lead => {
    let score = lead.lead_quality_score

    if (lead.do_not_call) return { id: lead.id, new_score: 0, new_tier: 3, delta: score * -1 }

    // Decay for repeated voicemails/no-answers
    if (lead.call_attempt_count > 2 && (!lead.last_disposition || lead.last_disposition === 'voicemail' || lead.last_disposition === 'no_answer')) {
      score = Math.max(0, score - 10)
    }

    const clamped = Math.max(0, Math.min(100, score))
    return {
      id:        lead.id,
      new_score: clamped,
      new_tier:  scoreToTier(clamped),
      delta:     clamped - lead.lead_quality_score,
    }
  })
}
