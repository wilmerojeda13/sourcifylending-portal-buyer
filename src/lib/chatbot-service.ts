import type { CollectedData, QualificationResult, AnalyzerInput } from '@/types'
import { routeAnalyzer } from './program-router'

const LEAD_FIELD_KEYWORDS: Record<string, string[]> = {
  full_name: ['my name is', "i'm", 'im', 'name'],
  email: ['email', '@', 'email address'],
  phone: ['phone', 'number', 'call me'],
  business_name: ['business', 'company', 'called', 'name is'],
  business_age: ['years old', 'started', 'months old', 'founded', 'open for'],
  monthly_revenue: ['revenue', 'make', 'earn', 'sales', 'gross', 'monthly', '$'],
  credit_score_range: ['credit score', 'credit', 'score'],
  funding_goal: ['need', 'goal', 'looking for', 'amount'],
  industry: ['industry', 'business type', 'do you', 'we do'],
  state: ['state', 'located', 'based in'],
}

// Simple extraction - looks for keywords in user input
export function extractLeadData(
  input: string,
  existing: Partial<CollectedData>
): Partial<CollectedData> {
  const lower = input.toLowerCase()
  const extracted: Partial<CollectedData> = {}

  // Try to extract full_name
  if (!existing.full_name && (lower.includes('my name') || lower.includes("i'm"))) {
    const nameMatch = input.match(/(?:name|call|i'm|im|called)\s+([a-zA-Z\s]+)/i)
    if (nameMatch) {
      extracted.full_name = nameMatch[1].trim()
    }
  }

  // Try to extract email
  if (!existing.email) {
    const emailMatch = input.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i)
    if (emailMatch) {
      extracted.email = emailMatch[1]
    }
  }

  // Try to extract phone
  if (!existing.phone) {
    const phoneMatch = input.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})/g)
    if (phoneMatch) {
      extracted.phone = phoneMatch[0].replace(/\D/g, '')
    }
  }

  // Try to extract business_name
  if (!existing.business_name && lower.includes('business') && !lower.includes('business name')) {
    const businessMatch = input.match(/business(?:\s+(?:is|called|name|named)?\s+)?([a-zA-Z0-9&\s]+)/i)
    if (businessMatch) {
      extracted.business_name = businessMatch[1].trim()
    }
  }

  // Try to extract monthly_revenue
  if (!existing.monthly_revenue) {
    const revenueMatch = input.match(/\$?(\d+[kK]|\d+,\d+|\d{4,})/g)
    if (revenueMatch) {
      const lastNumber = revenueMatch[revenueMatch.length - 1]
      extracted.monthly_revenue = lastNumber
    }
  }

  // Try to extract funding_goal
  if (!existing.funding_goal) {
    const fundingMatch = input.match(/(?:need|looking for|goal|want)\s+\$?(\d+[kK]|\d+,\d+|\d{4,})/i)
    if (fundingMatch) {
      extracted.funding_goal = fundingMatch[1]
    }
  }

  // Try to extract state
  if (!existing.state) {
    const states = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    ]
    for (const state of states) {
      if (lower.includes(state.toLowerCase())) {
        extracted.state = state
        break
      }
    }
  }

  return extracted
}

// Check if we have enough data to qualify
export function hasEnoughDataToQualify(data: Partial<CollectedData>): boolean {
  return !!(
    data.full_name &&
    data.email &&
    data.business_name &&
    (data.monthly_revenue || data.business_age) &&
    (data.credit_score_range || data.funding_goal)
  )
}

// Run qualification using existing program-router logic
export function runQualification(data: Partial<CollectedData>): QualificationResult {
  // Map chatbot data to analyzer input format
  const analyzerInput: AnalyzerInput = {
    credit_score_range: (data.credit_score_range || 'Below 580') as any,
    utilization_range: '50-74%', // Default assumption
    business_age: (data.business_age || 'Less than 6 months') as any,
    monthly_revenue_range: (data.monthly_revenue || '$0-$2.5K') as any,
    monthly_deposit_range: '$0-$1K', // Default
    nsf_last_90_days: false, // Default to no NSF
    inquiry_count_last_90_days: '1-3', // Default assumption
    business_credit_reporting_status: 'no profile', // Default to no profile
    entity_type: 'LLC', // Default
    business_name: data.business_name || '',
    industry: data.industry || '',
    primary_goal: 'build_ein_credit', // Default
  }

  const analyzerResult = routeAnalyzer(analyzerInput)

  const score = analyzerResult.readiness_score
  const status = analyzerResult.readiness_status as 'Ready' | 'Conditionally Ready' | 'Not Ready'
  let summary = analyzerResult.summary
  if (!summary) {
    if (status === 'Ready') {
      summary = `Based on your profile (${score}/100), you may be a strong candidate for one of our programs.`
    } else if (status === 'Conditionally Ready') {
      summary = `Based on your profile (${score}/100), you may be a possible candidate. There are a few areas to strengthen.`
    } else {
      summary = `Based on your profile (${score}/100), you may need to strengthen your profile first. Let's find the best path forward.`
    }
  }
  const blockers = analyzerResult.top_blockers || []

  const fundingRange = analyzerResult.estimated_funding_range || '$0 - $5,000'
  const recommendedProgram = analyzerResult.assigned_program === 'program_a' ? 'A' : analyzerResult.assigned_program === 'program_b' ? 'B' : 'C'

  return {
    readiness_status: status,
    readiness_score: score,
    summary,
    funding_range: fundingRange,
    blockers,
    recommended_program: recommendedProgram as 'A' | 'B' | 'C',
  }
}

// Generate next question or result based on state
export function generateNextQuestion(
  data: Partial<CollectedData>,
  messageCount: number
): string {
  if (!data.full_name) {
    return "What's your name?"
  }

  if (!data.email) {
    return `Nice to meet you, ${data.full_name}! What's the best email to reach you?`
  }

  if (!data.phone) {
    return 'And your phone number?'
  }

  if (!data.business_name) {
    return "What's the name of your business?"
  }

  if (!data.business_age) {
    return 'How long has your business been operating? (e.g., "2 years", "6 months")'
  }

  if (!data.monthly_revenue) {
    return 'What is your approximate monthly business revenue? (e.g., "$5,000", "$50K")'
  }

  if (!data.credit_score_range) {
    return 'What is your personal credit score range? (e.g., "600-650", "720+")'
  }

  if (!data.industry) {
    return 'What industry is your business in? (e.g., "real estate", "consulting")'
  }

  if (!data.state) {
    return 'What state are you based in?'
  }

  if (!data.funding_goal) {
    return 'What is your funding goal? (e.g., "$25,000", "$100K")'
  }

  return "That's helpful! Let me analyze your profile..."
}

// Main API call wrapper
interface ChatResponse {
  message: string
  isComplete: boolean
  qualificationResult?: QualificationResult
}

export async function getChatbotResponse(
  userMessage: string,
  collectedData: Partial<CollectedData>,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<ChatResponse> {
  // Use scripted conversation flow (no API calls to save on token costs)
  const nextQuestion = generateNextQuestion(collectedData, conversationHistory.length)

  // Check if we have enough data to qualify
  const hasEnough = hasEnoughDataToQualify(collectedData)
  let qualResult: QualificationResult | undefined

  if (hasEnough) {
    qualResult = runQualification(collectedData)
  }

  return {
    message: nextQuestion,
    isComplete: hasEnough,
    qualificationResult: qualResult,
  }
}
