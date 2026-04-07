// Dialer Eligibility Enforcement
// Terminal vs Non-terminal outcomes for dialer exclusion

export const TERMINAL_OUTCOMES = new Set([
  'Not Interested',
  'Do Not Call',
  'Wrong Number',
  'Bad Number',
  'Closed Lost',
  'Unqualified',
  'Business Closed',
  'Personal Line',
] as const)

export const NON_TERMINAL_OUTCOMES = new Set([
  'No Answer',
  'Voicemail',
  'Left Voicemail',
  'Callback Requested',
  'Call Back',
  'Call Back Later',
  'Follow Up',
  'Interested',
  'Booked Call',
  'Decision Maker',
  'Gatekeeper',
  'Send Link',
] as const)

export interface DialerEligibilityResult {
  is_eligible: boolean
  exclusion_reason?: string
  exclusion_type?: 'terminal_outcome' | 'do_not_call' | 'archived' | 'callback_pending' | 'follow_up_pending' | 'retry_cooldown'
  next_eligible_at?: string
  latest_disposition?: string
  latest_disposition_date?: string
}

/**
 * Determine if a lead is eligible for dialer based on latest disposition and other factors
 */
export function checkDialerEligibility(lead: {
  do_not_call: boolean
  is_archived: boolean
  last_call_outcome?: string | null
  last_call_at?: string | null
  callback_due_at?: string | null
  follow_up_at?: string | null
  stage?: string | null
}): DialerEligibilityResult {
  const now = new Date()

  // 1. Check DNC flag first
  if (lead.do_not_call) {
    return {
      is_eligible: false,
      exclusion_reason: 'Lead has Do Not Call flag',
      exclusion_type: 'do_not_call',
      latest_disposition: lead.last_call_outcome || undefined,
      latest_disposition_date: lead.last_call_at || undefined,
    }
  }

  // 2. Check archived status
  if (lead.is_archived) {
    return {
      is_eligible: false,
      exclusion_reason: 'Lead is archived',
      exclusion_type: 'archived',
      latest_disposition: lead.last_call_outcome || undefined,
      latest_disposition_date: lead.last_call_at || undefined,
    }
  }

  // 3. Check terminal outcomes
  if (lead.last_call_outcome && TERMINAL_OUTCOMES.has(lead.last_call_outcome as any)) {
    return {
      is_eligible: false,
      exclusion_reason: `Terminal outcome: ${lead.last_call_outcome}`,
      exclusion_type: 'terminal_outcome',
      latest_disposition: lead.last_call_outcome,
      latest_disposition_date: lead.last_call_at || undefined,
    }
  }

  // 4. Check callback due date (must wait for scheduled callbacks)
  if (lead.callback_due_at) {
    const callbackDue = new Date(lead.callback_due_at)
    if (callbackDue > now) {
      return {
        is_eligible: false,
        exclusion_reason: `Callback scheduled for ${callbackDue.toLocaleString()}`,
        exclusion_type: 'callback_pending',
        next_eligible_at: callbackDue.toISOString(),
        latest_disposition: lead.last_call_outcome || undefined,
        latest_disposition_date: lead.last_call_at || undefined,
      }
    }
  }

  // 5. Check follow-up due date (only block if in follow_up stage)
  if (lead.follow_up_at && lead.stage === 'follow_up') {
    const followUpDue = new Date(lead.follow_up_at)
    if (followUpDue > now) {
      return {
        is_eligible: false,
        exclusion_reason: `Follow-up scheduled for ${followUpDue.toLocaleString()}`,
        exclusion_type: 'follow_up_pending',
        next_eligible_at: followUpDue.toISOString(),
        latest_disposition: lead.last_call_outcome || undefined,
        latest_disposition_date: lead.last_call_at || undefined,
      }
    }
  }

  // 6. Check retry cooldown for non-terminal outcomes
  if (lead.last_call_at && lead.last_call_outcome && NON_TERMINAL_OUTCOMES.has(lead.last_call_outcome as any)) {
    const lastCallTime = new Date(lead.last_call_at)
    const cooldownHours = getRetryCooldownHours(lead.last_call_outcome)
    const nextEligibleAt = new Date(lastCallTime.getTime() + (cooldownHours * 60 * 60 * 1000))
    
    if (nextEligibleAt > now) {
      return {
        is_eligible: false,
        exclusion_reason: `Retry cooldown for ${lead.last_call_outcome} (${cooldownHours}h)`,
        exclusion_type: 'retry_cooldown',
        next_eligible_at: nextEligibleAt.toISOString(),
        latest_disposition: lead.last_call_outcome,
        latest_disposition_date: lead.last_call_at,
      }
    }
  }

  // Lead is eligible
  return {
    is_eligible: true,
    latest_disposition: lead.last_call_outcome || undefined,
    latest_disposition_date: lead.last_call_at || undefined,
  }
}

