import type { SupabaseClient } from '@supabase/supabase-js'

// Lead health scoring system
export interface LeadHealthScore {
  score: number
  tier: 1 | 2 | 3 | 4 | 5 // 1 = Best, 5 = Worst
  factors: {
    liveAnswers: number
    callbacks: number
    textReplies: number
    emailEngagement: number
    voicemails: number
    noAnswers: number
    failedCalls: number
    badNumberIndicators: number
    totalAttempts: number
    daysSinceLastContact: number
    daysSinceCreation: number
  }
  recommendations: string[]
}

export interface SmartLeadStatus {
  status: 'voicemail_heavy' | 'unresponsive' | 'bad_number' | 'retry_later' | 'dnc' | 'nurture' | 'active'
  confidence: number // 0-100
  reasons: string[]
  last_updated: string
  requires_review: boolean
}

export interface LeadAnalytics {
  total_calls: number
  answered_calls: number
  voicemail_count: number
  no_answer_count: number
  failed_calls: number
  bad_number_count: number
  wrong_number_count: number
  callback_count: number
  sms_sent_count: number
  sms_delivered_count: number
  sms_clicked_count: number
  sms_replies: number
  email_sent_count: number
  email_opens: number
  email_clicks: number
  last_contact_date: string | null
  last_call_date: string | null
  last_call_outcome: string | null
  days_since_last_contact: number
  days_since_creation: number
  consecutive_no_answers: number
  consecutive_voicemails: number
}

// Scoring weights
const SCORE_WEIGHTS = {
  liveAnswer: 15,
  callback: 10,
  textReply: 8,
  emailEngagement: 5,
  voicemail: -8,
  noAnswer: -5,
  failedCall: -15,
  badNumber: -30,
  daysSinceContact: -2, // per day
  recentActivity: 10, // if contacted within 7 days
} as const

// Status rules
const STATUS_RULES = {
  voicemail_heavy: {
    minVoicemails: 3,
    maxAnswers: 0,
    minDays: 7,
    maxDays: 14,
    confidence: 85,
  },
  unresponsive: {
    minAttempts: 5,
    maxAnswers: 0,
    maxCallbacks: 0,
    minDays: 7,
    confidence: 90,
  },
  bad_number: {
    minBadNumberIndicators: 1,
    confidence: 95,
  },
  retry_later: {
    minAttempts: 1,
    maxAttempts: 4,
    minDaysSinceContact: 3,
    confidence: 70,
  },
  nurture: {
    minAttempts: 3,
    maxBadNumberIndicators: 0,
    minDays: 14,
    confidence: 75,
  },
} as const

