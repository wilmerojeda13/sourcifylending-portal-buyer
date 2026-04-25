import type { QualificationResult } from '@/types'

export interface ChatbotData {
  full_name?: string
  email?: string
  phone?: string
  business_name?: string
  business_age?: string
  monthly_revenue?: string
  credit_score_range?: string
  funding_goal?: string
  industry?: string
}

export function calculateChatbotScore(data: ChatbotData): QualificationResult {
  let score = 25 // Base score

  // Business age scoring
  if (data.business_age === '2+ years') {
    score += 25
  } else if (data.business_age === '1-2 years') {
    score += 15
  } else if (data.business_age === '6-12 months') {
    score += 8
  }

  // Monthly revenue scoring
  if (data.monthly_revenue === '$50k+') {
    score += 25
  } else if (data.monthly_revenue === '$15k-$50k') {
    score += 18
  } else if (data.monthly_revenue === '$5k-$15k') {
    score += 10
  }

  // Credit score range
  if (data.credit_score_range === '700+') {
    score += 25
  } else if (data.credit_score_range === '650-699') {
    score += 18
  } else if (data.credit_score_range === '580-649') {
    score += 8
  }

  // Funding goal (just presence matters)
  if (data.funding_goal) {
    score += 5
  }

  // Cap at 100
  score = Math.min(score, 100)

  // Determine status
  let status: 'Ready' | 'Conditionally Ready' | 'Not Ready'
  if (score >= 65) {
    status = 'Ready'
  } else if (score >= 40) {
    status = 'Conditionally Ready'
  } else {
    status = 'Not Ready'
  }

  // Build blockers
  const blockers: string[] = []
  if (!data.business_age || data.business_age === 'Less than 6 months') {
    blockers.push('Business is very new')
  }
  if (!data.monthly_revenue || data.monthly_revenue === '$0-$5k') {
    blockers.push('Monthly revenue is low')
  }
  if (!data.credit_score_range || data.credit_score_range === 'Under 580') {
    blockers.push('Credit score needs improvement')
  }

  // Build summary
  let summary = ''
  if (status === 'Ready') {
    summary = 'Your business profile looks like it may be ready for a funding strategy review.'
  } else if (status === 'Conditionally Ready') {
    summary = 'There may be funding paths available, but your profile may need more review first.'
  } else {
    summary = 'The best next step is to review your business profile and identify what needs to improve.'
  }

  return {
    readiness_status: status,
    readiness_score: score,
    summary,
    blockers: blockers.slice(0, 3),
  }
}
