import type { ProgramId, Task, TaskStatus } from '@/types'
import { v4 as uuidv4 } from 'uuid'

// ─── Task Template Definitions ────────────────────────────────────────────────
interface TaskTemplate {
  program: ProgramId
  stage: string
  stageOrder: number
  title: string
  description: string
  sort_order: number
  requires_document: boolean
  days_to_complete: number
}

// ─── Program A Tasks ──────────────────────────────────────────────────────────
const PROGRAM_A_TASKS: TaskTemplate[] = [
  // Stage 1: Credit Readiness
  {
    program: 'program_a', stage: 'Credit Readiness', stageOrder: 1,
    title: 'Pull and review personal credit reports',
    description: 'Obtain copies of your TransUnion, Equifax, and Experian credit reports. Review for accuracy, negative items, and current utilization.',
    sort_order: 1, requires_document: true, days_to_complete: 3,
  },
  {
    program: 'program_a', stage: 'Credit Readiness', stageOrder: 1,
    title: 'Document current credit score and utilization',
    description: 'Record your credit score from each bureau and calculate your overall utilization percentage.',
    sort_order: 2, requires_document: false, days_to_complete: 2,
  },
  {
    program: 'program_a', stage: 'Credit Readiness', stageOrder: 1,
    title: 'Confirm no negative accounts or recent derogatory marks',
    description: 'Verify no collections, charge-offs, or late payments that would disqualify applications.',
    sort_order: 3, requires_document: false, days_to_complete: 2,
  },
  {
    program: 'program_a', stage: 'Credit Readiness', stageOrder: 1,
    title: 'Lower utilization below 30% if needed',
    description: 'Pay down balances to bring overall utilization under 30% across all cards before applying.',
    sort_order: 4, requires_document: false, days_to_complete: 30,
  },
  // Stage 2: Application Strategy
  {
    program: 'program_a', stage: 'Application Strategy', stageOrder: 2,
    title: 'Identify target 0% intro APR business cards',
    description: 'Review the recommended card list provided by your AI agent. Select 3-5 target cards based on your profile.',
    sort_order: 5, requires_document: false, days_to_complete: 5,
  },
  {
    program: 'program_a', stage: 'Application Strategy', stageOrder: 2,
    title: 'Confirm application timing and sequencing',
    description: 'Work with your AI agent to determine the ideal order and timing for card applications to minimize inquiry impact.',
    sort_order: 6, requires_document: false, days_to_complete: 3,
  },
  {
    program: 'program_a', stage: 'Application Strategy', stageOrder: 2,
    title: 'Prepare business documentation package',
    description: 'Gather EIN letter, business formation docs, and recent bank statements for application requirements.',
    sort_order: 7, requires_document: true, days_to_complete: 5,
  },
  // Stage 3: Card Acquisition
  {
    program: 'program_a', stage: 'Card Acquisition', stageOrder: 3,
    title: 'Submit first card application',
    description: 'Apply for the first target card in your sequencing plan. Record result and decision.',
    sort_order: 8, requires_document: false, days_to_complete: 1,
  },
  {
    program: 'program_a', stage: 'Card Acquisition', stageOrder: 3,
    title: 'Submit second card application',
    description: 'Apply for the second target card after waiting the recommended period.',
    sort_order: 9, requires_document: false, days_to_complete: 1,
  },
  {
    program: 'program_a', stage: 'Card Acquisition', stageOrder: 3,
    title: 'Submit third card application',
    description: 'Apply for the third target card in the sequence.',
    sort_order: 10, requires_document: false, days_to_complete: 1,
  },
  {
    program: 'program_a', stage: 'Card Acquisition', stageOrder: 3,
    title: 'Upload card approval confirmations',
    description: 'Upload screenshots or letters confirming approved card accounts and credit limits.',
    sort_order: 11, requires_document: true, days_to_complete: 7,
  },
  // Stage 4: Optimization
  {
    program: 'program_a', stage: 'Optimization', stageOrder: 4,
    title: 'Track 0% intro period end dates',
    description: 'Record the promotional period end date for each card to plan payoff or transfer strategy.',
    sort_order: 12, requires_document: false, days_to_complete: 3,
  },
  {
    program: 'program_a', stage: 'Optimization', stageOrder: 4,
    title: 'Build payment history on new accounts',
    description: 'Make at least one on-time payment on each new card to establish positive history.',
    sort_order: 13, requires_document: false, days_to_complete: 30,
  },
  {
    program: 'program_a', stage: 'Optimization', stageOrder: 4,
    title: 'Review and confirm reporting status',
    description: 'Verify all new accounts are reporting to personal credit bureaus and check for any errors.',
    sort_order: 14, requires_document: false, days_to_complete: 14,
  },
]

