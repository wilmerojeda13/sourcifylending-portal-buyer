// Chatbot step-by-step flow with proper state machine
import type { CollectedData } from '@/types'

export type ChatbotStep =
  | 'intro'
  | 'name'
  | 'email'
  | 'phone'
  | 'business_name'
  | 'business_age'
  | 'monthly_revenue'
  | 'credit_score'
  | 'funding_goal'
  | 'industry'
  | 'state'
  | 'business_credit'
  | 'bank_statements'
  | 'qualification'

export interface StepConfig {
  id: ChatbotStep
  botMessage: string
  quickReplies?: Array<{ label: string; value: string }>
  field?: keyof CollectedData
  validate?: (input: string) => { valid: boolean; value?: string | boolean; error?: string }
}

const STEPS: StepConfig[] = [
  {
    id: 'intro',
    botMessage:
      'Hi, I can help you see if SourcifyLending may be a fit and estimate your funding path. Want to check your options?',
    quickReplies: [
      { label: '✓ Check if I qualify', value: 'check_qualify' },
      { label: '💰 See pricing', value: 'see_pricing' },
      { label: '❓ How does it work?', value: 'how_works' },
      { label: '🚀 Start analyzer', value: 'start_analyzer' },
    ],
  },
  {
    id: 'name',
    botMessage: "What's your first and last name?",
    field: 'full_name',
    validate: (input) => {
      const trimmed = input.trim()
      if (trimmed.length < 2) {
        return { valid: false, error: 'Please enter at least 2 characters' }
      }
      return { valid: true, value: trimmed }
    },
  },
  {
    id: 'email',
    botMessage: 'What email should we use for your funding analysis?',
    field: 'email',
    validate: (input) => {
      const email = input.trim().toLowerCase()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return { valid: false, error: 'Please enter a valid email address' }
      }
      return { valid: true, value: email }
    },
  },
  {
    id: 'phone',
    botMessage: "What's the best phone number to reach you?",
    field: 'phone',
    validate: (input) => {
      const digits = input.replace(/\D/g, '')
      if (digits.length < 10) {
        return { valid: false, error: 'Please enter a valid 10-digit phone number' }
      }
      return { valid: true, value: digits.slice(-10) }
    },
  },
  {
    id: 'business_name',
    botMessage: "What's your business name?",
    field: 'business_name',
    validate: (input) => {
      const trimmed = input.trim()
      if (trimmed.length < 2) {
        return { valid: false, error: 'Please enter a business name' }
      }
      return { valid: true, value: trimmed }
    },
  },
  {
    id: 'business_age',
    botMessage: 'How long has the business been active?',
    quickReplies: [
      { label: 'Less than 6 months', value: 'less_6_months' },
      { label: '6-12 months', value: '6_12_months' },
      { label: '1-2 years', value: '1_2_years' },
      { label: '2+ years', value: '2_plus_years' },
    ],
    field: 'business_age',
    validate: (input) => {
      const lower = input.toLowerCase()
      const mapping: Record<string, string> = {
        less_6_months: 'Less than 6 months',
        '6_12_months': '6-12 months',
        '1_2_years': '1-2 years',
        '2_plus_years': '2+ years',
      }
      if (mapping[lower]) {
        return { valid: true, value: mapping[lower] }
      }
      // Allow free-form if it contains recognizable patterns
      if (lower.includes('6 month') || lower.includes('6month')) return { valid: true, value: 'Less than 6 months' }
      if (lower.includes('12 month') || lower.includes('1 year')) return { valid: true, value: '6-12 months' }
      if (lower.includes('2 year') || lower.includes('3 year')) return { valid: true, value: '1-2 years' }
      if (lower.includes('year') && (lower.includes('2') || lower.includes('3') || lower.includes('5')))
        return { valid: true, value: '2+ years' }
      return { valid: false, error: 'Please select a time range (e.g., "2 years")' }
    },
  },
  {
    id: 'monthly_revenue',
    botMessage: 'What is your average monthly business revenue?',
    quickReplies: [
      { label: '$0-$5k', value: '0_5k' },
      { label: '$5k-$15k', value: '5k_15k' },
      { label: '$15k-$50k', value: '15k_50k' },
      { label: '$50k+', value: '50k_plus' },
    ],
    field: 'monthly_revenue',
    validate: (input) => {
      const lower = input.toLowerCase()
      const mapping: Record<string, string> = {
        '0_5k': '$0-$5k',
        '5k_15k': '$5k-$15k',
        '15k_50k': '$15k-$50k',
        '50k_plus': '$50k+',
      }
      if (mapping[lower]) return { valid: true, value: mapping[lower] }
      // Try to parse dollar amounts
      const numberMatch = lower.match(/(\d+)[k]?/)
      if (numberMatch) {
        const num = parseInt(numberMatch[1])
        if (num <= 5) return { valid: true, value: '$0-$5k' }
        if (num <= 15) return { valid: true, value: '$5k-$15k' }
        if (num <= 50) return { valid: true, value: '$15k-$50k' }
        return { valid: true, value: '$50k+' }
      }
      return { valid: false, error: 'Please enter a revenue amount (e.g., "$5000" or "5k")' }
    },
  },
  {
    id: 'credit_score',
    botMessage: 'What is your estimated personal credit score range?',
    quickReplies: [
      { label: 'Under 580', value: 'under_580' },
      { label: '580-649', value: '580_649' },
      { label: '650-699', value: '650_699' },
      { label: '700+', value: '700_plus' },
    ],
    field: 'credit_score_range',
    validate: (input) => {
      const lower = input.toLowerCase()
      const mapping: Record<string, string> = {
        under_580: 'Under 580',
        '580_649': '580-649',
        '650_699': '650-699',
        '700_plus': '700+',
      }
      if (mapping[lower]) return { valid: true, value: mapping[lower] }
      // Try to parse scores
      const numberMatch = lower.match(/(\d{2,3})/)
      if (numberMatch) {
        const score = parseInt(numberMatch[1])
        if (score < 580) return { valid: true, value: 'Under 580' }
        if (score < 650) return { valid: true, value: '580-649' }
        if (score < 700) return { valid: true, value: '650-699' }
        return { valid: true, value: '700+' }
      }
      return { valid: false, error: 'Please enter a credit score range' }
    },
  },
  {
    id: 'funding_goal',
    botMessage: 'What funding amount are you trying to reach?',
    field: 'funding_goal',
    validate: (input) => {
      const trimmed = input.trim()
      const numberMatch = trimmed.match(/\d+/)
      if (!numberMatch) {
        return { valid: false, error: 'Please enter a dollar amount' }
      }
      return { valid: true, value: trimmed }
    },
  },
  {
    id: 'industry',
    botMessage: 'What industry is your business in?',
    field: 'industry',
    validate: (input) => {
      const trimmed = input.trim()
      if (trimmed.length < 2) {
        return { valid: false, error: 'Please enter an industry' }
      }
      return { valid: true, value: trimmed }
    },
  },
  {
    id: 'state',
    botMessage: 'What state is your business located in?',
    field: 'state',
    validate: (input) => {
      const upper = input.toUpperCase().trim()
      const states = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
      ]
      if (states.includes(upper)) {
        return { valid: true, value: upper }
      }
      return { valid: false, error: 'Please enter a valid 2-letter state code' }
    },
  },
  {
    id: 'business_credit',
    botMessage: 'Do you already have business credit accounts or trade lines?',
    quickReplies: [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
      { label: 'Not sure', value: 'not_sure' },
    ],
    field: 'has_business_credit',
    validate: (input) => {
      const lower = input.toLowerCase()
      if (lower === 'yes' || lower === 'y') return { valid: true, value: true }
      if (lower === 'no' || lower === 'n') return { valid: true, value: false }
      if (lower.includes('not sure')) return { valid: true, value: false }
      return { valid: false, error: 'Please answer yes or no' }
    },
  },
  {
    id: 'bank_statements',
    botMessage: 'Do you have recent business bank statements available?',
    quickReplies: [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ],
    field: 'has_bank_statements',
    validate: (input) => {
      const lower = input.toLowerCase()
      if (lower === 'yes' || lower === 'y') return { valid: true, value: true }
      if (lower === 'no' || lower === 'n') return { valid: true, value: false }
      return { valid: false, error: 'Please answer yes or no' }
    },
  },
]

export function getStep(id: ChatbotStep): StepConfig | undefined {
  return STEPS.find((s) => s.id === id)
}

export function getNextStep(currentStep: ChatbotStep): ChatbotStep | 'qualification' {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
  if (currentIndex === -1 || currentIndex === STEPS.length - 1) {
    return 'qualification'
  }
  return STEPS[currentIndex + 1].id
}

export function getStepIndex(step: ChatbotStep): number {
  return STEPS.findIndex((s) => s.id === step) + 1
}

export function getTotalSteps(): number {
  return STEPS.length
}
