interface LeadWithEligibility {
  id: string
  first_name: string
  last_name: string
  phone: string
  business_name?: string | null
  email?: string | null
  stage: string
  last_call_outcome?: string | null
  last_call_at?: string | null
  do_not_call: boolean
  is_archived: boolean
  callback_due_at?: string | null
  follow_up_at?: string | null
  eligibility: {
    is_eligible: boolean
    exclusion_reason?: string
    exclusion_type?: 'terminal_outcome' | 'do_not_call' | 'archived' | 'callback_pending' | 'follow_up_pending' | 'retry_cooldown'
    next_eligible_at?: string
  }
}
