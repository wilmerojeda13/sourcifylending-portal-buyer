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

export const CALLBACK_OUTCOMES = new Set([
  'Call Back',
  'Call Back Later',
] as const)

export const FOLLOW_UP_OUTCOMES = new Set([
  'Follow Up',
] as const)

export const RETRY_OUTCOMES = new Set([
  'No Answer',
  'Voicemail',
  'Left Voicemail',
  'Busy',
] as const)

export type DialerQueueFilter =
  | 'new'
  | 'contacted'
  | 'interested'
  | 'callback'
  | 'follow_up'
  | 'qualified'
  | 'demo_held'
  | 'active_client'
  | 'closed_lost'

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

  // 4. Callback queue entries only re-enter when their callback time is due.
  if (lead.last_call_outcome && CALLBACK_OUTCOMES.has(lead.last_call_outcome as any)) {
    const callbackDue = lead.callback_due_at ? new Date(lead.callback_due_at) : null
    if (callbackDue && callbackDue > now) {
      return {
        is_eligible: false,
        exclusion_reason: `Callback scheduled for ${callbackDue.toLocaleString()}`,
        exclusion_type: 'callback_pending',
        next_eligible_at: callbackDue.toISOString(),
        latest_disposition: lead.last_call_outcome,
        latest_disposition_date: lead.last_call_at || undefined,
      }
    }
  }

  // 5. Follow-up queue entries only re-enter when their follow-up time is due.
  if (lead.last_call_outcome && FOLLOW_UP_OUTCOMES.has(lead.last_call_outcome as any)) {
    const followUpDue = lead.follow_up_at ? new Date(lead.follow_up_at) : null
    if (followUpDue && followUpDue > now) {
      return {
        is_eligible: false,
        exclusion_reason: `Follow-up scheduled for ${followUpDue.toLocaleString()}`,
        exclusion_type: 'follow_up_pending',
        next_eligible_at: followUpDue.toISOString(),
        latest_disposition: lead.last_call_outcome,
        latest_disposition_date: lead.last_call_at || undefined,
      }
    }
  }

  // 6. Retry outcomes only re-enter when the retry time is due.
  if (lead.last_call_outcome && RETRY_OUTCOMES.has(lead.last_call_outcome as any)) {
    const retryDue = lead.follow_up_at ? new Date(lead.follow_up_at) : null

    if (retryDue && retryDue > now) {
      return {
        is_eligible: false,
        exclusion_reason: `Retry scheduled for ${retryDue.toLocaleString()}`,
        exclusion_type: 'retry_cooldown',
        next_eligible_at: retryDue.toISOString(),
        latest_disposition: lead.last_call_outcome,
        latest_disposition_date: lead.last_call_at || undefined,
      }
    }
  }

  // 7. Backward-compatible cooldown if older rows do not yet have an explicit due timestamp.
  if (lead.last_call_at && lead.last_call_outcome && NON_TERMINAL_OUTCOMES.has(lead.last_call_outcome as any)) {
    const lastCallTime = new Date(lead.last_call_at)
    const cooldownHours = getRetryCooldownHours(lead.last_call_outcome)
    const nextEligibleAt = new Date(lastCallTime.getTime() + (cooldownHours * 60 * 60 * 1000))

    const hasExplicitDueAt =
      (CALLBACK_OUTCOMES.has(lead.last_call_outcome as any) && Boolean(lead.callback_due_at)) ||
      ((FOLLOW_UP_OUTCOMES.has(lead.last_call_outcome as any) || RETRY_OUTCOMES.has(lead.last_call_outcome as any)) && Boolean(lead.follow_up_at))

    if (!hasExplicitDueAt && nextEligibleAt > now) {
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
  appointment_at?: string | null
  last_call_outcome?: string
  last_call_at?: string
}

/**
 * Apply disposition-based eligibility updates
 */
export function applyDispositionEligibilityUpdates(
  disposition: string,
  followUpAt?: string | null,
  callbackAt?: string | null,
  appointmentAt?: string | null,
): Partial<LeadEligibilityUpdate> {
  const updates: Partial<LeadEligibilityUpdate> = {
    last_call_outcome: disposition,
    last_call_at: new Date().toISOString(),
  }

  // Handle terminal outcomes
  if (TERMINAL_OUTCOMES.has(disposition as any)) {
    updates.callback_due_at = null
    updates.follow_up_at = null

    switch (disposition) {
      case 'Do Not Call':
      case 'Not Interested':
      case 'Bad Number':
        updates.do_not_call = true
        updates.stage = 'closed_lost'
        break
      case 'Closed Lost':
      case 'Unqualified':
      case 'Wrong Number':
      case 'Business Closed':
      case 'Personal Line':
        updates.stage = 'closed_lost'
        break
    }
  }

  if (disposition === 'Interested') {
    updates.stage = 'interested'
  }

  if (disposition === 'Appointment Set' || disposition === 'Booked Call') {
    updates.stage = 'qualified'
  }

  if (CALLBACK_OUTCOMES.has(disposition as any)) {
    updates.callback_due_at = callbackAt ?? followUpAt ?? null
    updates.follow_up_at = null
  } else if (FOLLOW_UP_OUTCOMES.has(disposition as any) || RETRY_OUTCOMES.has(disposition as any)) {
    updates.follow_up_at = followUpAt ?? callbackAt ?? null
    updates.callback_due_at = null
  }

  if (disposition === 'Appointment Set') {
    updates.callback_due_at = null
    updates.follow_up_at = null
    updates.appointment_at = appointmentAt ?? null
  }

  return updates
}

/**
 * Check if a disposition should be treated as terminal for dialer exclusion
 */
export function isTerminalDisposition(disposition: string): boolean {
  return TERMINAL_OUTCOMES.has(disposition as any)
}

export function matchesDialerQueueFilter(
  lead: {
    do_not_call?: boolean
    is_archived?: boolean
    last_call_outcome?: string | null
    last_call_at?: string | null
    callback_due_at?: string | null
    follow_up_at?: string | null
    stage?: string | null
  },
  queue: DialerQueueFilter | null | undefined,
  nowIso = new Date().toISOString(),
) {
  switch (queue) {
    case 'new':
    case 'contacted':
    case 'interested':
    case 'callback':
    case 'follow_up':
    case 'qualified':
    case 'demo_held':
    case 'active_client':
    case 'closed_lost':
      return lead.stage === queue
    default:
      return true
  }
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
      return `Unknown exclusion: ${result.exclusion_reason || 'No reason provided'}`
  }
}
