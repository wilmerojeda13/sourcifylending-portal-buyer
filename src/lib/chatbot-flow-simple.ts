export type ChatbotStep =
  | 'welcome'
  | 'pricing'
  | 'how_it_works'
  | 'name'
  | 'contact'
  | 'business'
  | 'business_age'
  | 'revenue'
  | 'credit'
  | 'funding_goal'
  | 'industry'
  | 'result'

export interface StepConfig {
  id: ChatbotStep
  botMessage: string
  quickReplies?: Array<{ label: string; value: string }>
  inputType?: 'text' | 'combined'
  field?: string
}

const STEPS: StepConfig[] = [
  {
    id: 'welcome',
    botMessage: 'Hi — I can help you check if SourcifyLending may be a fit for your funding goals.',
    quickReplies: [
      { label: 'Check my options', value: 'start_check' },
      { label: 'See pricing', value: 'pricing' },
      { label: 'How it works', value: 'how_it_works' },
    ],
  },
  {
    id: 'pricing',
    botMessage: 'SourcifyLending has program options based on your business profile and funding goals. The best next step is a quick readiness check so we can point you to the right path.',
    quickReplies: [
      { label: 'Check my options', value: 'start_check' },
      { label: 'Open free analyzer', value: 'go_analyzer' },
    ],
  },
  {
    id: 'how_it_works',
    botMessage: 'We review your business profile, credit position, revenue, and funding goal. Then we guide you toward the best next step to improve funding readiness.',
    quickReplies: [
      { label: 'Check my options', value: 'start_check' },
      { label: 'Open free analyzer', value: 'go_analyzer' },
    ],
  },
  {
    id: 'name',
    botMessage: "What's your name?",
    inputType: 'text',
    field: 'full_name',
  },
  {
    id: 'contact',
    botMessage: "What's the best email and phone number for your results?",
    inputType: 'combined',
    field: 'contact',
  },
  {
    id: 'business',
    botMessage: "What's your business name?",
    inputType: 'text',
    field: 'business_name',
  },
  {
    id: 'business_age',
    botMessage: 'How long has the business been active?',
    quickReplies: [
      { label: 'Less than 6 months', value: 'Less than 6 months' },
      { label: '6-12 months', value: '6-12 months' },
      { label: '1-2 years', value: '1-2 years' },
      { label: '2+ years', value: '2+ years' },
    ],
    field: 'business_age',
  },
  {
    id: 'revenue',
    botMessage: 'About how much monthly revenue does the business have?',
    quickReplies: [
      { label: '$0-$5k', value: '$0-$5k' },
      { label: '$5k-$15k', value: '$5k-$15k' },
      { label: '$15k-$50k', value: '$15k-$50k' },
      { label: '$50k+', value: '$50k+' },
    ],
    field: 'monthly_revenue',
  },
  {
    id: 'credit',
    botMessage: "What's your estimated personal credit score?",
    quickReplies: [
      { label: 'Under 580', value: 'Under 580' },
      { label: '580-649', value: '580-649' },
      { label: '650-699', value: '650-699' },
      { label: '700+', value: '700+' },
    ],
    field: 'credit_score_range',
  },
  {
    id: 'funding_goal',
    botMessage: 'How much funding are you trying to get?',
    inputType: 'text',
    field: 'funding_goal',
  },
  {
    id: 'industry',
    botMessage: 'What industry are you in?',
    inputType: 'text',
    field: 'industry',
  },
  {
    id: 'result',
    botMessage: "Thanks. I'll summarize your funding readiness now.",
  },
]

export function getStep(id: ChatbotStep): StepConfig | undefined {
  return STEPS.find((s) => s.id === id)
}

export function getNextStep(currentStep: ChatbotStep): ChatbotStep | 'complete' {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
  if (currentIndex === -1 || currentIndex === STEPS.length - 1) {
    return 'complete'
  }
  return STEPS[currentIndex + 1].id
}

export function getProgressPercent(step: ChatbotStep): number {
  const steps = ['welcome', 'name', 'contact', 'business', 'business_age', 'revenue', 'credit', 'funding_goal', 'industry']
  const index = steps.indexOf(step as any)
  return index === -1 ? 0 : Math.round(((index + 1) / steps.length) * 100)
}
