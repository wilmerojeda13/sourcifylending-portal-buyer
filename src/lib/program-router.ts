import type { AnalyzerInput, AnalyzerResult, ProgramId, ReadinessStatus } from '@/types'

type ScoreBand = {
  max: number
  range: string
}

type DimensionBreakdown = {
  key: string
  label: string
  points: number
  maxPoints: number
  blocker: string
}

const FUNDING_RANGE_BANDS: ScoreBand[] = [
  { max: 24, range: '$0 - $5,000' },
  { max: 39, range: '$5,000 - $10,000' },
  { max: 54, range: '$10,000 - $20,000' },
  { max: 69, range: '$20,000 - $40,000' },
  { max: 84, range: '$40,000 - $75,000' },
  { max: 100, range: '$75,000 - $150,000+' },
]

const DISCLAIMER = 'Final approvals depend on lender criteria and full underwriting.'

function scoreCredit(input: AnalyzerInput): DimensionBreakdown {
  const label = 'Personal credit'
  const creditMap: Record<string, number> = {
    '720+': 30,
    '700-719': 28,
    '680-699': 24,
    '660-679': 20,
    '640-659': 16,
    '620-639': 12,
    '580-619': 6,
    'Below 580': 2,
  }

  const utilizationPenalty: Record<string, number> = {
    '0-9%': 0,
    '10-29%': 2,
    '30-49%': 5,
    '50-74%': 8,
    '75%+': 12,
  }

  const base = creditMap[input.credit_score_range] ?? 8
  const penalty = utilizationPenalty[input.utilization_range] ?? 4
  const points = Math.max(0, Math.min(30, base - penalty))

  let blocker = 'Personal credit profile needs strengthening'
  if (points <= 8) blocker = 'Weak personal credit profile'
  else if (penalty >= 8) blocker = 'High personal credit utilization'
  else if (points <= 16) blocker = 'Personal credit profile is only moderately fundable'

  return { key: 'credit', label, points, maxPoints: 30, blocker }
}

function scoreBusinessAge(input: AnalyzerInput): DimensionBreakdown {
  const label = 'Business age'
  const ageMap: Record<string, number> = {
    '5+ years': 20,
    '2-5 years': 17,
    '1-2 years': 12,
    '6-12 months': 7,
    'Less than 6 months': 2,
  }

  const points = ageMap[input.business_age] ?? 5
  let blocker = 'Limited business history'
  if (input.business_age === 'Less than 6 months') blocker = 'Startup business timeline limits approvals'
  else if (input.business_age === '6-12 months') blocker = 'Business history is still thin'

  return { key: 'business_age', label, points, maxPoints: 20, blocker }
}

function scoreRevenue(input: AnalyzerInput): DimensionBreakdown {
  const label = 'Revenue profile'
  const revenueMap: Record<string, number> = {
    '$100,000+': 18,
    '$50,000 - $100,000': 16,
    '$25,000 - $50,000': 13,
    '$10,000 - $25,000': 10,
    '$2,500 - $10,000': 6,
    '$0 - $2,500': 2,
  }

  let points = revenueMap[input.monthly_revenue_range] ?? 4
  if (input.nsf_last_90_days) {
    points = Math.max(0, points - 4)
  }

  let blocker = 'Revenue profile needs to be stronger'
  if (input.nsf_last_90_days) blocker = 'Recent NSF or overdraft activity'
  else if (points <= 4) blocker = 'Low monthly revenue profile'
  else if (points <= 8) blocker = 'Revenue consistency is still moderate'

  return { key: 'revenue', label, points, maxPoints: 18, blocker }
}

function scoreCreditDepth(input: AnalyzerInput): DimensionBreakdown {
  const label = 'Business credit depth'
  const profileMap: Record<string, number> = {
    strong_profile: 12,
    some_reporting: 8,
    thin_profile: 4,
    no_profile: 1,
  }

  const points = profileMap[input.business_credit_reporting_status] ?? 3
  let blocker = 'Business credit depth is limited'
  if (input.business_credit_reporting_status === 'no_profile') blocker = 'No business credit profile established'
  else if (input.business_credit_reporting_status === 'thin_profile') blocker = 'Low credit depth under the EIN'

  return { key: 'credit_depth', label, points, maxPoints: 12, blocker }
}