/**
 * Get retry cooldown hours for non-terminal outcomes
 */
function getRetryCooldownHours(outcome: string): number {
  switch (outcome) {
    case 'No Answer':
      return 4 // 4 hours
    case 'Voicemail':
    case 'Left Voicemail':
      return 24 // 24 hours (next day)
    case 'Callback Requested':
    case 'Call Back':
    case 'Call Back Later':
      return 2 // 2 hours (shorter for requested callbacks)
    case 'Interested':
    case 'Booked Call':
      return 1 // 1 hour (hot leads)
    case 'Decision Maker':
    case 'Gatekeeper':
      return 2 // 2 hours (reached right person)
    case 'Send Link':
      return 4 // 4 hours (information sent)
    default:
      return 4 // Default 4 hours
  }
}

/**
 * Update lead eligibility after disposition
 */
export interface LeadEligibilityUpdate {
  do_not_call?: boolean
  is_archived?: boolean
  stage?: string
  callback_due_at?: string | null
  follow_up_at?: string | null
  last_call_outcome?: string
  last_call_at?: string
}

/**
 * Apply disposition-based eligibility updates
 */
export function applyDispositionEligibilityUpdates(
  disposition: string,
  followUpAt?: string | null,
  callbackAt?: string | null
): Partial<LeadEligibilityUpdate> {
  const updates: Partial<LeadEligibilityUpdate> = {
    last_call_outcome: disposition,
    last_call_at: new Date().toISOString(),
  }

  // Handle terminal outcomes
  if (TERMINAL_OUTCOMES.has(disposition as any)) {
    switch (disposition) {
      case 'Do Not Call':
        updates.do_not_call = true
        break
      case 'Closed Lost':
      case 'Unqualified':
        updates.stage = 'closed_lost'
        break
      case 'Bad Number':
      case 'Wrong Number':
      case 'Business Closed':
      case 'Personal Line':
        updates.stage = 'closed_lost'
        break
      case 'Not Interested':
        updates.stage = 'closed_lost'
        break
    }
  }

  // Handle follow-up scheduling
  if (followUpAt) {
    updates.follow_up_at = followUpAt
    if (disposition === 'Booked Call') {
      updates.stage = 'demo_scheduled'
    } else if (disposition === 'Interested') {
      updates.stage = 'qualified'
    }
  }

  // Handle callback scheduling
  if (callbackAt) {
    updates.callback_due_at = callbackAt
  }

  return updates
}

/**
 * Check if a disposition should be treated as terminal for dialer exclusion
 */
export function isTerminalDisposition(disposition: string): boolean {
  return TERMINAL_OUTCOMES.has(disposition as any)
}

/**
 * Get human-readable exclusion reason
 */
export function getExclusionReasonText(result: DialerEligibilityResult): string {
  if (!result.exclusion_reason) return 'Lead is eligible for dialing'
  
  switch (result.exclusion_type) {
    case 'terminal_outcome':
      return `Removed from dialing - ${result.exclusion_reason}`
    case 'do_not_call':
      return `Do Not Call - ${result.exclusion_reason}`
    case 'archived':
      return `Archived - ${result.exclusion_reason}`
    case 'callback_pending':
      return `Callback Scheduled - ${result.exclusion_reason}`
    case 'follow_up_pending':
      return `Follow-up Scheduled - ${result.exclusion_reason}`
    case 'retry_cooldown':
      return `Retry Cooldown - ${result.exclusion_reason}`
    default:
      return result.exclusion_reason
  }
}