// ─── Program B Tasks ──────────────────────────────────────────────────────────
const PROGRAM_B_TASKS: TaskTemplate[] = [
  // Stage 1: Foundation
  {
    program: 'program_b', stage: 'Foundation', stageOrder: 1,
    title: 'Verify legal entity status',
    description: 'Confirm your LLC or corporation is in good standing with the state. Pull a certificate of good standing if needed.',
    sort_order: 1, requires_document: true, days_to_complete: 3,
  },
  {
    program: 'program_b', stage: 'Foundation', stageOrder: 1,
    title: 'Confirm EIN is active',
    description: 'Verify your EIN letter is on file and the EIN is properly linked to your business name. Upload your EIN letter.',
    sort_order: 2, requires_document: true, days_to_complete: 2,
  },
  {
    program: 'program_b', stage: 'Foundation', stageOrder: 1,
    title: 'Register with Dun & Bradstreet',
    description: 'Create or claim your Dun & Bradstreet profile and obtain your DUNS number. This is required for business credit reporting.',
    sort_order: 3, requires_document: false, days_to_complete: 7,
  },
  {
    program: 'program_b', stage: 'Foundation', stageOrder: 1,
    title: 'Confirm business address',
    description: 'Ensure you have a professional business address (not a P.O. box) that matches your business registration.',
    sort_order: 4, requires_document: false, days_to_complete: 3,
  },
  // Stage 2: Vendor Accounts
  {
    program: 'program_b', stage: 'Vendor Accounts', stageOrder: 2,
    title: 'Open first vendor net-30 account',
    description: 'Apply for your first vendor tradeline that reports to business credit bureaus. Recommended: Uline, Quill, or Grainger.',
    sort_order: 5, requires_document: false, days_to_complete: 5,
  },
  {
    program: 'program_b', stage: 'Vendor Accounts', stageOrder: 2,
    title: 'Open second vendor net-30 account',
    description: 'Apply for your second vendor tradeline. Diversify vendors for stronger reporting.',
    sort_order: 6, requires_document: false, days_to_complete: 5,
  },
  {
    program: 'program_b', stage: 'Vendor Accounts', stageOrder: 2,
    title: 'Open third vendor net-30 account',
    description: 'Apply for your third vendor tradeline to hit the 3-tradeline milestone for business credit reporting.',
    sort_order: 7, requires_document: false, days_to_complete: 5,
  },
  {
    program: 'program_b', stage: 'Vendor Accounts', stageOrder: 2,
    title: 'Upload vendor account confirmations',
    description: 'Upload confirmation letters or screenshots for each approved vendor account.',
    sort_order: 8, requires_document: true, days_to_complete: 7,
  },
  // Stage 3: Store Credit
  {
    program: 'program_b', stage: 'Store Credit', stageOrder: 3,
    title: 'Apply for first store credit account',
    description: 'Apply for a store credit account that reports to business bureaus. Recommended: Lowes, Home Depot, or Staples business accounts.',
    sort_order: 9, requires_document: false, days_to_complete: 5,
  },
  {
    program: 'program_b', stage: 'Store Credit', stageOrder: 3,
    title: 'Build consistent payment history',
    description: 'Make purchases and pay on time on all vendor and store accounts. Consistency is critical for PAYDEX scores.',
    sort_order: 10, requires_document: false, days_to_complete: 30,
  },
  {
    program: 'program_b', stage: 'Store Credit', stageOrder: 3,
    title: 'Confirm tradeline reporting to bureaus',
    description: 'Pull your Dun & Bradstreet and Experian Business reports to confirm accounts are reporting.',
    sort_order: 11, requires_document: true, days_to_complete: 14,
  },
  // Stage 4: Fleet Credit
  {
    program: 'program_b', stage: 'Fleet Credit', stageOrder: 4,
    title: 'Apply for fleet or fuel account',
    description: 'Apply for a fleet credit account (WEX, Fuelman, or Shell Fleet). These accounts add stronger tradelines.',
    sort_order: 12, requires_document: false, days_to_complete: 7,
  },
  {
    program: 'program_b', stage: 'Fleet Credit', stageOrder: 4,
    title: 'Maintain payment consistency across all accounts',
    description: 'Continue making on-time payments across all open accounts. Do not miss a payment during this stage.',
    sort_order: 13, requires_document: false, days_to_complete: 30,
  },
  // Stage 5: Cash Credit Readiness
  {
    program: 'program_b', stage: 'Cash Credit Readiness', stageOrder: 5,
    title: 'Confirm 12+ reporting tradelines',
    description: 'Verify you have at least 12 accounts reporting across business credit bureaus.',
    sort_order: 14, requires_document: false, days_to_complete: 7,
  },
  {
    program: 'program_b', stage: 'Cash Credit Readiness', stageOrder: 5,
    title: 'Verify PAYDEX score at 80+',
    description: 'Pull Dun & Bradstreet report and confirm PAYDEX score is 80 or above (paid on time = 80).',
    sort_order: 15, requires_document: true, days_to_complete: 7,
  },
  {
    program: 'program_b', stage: 'Cash Credit Readiness', stageOrder: 5,
    title: 'Evaluate higher-limit credit readiness',
    description: 'Work with your AI agent to evaluate next-step options: business lines of credit, SBA readiness, or tier-2 cards.',
    sort_order: 16, requires_document: false, days_to_complete: 7,
  },
]