function scoreInquiries(input: AnalyzerInput): DimensionBreakdown {
  const label = 'Recent inquiries'
  const inquiryMap: Record<string, number> = {
    '0': 10,
    '1-2': 8,
    '3-5': 5,
    '6-9': 2,
    '10+': 0,
  }

  const points = inquiryMap[input.inquiry_count_last_90_days] ?? 4
  let blocker = 'Recent inquiry activity should be lower'
  if (input.inquiry_count_last_90_days === '6-9' || input.inquiry_count_last_90_days === '10+') {
    blocker = 'High inquiry activity in the last 90 days'
  }

  return { key: 'inquiries', label, points, maxPoints: 10, blocker }
}

function scoreLegitimacy(input: AnalyzerInput): DimensionBreakdown {
  const label = 'Business legitimacy'
  const entityPoints = ['LLC', 'S-Corporation', 'C-Corporation'].includes(input.entity_type) ? 4 : 1
  const hasBusinessName = input.business_name.trim().length > 0 ? 2 : 0
  const hasIndustry = input.industry.trim().length > 0 ? 2 : 0
  const goalPoints = input.primary_goal === 'stay_ready' ? 2 : input.primary_goal === 'build_ein_credit' ? 1 : 0

  let points = entityPoints + hasBusinessName + hasIndustry + goalPoints
  if (input.nsf_last_90_days) {
    points = Math.max(0, points - 2)
  }

  let blocker = 'Business legitimacy signals can be improved'
  if (input.nsf_last_90_days) blocker = 'Business banking activity needs to stabilize'
  else if (entityPoints <= 1) blocker = 'Entity structure is less fundable than an LLC or corporation'
  else if (points <= 5) blocker = 'Business profile looks only partially established'

  return { key: 'legitimacy', label, points, maxPoints: 10, blocker }
}

function getFundingRange(score: number): string {
  return FUNDING_RANGE_BANDS.find((band) => score <= band.max)?.range ?? '$0 - $5,000'
}

function getReadinessStatus(score: number): ReadinessStatus {
  if (score >= 70) return 'Ready'
  if (score >= 40) return 'Conditionally Ready'
  return 'Not Ready'
}

function getProgramRecommendation(
  input: AnalyzerInput,
  score: number,
  blockers: string[],
): ProgramId {
  const weakFoundation = score < 40 || blockers.some((blocker) =>
    blocker.includes('NSF') ||
    blocker.includes('banking') ||
    blocker.includes('Weak personal credit') ||
    blocker.includes('Startup business')
  )

  if (weakFoundation) return 'program_b'

  const wantsCards = input.primary_goal === 'business_cards'
  const hasStrongCardProfile =
    score >= 70 &&
    ['720+', '700-719', '680-699'].includes(input.credit_score_range) &&
    ['0-9%', '10-29%'].includes(input.utilization_range) &&
    ['0', '1-2'].includes(input.inquiry_count_last_90_days) &&
    !input.nsf_last_90_days

  if (wantsCards && hasStrongCardProfile) return 'program_a'
  if (score >= 55 && input.primary_goal === 'stay_ready') return 'program_c'
  if (score >= 60 && input.business_credit_reporting_status === 'strong_profile') return 'program_a'
  if (score >= 45 && input.primary_goal === 'stay_ready') return 'program_c'
  return 'program_b'
}

