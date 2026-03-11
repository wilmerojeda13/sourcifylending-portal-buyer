import type { AnalyzerInput, AnalyzerResult, ProgramId, ReadinessStatus } from '@/types'

// ─── Hard Stop Detection ───────────────────────────────────────────────────────
function detectHardStops(input: AnalyzerInput): string[] {
  const flags: string[] = []

  if (input.nsf_last_90_days) {
    flags.push('NSF/overdraft activity in the last 90 days detected')
  }

  const highUtilization = ['75-99%', '100%+', '75%+']
  if (highUtilization.some((u) => input.utilization_range?.includes(u))) {
    flags.push('Personal credit utilization at 75% or higher')
  }

  const highInquiries = ['6-9', '10+', '6+']
  if (highInquiries.some((i) => input.inquiry_count_last_90_days?.includes(i))) {
    flags.push('6 or more credit inquiries in the last 90 days')
  }

  return flags
}

// ─── Risk Flag Detection ──────────────────────────────────────────────────────
function detectRiskFlags(input: AnalyzerInput): string[] {
  const flags: string[] = []

  const lowScores = ['below 580', '580-619', '500-579', 'Below 580']
  if (lowScores.some((s) => input.credit_score_range?.includes(s))) {
    flags.push('Personal credit score below recommended threshold (620+)')
  }

  const highUtil = ['50-74%', '75-99%', '75%+', '100%+']
  if (highUtil.some((u) => input.utilization_range?.includes(u))) {
    flags.push('High personal credit utilization may impact card approvals')
  }

  const highInq = ['4-5', '6-9', '10+']
  if (highInq.some((i) => input.inquiry_count_last_90_days?.includes(i))) {
    flags.push('Elevated inquiry count may trigger lender caution')
  }

  if (input.business_credit_reporting_status === 'no_profile') {
    flags.push('No business credit profile established yet')
  }

  const shortAge = ['less than 6 months', '0-6 months', '6-12 months']
  if (shortAge.some((a) => input.business_age?.toLowerCase().includes(a.split(' ')[0]))) {
    flags.push('Business age under 1 year — limited credit history')
  }

  if (!['llc', 'corporation', 'corp', 's-corp', 'c-corp'].some((e) =>
    input.entity_type?.toLowerCase().includes(e)
  )) {
    flags.push('Entity type may not be optimal for business credit')
  }

  return flags
}

// ─── Program Router ───────────────────────────────────────────────────────────
function routeToProgram(input: AnalyzerInput, hardStops: string[]): ProgramId {
  // Hard stops → Program C (monitoring) unless clearly fixable
  if (hardStops.length > 0) {
    return 'program_c'
  }

  const goal = input.primary_goal

  // Program A: Business credit cards + strong personal credit
  if (goal === 'business_cards') {
    const strongScores = ['720+', '700-719', '680-699']
    const hasStrongCredit = strongScores.some((s) => input.credit_score_range?.includes(s))
    const lowUtil = ['0-9%', '10-29%', '0-29%']
    const hasLowUtil = lowUtil.some((u) => input.utilization_range?.includes(u))

    if (hasStrongCredit && hasLowUtil) return 'program_a'
    // Marginal → conditionally A if credit is decent
    const okScores = ['660-679', '640-659', '620-639']
    if (okScores.some((s) => input.credit_score_range?.includes(s))) return 'program_a'
    return 'program_b' // Not ready for cards, build first
  }

  // Program B: Build business credit under EIN
  if (goal === 'build_ein_credit') {
    return 'program_b'
  }

  // Program C: Stay ready / monitoring
  if (goal === 'stay_ready') {
    return 'program_c'
  }

  // Default fallback
  return 'program_b'
}

// ─── Readiness Calculator ─────────────────────────────────────────────────────
function calculateReadiness(
  input: AnalyzerInput,
  hardStops: string[],
  riskFlags: string[]
): ReadinessStatus {
  if (hardStops.length > 0) return 'Not Ready'

  const strongScores = ['720+', '700-719', '680-699', '660-679']
  const hasGoodCredit = strongScores.some((s) => input.credit_score_range?.includes(s))
  const lowUtil = ['0-9%', '10-29%']
  const hasLowUtil = lowUtil.some((u) => input.utilization_range?.includes(u))
  const lowInq = ['0', '1-2', '1-3']
  const hasLowInq = lowInq.some((i) => input.inquiry_count_last_90_days?.includes(i))
  const hasEntity = ['llc', 'corporation', 's-corp', 'c-corp'].some((e) =>
    input.entity_type?.toLowerCase().includes(e)
  )

  if (hasGoodCredit && hasLowUtil && hasLowInq && hasEntity && riskFlags.length <= 1) {
    return 'Ready'
  }

  if (riskFlags.length >= 3) return 'Not Ready'

  return 'Conditionally Ready'
}

// ─── Summary Generator ────────────────────────────────────────────────────────
function generateSummary(
  input: AnalyzerInput,
  program: ProgramId,
  readiness: ReadinessStatus,
  hardStops: string[]
): { summary: string; recommendation: string } {
  const programNames: Record<ProgramId, string> = {
    program_a: '0% Intro APR Card Strategy',
    program_b: 'Business Credit Builder',
    program_c: 'Capital Monitoring Membership',
  }

  const summaries: Record<ReadinessStatus, string> = {
    Ready:
      `${input.business_name || 'Your business'} shows strong readiness indicators. ` +
      `Your credit profile, utilization, and business foundation align well for the ${programNames[program]} program.`,
    'Conditionally Ready':
      `${input.business_name || 'Your business'} has a solid base but a few areas need attention before moving forward. ` +
      `With the right guidance, you can address these gaps and unlock better financing options.`,
    'Not Ready':
      `${input.business_name || 'Your business'} currently has one or more factors that would limit approval success. ` +
      `The ${programNames[program]} program will help you address these issues systematically.`,
  }

  const recommendations: Record<ProgramId, string> = {
    program_a:
      'Based on your profile, you qualify for our 0% Intro APR Card Strategy. This program targets 0% introductory APR business credit cards to maximize your access to low-cost capital.',
    program_b:
      'Based on your profile, the Business Credit Builder is your best path forward. This program establishes your business credit under your EIN through a structured tradeline-building sequence.',
    program_c:
      hardStops.length > 0
        ? 'Based on your current profile, the Capital Monitoring Membership will help you address the flagged issues, stabilize your credit position, and prepare you for a stronger program later.'
        : 'Based on your goals, the Capital Monitoring Membership provides monthly oversight, proactive alerts, and strategic guidance to keep your credit profile funding-ready.',
  }

  return {
    summary: summaries[readiness],
    recommendation: recommendations[program],
  }
}

// ─── Main Router Function ─────────────────────────────────────────────────────
export function routeAnalyzer(input: AnalyzerInput): AnalyzerResult {
  const hardStops = detectHardStops(input)
  const riskFlags = [...hardStops, ...detectRiskFlags(input)]
  const assignedProgram = routeToProgram(input, hardStops)
  const readinessStatus = calculateReadiness(input, hardStops, riskFlags)
  const { summary, recommendation } = generateSummary(input, assignedProgram, readinessStatus, hardStops)

  return {
    readiness_status: readinessStatus,
    assigned_program: assignedProgram,
    risk_flags: riskFlags,
    summary,
    recommendation,
  }
}
