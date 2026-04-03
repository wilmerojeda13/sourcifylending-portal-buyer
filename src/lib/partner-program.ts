import type { ProgramId } from '@/types'

export type AcquisitionPath = 'self_serve' | 'partner_assisted'
export type RevenueComponent = 'setup_fee' | 'recurring'

interface ProgramPricing {
  setupFeeCents: number
  monthlyFeeCents: number
  hasSetupFee: boolean
}

export const PROGRAM_PATH_PRICING: Record<AcquisitionPath, Record<ProgramId, ProgramPricing>> = {
  self_serve: {
    program_a: { setupFeeCents: 0, monthlyFeeCents: 44_900, hasSetupFee: false },
    program_b: { setupFeeCents: 0, monthlyFeeCents: 24_900, hasSetupFee: false },
    program_c: { setupFeeCents: 0, monthlyFeeCents: 9_700, hasSetupFee: false },
  },
  partner_assisted: {
    program_a: { setupFeeCents: 50_000, monthlyFeeCents: 44_900, hasSetupFee: true },
    program_b: { setupFeeCents: 30_000, monthlyFeeCents: 24_900, hasSetupFee: true },
    program_c: { setupFeeCents: 0, monthlyFeeCents: 9_700, hasSetupFee: false },
  },
}

export function normalizeAcquisitionPath(value: string | null | undefined): AcquisitionPath {
  return value === 'partner_assisted' ? 'partner_assisted' : 'self_serve'
}

export function isPartnerAssistedRecord(record: {
  acquisition_path?: string | null
  assigned_partner_affiliate_id?: string | null
}) {
  return normalizeAcquisitionPath(record.acquisition_path) === 'partner_assisted' || !!record.assigned_partner_affiliate_id
}

export function getProgramPricing(program: ProgramId, acquisitionPath: string | null | undefined) {
  const path = normalizeAcquisitionPath(acquisitionPath)
  return PROGRAM_PATH_PRICING[path][program]
}

export function formatPricingLabel(program: ProgramId, acquisitionPath: string | null | undefined) {
  const pricing = getProgramPricing(program, acquisitionPath)
  if (pricing.setupFeeCents > 0) {
    return `$${pricing.setupFeeCents / 100} setup + $${pricing.monthlyFeeCents / 100}/month`
  }
  return `$${pricing.monthlyFeeCents / 100}/month`
}

export function getPartnerCommissionPercent(
  program: ProgramId,
  revenueComponent: RevenueComponent,
  legacyDealType?: string | null,
) {
  if (legacyDealType === 'referral_only') {
    return revenueComponent === 'setup_fee' ? 10 : 10
  }

  if (legacyDealType === 'affiliate_closed') {
    return revenueComponent === 'setup_fee'
      ? (program === 'program_c' ? 0 : 30)
      : 30
  }

  if (revenueComponent === 'setup_fee') {
    return program === 'program_c' ? 0 : 80
  }

  return 20
}