// ─── Program C Tasks (Monthly Cycle) ─────────────────────────────────────────
const PROGRAM_C_TASKS: TaskTemplate[] = [
  {
    program: 'program_c', stage: 'Monthly Review', stageOrder: 1,
    title: 'Complete Credit Snapshot',
    description: 'Pull and review current personal and business credit reports. Note any changes from last month.',
    sort_order: 1, requires_document: true, days_to_complete: 5,
  },
  {
    program: 'program_c', stage: 'Monthly Review', stageOrder: 1,
    title: 'Complete Banking Snapshot',
    description: 'Review bank statements for the past 30 days. Upload most recent statement.',
    sort_order: 2, requires_document: true, days_to_complete: 3,
  },
  {
    program: 'program_c', stage: 'Monthly Review', stageOrder: 1,
    title: 'Complete Obligation Risk Scan',
    description: 'Review all current credit obligations, upcoming payments, and any overdue items.',
    sort_order: 3, requires_document: false, days_to_complete: 3,
  },
  {
    program: 'program_c', stage: 'Monthly Review', stageOrder: 1,
    title: 'Review 30-Day Action Plan',
    description: 'Review and confirm the action items your AI agent has outlined for the next 30 days.',
    sort_order: 4, requires_document: false, days_to_complete: 2,
  },
  {
    program: 'program_c', stage: 'Monthly Review', stageOrder: 1,
    title: 'Review Do/Don\'t Rules for the Month',
    description: 'Confirm the monthly rules set by your AI agent based on your current credit position.',
    sort_order: 5, requires_document: false, days_to_complete: 1,
  },
  {
    program: 'program_c', stage: 'Monthly Review', stageOrder: 1,
    title: 'Confirm Next Check-In Date',
    description: 'Acknowledge the next scheduled monthly review date.',
    sort_order: 6, requires_document: false, days_to_complete: 1,
  },
]

// ─── Task Generator ───────────────────────────────────────────────────────────
export function generateTasksForUser(userId: string, programId: ProgramId): Omit<Task, 'created_at'>[] {
  const templates =
    programId === 'program_a' ? PROGRAM_A_TASKS :
    programId === 'program_b' ? PROGRAM_B_TASKS :
    PROGRAM_C_TASKS

  const now = new Date()

  return templates.map((t, index): Omit<Task, 'created_at'> => {
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + t.days_to_complete + (t.sort_order - 1) * 3)

    return {
      task_id: uuidv4(),
      user_id: userId,
      program: t.program,
      stage: t.stage,
      title: t.title,
      description: t.description,
      status: index === 0 ? 'pending' : 'locked',
      due_date: dueDate.toISOString(),
      requires_document: t.requires_document,
      completed_at: null,
      sort_order: t.sort_order,
    }
  })
}

// ─── Stage Names ──────────────────────────────────────────────────────────────
export const PROGRAM_STAGES: Record<ProgramId, string[]> = {
  program_a: ['Credit Readiness', 'Application Strategy', 'Card Acquisition', 'Optimization'],
  program_b: ['Foundation', 'Vendor Accounts', 'Store Credit', 'Fleet Credit', 'Cash Credit Readiness'],
  program_c: ['Monthly Review'],
}

export function getNextUnlockedStage(programId: ProgramId, currentStage: string): string | null {
  const stages = PROGRAM_STAGES[programId]
  const currentIndex = stages.indexOf(currentStage)
  if (currentIndex === -1 || currentIndex >= stages.length - 1) return null
  return stages[currentIndex + 1]
}