export async function calculateLeadAnalytics(
  supabase: SupabaseClient,
  leadId: string
): Promise<LeadAnalytics> {
  const now = new Date()
  
  // Get call history
  const { data: calls } = await supabase
    .from('crm_tasks')
    .select('*')
    .eq('lead_id', leadId)
    .eq('task_type', 'call')
    .order('created_at', { ascending: false })

  // Get SMS history
  const { data: sms } = await supabase
    .from('crm_lead_sms')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  // Get email history (if available)
  const { data: emails } = await supabase
    .from('crm_emails')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  // Get lead info
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`)
  }

  // Calculate call analytics
  const totalCalls = calls?.length || 0
  const answeredCalls = calls?.filter(c => c.call_outcome === 'decision_maker' || c.call_outcome === 'gatekeeper').length || 0
  const voicemailCount = calls?.filter(c => c.call_outcome === 'voicemail').length || 0
  const noAnswerCount = calls?.filter(c => c.call_outcome === 'no_answer').length || 0
  const failedCalls = calls?.filter(c => ['bad_number', 'wrong_number', 'business_closed'].includes(c.call_outcome || '')).length || 0
  const badNumberCount = calls?.filter(c => c.call_outcome === 'bad_number').length || 0
  const wrongNumberCount = calls?.filter(c => c.call_outcome === 'wrong_number').length || 0
  const callbackCount = calls?.filter(c => c.call_outcome === 'callback_requested').length || 0

  // Calculate SMS analytics
  const smsSentCount = sms?.filter(s => s.direction === 'outbound').length || 0
  const smsDeliveredCount = sms?.filter(s => s.status === 'delivered').length || 0
  const smsClickedCount = sms?.filter(s => s.clicked).length || 0
  const smsReplies = sms?.filter(s => s.direction === 'inbound').length || 0

  // Calculate email analytics
  const emailSentCount = emails?.length || 0
  const emailOpens = emails?.filter(e => e.opened_at).length || 0
  const emailClicks = emails?.filter(e => e.clicked_at).length || 0

  // Calculate dates
  const lastContactDate = lead.last_contacted_at ? new Date(lead.last_contacted_at) : null
  const lastCallDate = lead.last_call_at ? new Date(lead.last_call_at) : null
  const createdDate = new Date(lead.created_at)
  
  const daysSinceLastContact = lastContactDate ? Math.floor((now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24)) : 999
  const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))

  // Calculate consecutive patterns
  let consecutiveNoAnswers = 0
  let consecutiveVoicemails = 0
  
  const sortedCalls = (calls || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  
  for (const call of sortedCalls) {
    if (call.call_outcome === 'no_answer') {
      consecutiveNoAnswers++
    } else {
      break
    }
  }

  for (const call of sortedCalls) {
    if (call.call_outcome === 'voicemail') {
      consecutiveVoicemails++
    } else {
      break
    }
  }

  return {
    total_calls: totalCalls,
    answered_calls: answeredCalls,
    voicemail_count: voicemailCount,
    no_answer_count: noAnswerCount,
    failed_calls: failedCalls,
    bad_number_count: badNumberCount,
    wrong_number_count: wrongNumberCount,
    callback_count: callbackCount,
    sms_sent_count: smsSentCount,
    sms_delivered_count: smsDeliveredCount,
    sms_clicked_count: smsClickedCount,
    sms_replies: smsReplies,
    email_sent_count: emailSentCount,
    email_opens: emailOpens,
    email_clicks: emailClicks,
    last_contact_date: lastContactDate?.toISOString() || null,
    last_call_date: lastCallDate?.toISOString() || null,
    last_call_outcome: lead.last_call_outcome || null,
    days_since_last_contact: daysSinceLastContact,
    days_since_creation: daysSinceCreation,
    consecutive_no_answers: consecutiveNoAnswers,
    consecutive_voicemails: consecutiveVoicemails,
  }
}

export function calculateLeadHealthScore(analytics: LeadAnalytics): LeadHealthScore {
  let score = 50 // Start at neutral
  
  const factors = {
    liveAnswers: analytics.answered_calls * SCORE_WEIGHTS.liveAnswer,
    callbacks: analytics.callback_count * SCORE_WEIGHTS.callback,
    textReplies: analytics.sms_replies * SCORE_WEIGHTS.textReply,
    emailEngagement: (analytics.email_opens + analytics.email_clicks) * SCORE_WEIGHTS.emailEngagement,
    voicemails: analytics.voicemail_count * SCORE_WEIGHTS.voicemail,
    noAnswers: analytics.no_answer_count * SCORE_WEIGHTS.noAnswer,
    failedCalls: analytics.failed_calls * SCORE_WEIGHTS.failedCall,
    badNumberIndicators: (analytics.bad_number_count + analytics.wrong_number_count) * SCORE_WEIGHTS.badNumber,
    totalAttempts: analytics.total_calls,
    daysSinceLastContact: analytics.days_since_last_contact,
    daysSinceCreation: analytics.days_since_creation,
  }

  // Apply factors
  score += factors.liveAnswers
  score += factors.callbacks
  score += factors.textReplies
  score += factors.emailEngagement
  score += factors.voicemails
  score += factors.noAnswers
  score += factors.failedCalls
  score += factors.badNumberIndicators
  
  // Apply time-based factors
  score += Math.max(0, analytics.days_since_last_contact * SCORE_WEIGHTS.daysSinceContact)
  
  if (analytics.days_since_last_contact <= 7) {
    score += SCORE_WEIGHTS.recentActivityActivity
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score))

  // Determine tier
  let tier: 1 | 2 | 3 | 4 | 5
  if (score >= 80) tier = 1
  else if (score >= 60) tier = 2
  else if (score >= 40) tier = 3
  else if (score >= 20) tier = 4
  else tier = 5

  // Generate recommendations
  const recommendations: string[] = []
  
  if (analytics.bad_number_count > 0) {
    recommendations.push('Consider marking as bad number')
  }
  
  if (analytics.voicemail_count >= 3 && analytics.answered_calls === 0) {
    recommendations.push('High voicemail ratio - consider nurture campaign')
  }
  
  if (analytics.total_calls >= 5 && analytics.answered_calls === 0) {
    recommendations.push('Unresponsive - consider moving to nurture')
  }
  
  if (analytics.days_since_last_contact > 30 && analytics.total_calls < 3) {
    recommendations.push('Low contact frequency - consider retrying')
  }

  return {
    score,
    tier,
    factors,
    recommendations,
  }
}

export function determineSmartStatus(analytics: LeadAnalytics, healthScore: LeadHealthScore): SmartLeadStatus {
  const rules = STATUS_RULES
  
  // Check DNC first (explicit DNC should already be set on lead)
  if (analytics.bad_number_count > 0 || analytics.wrong_number_count > 0) {
    return {
      status: 'bad_number',
      confidence: rules.bad_number.confidence,
      reasons: [
        ...(analytics.bad_number_count > 0 ? [`${analytics.bad_number_count} bad number dispositions`] : []),
        ...(analytics.wrong_number_count > 0 ? [`${analytics.wrong_number_count} wrong number dispositions`] : []),
      ],
      last_updated: new Date().toISOString(),
      requires_review: false,
    }
  }

  // Check unresponsive
  if (analytics.total_calls >= rules.unresponsive.minAttempts &&
      analytics.answered_calls === 0 &&
      analytics.callback_count === 0 &&
      analytics.days_since_last_contact >= rules.unresponsive.minDays) {
    return {
      status: 'unresponsive',
      confidence: rules.unresponsive.confidence,
      reasons: [
        `${analytics.total_calls} total attempts with no live answers`,
        'No callbacks requested',
        `${analytics.days_since_last_contact} days since last contact`,
      ],
      last_updated: new Date().toISOString(),
      requires_review: false,
    }
  }

  // Check voicemail heavy
  if (analytics.voicemail_count >= rules.voicemail_heavy.minVoicemails &&
      analytics.answered_calls === 0 &&
      analytics.days_since_last_contact >= rules.voicemail_heavy.minDays &&
      analytics.days_since_last_contact <= rules.voicemail_heavy.maxDays) {
    return {
      status: 'voicemail_heavy',
      confidence: rules.voicemail_heavy.confidence,
      reasons: [
        `${analytics.voicemail_count} voicemail outcomes`,
        'No live answers',
        `${analytics.days_since_last_contact} days since last contact`,
      ],
      last_updated: new Date().toISOString(),
      requires_review: false,
    }
  }

  // Check nurture candidates
  if (analytics.total_calls >= rules.nurture.minAttempts &&
      analytics.bad_number_count === 0 &&
      analytics.wrong_number_count === 0 &&
      analytics.days_since_last_contact >= rules.nurture.minDays) {
    return {
      status: 'nurture',
      confidence: rules.nurture.confidence,
      reasons: [
        `${analytics.total_calls} attempts made`,
        'Not a bad number',
        `${analytics.days_since_last_contact} days since last contact`,
        'May respond to nurture campaign',
      ],
      last_updated: new Date().toISOString(),
      requires_review: true,
    }
  }

  // Check retry later
  if (analytics.total_calls >= rules.retry_later.minAttempts &&
      analytics.total_calls <= rules.retry_later.maxAttempts &&
      analytics.days_since_last_contact >= rules.retry_later.minDaysSinceContact) {
    return {
      status: 'retry_later',
      confidence: rules.retry_later.confidence,
      reasons: [
        `${analytics.total_calls} attempts made`,
        `${analytics.days_since_last_contact} days since last contact`,
        'Still within reasonable follow-up window',
      ],
      last_updated: new Date().toISOString(),
      requires_review: false,
    }
  }

  // Default to active
  return {
    status: 'active',
    confidence: 95,
    reasons: ['Lead shows normal activity patterns'],
    last_updated: new Date().toISOString(),
    requires_review: false,
  }
}
