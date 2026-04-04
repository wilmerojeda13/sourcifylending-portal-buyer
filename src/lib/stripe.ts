import Stripe from 'stripe'
import type { ProgramId } from '@/types'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

// ─── Price IDs ────────────────────────────────────────────────────────────────

export const PRICE_IDS = {
  program_a: {
    setup:   process.env.STRIPE_PRICE_ID_PROGRAM_A_SETUP!,
    monthly: process.env.STRIPE_PRICE_ID_PROGRAM_A_MONTHLY!,
  },
  program_b: {
    setup:   process.env.STRIPE_PRICE_ID_PROGRAM_B_SETUP!,
    monthly: process.env.STRIPE_PRICE_ID_PROGRAM_B_MONTHLY!,
  },
  program_c: {
    monthly: process.env.STRIPE_PRICE_ID_PROGRAM_C_MONTHLY!,
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