function buildRiskFlags(input: AnalyzerInput, blockers: string[]): string[] {
  const flags: string[] = []

  if (input.nsf_last_90_days) {
    flags.push('NSF or overdraft activity reported in the last 90 days')
  }

  if (['Below 580', '580-619', '620-639'].includes(input.credit_score_range)) {
    flags.push('Personal credit score is below the strongest funding tiers')
  }

  if (['50-74%', '75%+'].includes(input.utilization_range)) {
    flags.push('High personal credit utilization may suppress approvals')
  }

  if (['6-9', '10+'].includes(input.inquiry_count_last_90_days)) {
    flags.push('Recent hard inquiry activity is elevated')
  }

  if (input.business_credit_reporting_status === 'no_profile') {
    flags.push('No business credit profile is established yet')
  }

  if (['Less than 6 months', '6-12 months'].includes(input.business_age)) {
    flags.push('Short time in business limits lender confidence')
  }

  if (!['LLC', 'S-Corporation', 'C-Corporation'].includes(input.entity_type)) {
    flags.push('Current entity structure may be less favorable for funding')
  }

  for (const blocker of blockers) {
    if (!flags.includes(blocker)) {
      flags.push(blocker)
    }
  }

  return flags.slice(0, 6)
}

function getRecommendedNextStep(program: ProgramId, fundingRange: string): string {
  if (program === 'program_a') {
    return `Complete underwriting inside Program A to confirm your exact funding amount and structure a card strategy around your ${fundingRange} estimate.`
  }

  if (program === 'program_b') {
    return 'Start Program B to strengthen your profile, improve your fundability, and build toward higher approval ranges.'
  }

  return 'Use Program C to monitor your profile, stay funding-ready, and tighten the areas lenders will review first.'
}

function getUpgradeCta(program: ProgramId): string {
  if (program === 'program_a') return 'Start Program A Underwriting'
  if (program === 'program_b') return 'Start Program B to Build Your Profile'
  return 'Start Program C Monitoring'
}

function buildSummary(
  input: AnalyzerInput,
  readinessStatus: ReadinessStatus,
  fundingRange: string,
  recommendedNextStep: string,
): string {
  const name = input.business_name || 'your profile'
  return `Based on ${name}, you may be eligible for an estimated funding range of ${fundingRange}. ${recommendedNextStep}`
}

function buildRecommendation(program: ProgramId, score: number): string {
  if (program === 'program_a') {
    return score >= 85
      ? 'Your profile is strong enough to move into Program A for underwriting and approval strategy.'
      : 'Program A is the best next fit because your current profile is within funding range, but underwriting should validate the final approval path.'
  }

  if (program === 'program_b') {
    return score < 40
      ? 'Program B is recommended because your foundation needs improvement before pursuing larger funding approvals.'
      : 'Program B is recommended to deepen your business profile and improve your odds of stronger future approvals.'
  }

  return 'Program C is recommended to help you stay execution-ready while monitoring the profile factors lenders care about most.'
}

export function routeAnalyzer(input: AnalyzerInput): AnalyzerResult {
  const dimensions = [
    scoreCredit(input),
    scoreBusinessAge(input),
    scoreRevenue(input),
    scoreCreditDepth(input),
    scoreInquiries(input),
    scoreLegitimacy(input),
  ]

  const readinessScore = dimensions.reduce((sum, dimension) => sum + dimension.points, 0)
  const readinessStatus = getReadinessStatus(readinessScore)
  const estimatedFundingRange = getFundingRange(readinessScore)

  const topBlockers = [...dimensions]
    .sort((a, b) => {
      const deficitA = a.maxPoints - a.points
      const deficitB = b.maxPoints - b.points
      return deficitB - deficitA
    })
    .filter((dimension) => dimension.maxPoints - dimension.points > 0)
    .slice(0, 3)
    .map((dimension) => dimension.blocker)

  const assignedProgram = getProgramRecommendation(input, readinessScore, topBlockers)
  const recommendedNextStep = getRecommendedNextStep(assignedProgram, estimatedFundingRange)
  const recommendation = buildRecommendation(assignedProgram, readinessScore)
  const summary = buildSummary(input, readinessStatus, estimatedFundingRange, recommendedNextStep)
  const riskFlags = buildRiskFlags(input, topBlockers)

  return {
    readiness_status: readinessStatus,
    readiness_score: readinessScore,
    estimated_funding_range: estimatedFundingRange,
    assigned_program: assignedProgram,
    risk_flags: riskFlags,
    top_blockers: topBlockers,
    summary,
    recommendation,
    recommended_next_step: recommendedNextStep,
    upgrade_cta: getUpgradeCta(assignedProgram),
    disclaimer: DISCLAIMER,
  }
}
