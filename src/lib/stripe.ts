import Stripe from 'stripe'
import type { ProgramId } from '@/types'

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function readEnv(...keys: string[]) {
  return firstNonEmpty(...keys.map((key) => process.env[key]))
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

// ─── Price IDs ────────────────────────────────────────────────────────────────

export const PRICE_IDS = {
  program_a: {
    setup: readEnv(
      'STRIPE_PRICE_ID_PROGRAM_A_SETUP',
      'STRIPE_PRICE_PROGRAM_A_SETUP',
    ),
    monthly: readEnv(
      'STRIPE_PRICE_ID_PROGRAM_A_MONTHLY',
      'STRIPE_PRICE_PROGRAM_A',
      'STRIPE_PRICE_ID_PROGRAM_A',
    ),
  },
  program_b: {
    setup: readEnv(
      'STRIPE_PRICE_ID_PROGRAM_B_SETUP',
      'STRIPE_PRICE_PROGRAM_B_SETUP',
    ),
    monthly: readEnv(
      'STRIPE_PRICE_ID_PROGRAM_B_MONTHLY',
      'STRIPE_PRICE_PROGRAM_B',
      'STRIPE_PRICE_ID_PROGRAM_B',
    ),
  },
  program_c: {
    monthly: readEnv(
      'STRIPE_PRICE_ID_PROGRAM_C_MONTHLY',
      'STRIPE_PRICE_PROGRAM_C',
      'STRIPE_PRICE_ID_PROGRAM_C',
    ),
  },
} as const

// ─── Display Info ─────────────────────────────────────────────────────────────

export const PROGRAM_INFO: Record<ProgramId, {
  name: string
  setupFee: number | null
  monthlyFee: number
  hasSetup: boolean
}> = {
  program_a: { name: '0% Intro APR Advisory',        setupFee: 500, monthlyFee: 449, hasSetup: true },
  program_b: { name: 'Business Credit Builder',      setupFee: 300, monthlyFee: 249, hasSetup: true },
  program_c: { name: 'Capital Monitoring Membership', setupFee: null, monthlyFee: 97,  hasSetup: false },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns unix timestamp 30 days from now — used for subscription trial_end */
export function thirtyDaysFromNow(): number {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
}
