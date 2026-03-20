import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Fixed UUIDs — idempotent re-seeding
const DEMO_A_ID = '00000000-0000-4000-8000-00000000da01'
const DEMO_B_ID = '00000000-0000-4000-8000-00000000db02'
const DEMO_C_ID = '00000000-0000-4000-8000-00000000dc03'
const DEMO_AB_ID = '00000000-0000-4000-8000-00000000dab4'

const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000).toISOString().split('T')[0]

// ─── Demo A: Program A — 0% Intro APR Advisory ────────────────────────────────
const DEMO_A_PROFILE = {
  id: DEMO_A_ID,
  full_name: 'Alex Mercer',
  email: 'demo-a@sourcifylending.com',
  business_name: 'Apex Digital LLC',
  business_age: '2 years',
  entity_type: 'LLC',
  industry: 'Digital Marketing',
  monthly_revenue_range: '$10k–$25k',
  monthly_deposit_range: '$8k–$20k',
  nsf_flag: false,
  credit_score_range: '680-719',
  utilization_range: '41-60%',
  inquiry_range: '3-5',
  business_credit_reporting_status: 'not_reporting',
  assigned_program: 'program_a',
  readiness_status: 'Conditionally Ready',
  current_stage: 'Credit Optimization',
  progress_percentage: 55,
  subscription_status: 'active',
  portal_blocked: false,
  is_demo: true,
  admin_notes: 'Seeded demo account — Program A. High utilization risk flag. Credit Opportunities stage, 55% progress.',
}

const DEMO_A_TASKS = [
  {
    task_id: 'da01-task-0001-0000-000000000001',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Foundation',
    title: 'Pull personal credit reports from all 3 bureaus',
    description: 'Obtain your Equifax, Experian, and TransUnion reports via AnnualCreditReport.com. Review for errors, late payments, and collections.',
    status: 'completed',
    due_date: null,
    requires_document: true,
    completed_at: daysAgo(42),
    sort_order: 1,
  },
  {
    task_id: 'da01-task-0002-0000-000000000002',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Foundation',
    title: 'Dispute outdated negative items',
    description: 'Submit disputes for any negative items older than 7 years or that appear inaccurate. Use certified mail or bureau portals.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(38),
    sort_order: 2,
  },
  {
    task_id: 'da01-task-0003-0000-000000000003',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Foundation',
    title: 'Reduce utilization to below 30% on Card 1',
    description: 'Your primary card is currently at 47% utilization. Pay down the balance to below 30% to improve your score before the application window.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(30),
    sort_order: 3,
  },
  {
    task_id: 'da01-task-0004-0000-000000000004',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Foundation',
    title: 'Add an authorized user tradeline',
    description: 'Identify a trusted family member or friend with a long-standing, low-utilization card. Ask to be added as an authorized user.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(25),
    sort_order: 4,
  },
  {
    task_id: 'da01-task-0005-0000-000000000005',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Credit Opportunities',
    title: 'Confirm application strategy with AI agent',
    description: 'Review your recommended card application order with the AI agent. Understand the sequencing logic and confirm you\'re ready to proceed.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(18),
    sort_order: 5,
  },
  {
    task_id: 'da01-task-0006-0000-000000000006',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Credit Opportunities',
    title: 'Apply for Card Set 1 (Chase Ink + Amex Blue Business)',
    description: 'Apply for both cards on the same day to minimize the inquiry impact window. Start with Chase, then Amex within 2 hours.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(10),
    sort_order: 6,
  },
  {
    task_id: 'da01-task-0007-0000-000000000007',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Credit Opportunities',
    title: 'Apply for Card Set 2 (Capital One Venture X + US Bank)',
    description: 'Wait 91 days after Set 1 before applying. This prevents velocity flags and keeps your profile clean for the next set.',
    status: 'pending',
    due_date: daysFromNow(14),
    requires_document: false,
    completed_at: null,
    sort_order: 7,
  },
  {
    task_id: 'da01-task-0008-0000-000000000008',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Optimization',
    title: 'Request credit limit increases on Set 1 cards',
    description: 'After 6 months of on-time payments, call each issuer and request a credit limit increase. This lowers your utilization ratio.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 8,
  },
  {
    task_id: 'da01-task-0009-0000-000000000009',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Optimization',
    title: 'Transfer existing balances to 0% APR cards',
    description: 'Identify which of your existing high-interest balances are eligible for transfer. Move them to the 0% intro APR cards from Set 1.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 9,
  },
  {
    task_id: 'da01-task-0010-0000-000000000010',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Optimization',
    title: 'Document your 0% APR repayment plan',
    description: 'Create a month-by-month payoff schedule for each balance transfer. Upload to your document manager for tracking.',
    status: 'locked',
    due_date: null,
    requires_document: true,
    completed_at: null,
    sort_order: 10,
  },
  {
    task_id: 'da01-task-0011-0000-000000000011',
    user_id: DEMO_A_ID,
    program: 'program_a',
    stage: 'Optimization',
    title: 'Generate monthly optimization report',
    description: 'Use the AI agent to generate a monthly optimization report summarizing your progress, savings, and next steps.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 11,
  },
]

const DEMO_A_REPORTS = [
  {
    user_id: DEMO_A_ID,
    report_type: 'credit_readiness_summary',
    title: 'Credit Readiness Summary — Alex Mercer',
    generated_at: daysAgo(20),
    content: `**Credit Readiness Summary**\n\nClient: Alex Mercer | Program: 0% APR Advisory | Date: ${new Date(daysAgo(20)).toLocaleDateString()}\n\n**Overall Readiness: Conditionally Ready**\n\nYour current credit profile positions you as conditionally ready for the 0% Intro APR Card Strategy. You have a strong foundation with 4+ years of credit history and a good payment record.\n\n**Strengths**\n- Clean payment history on all 3 accounts (0 late payments in 24 months)\n- 680–719 score range — acceptable for all target card issuers\n- Authorized user tradeline added, adding 8 years of positive history\n\n**Risk Factors**\n- Utilization currently at 47% — HIGH RISK. Must reduce to below 30% before Card Set 2 application\n- 4 hard inquiries in last 12 months — approaching threshold; wait 91 days before next application\n- Business credit not yet reporting — prioritize Dun & Bradstreet DUNS after this program\n\n**Recommended Actions**\n1. Execute Card Set 2 application window in 14 days\n2. Maintain $0 balances on new Set 1 cards through the reporting cycle\n3. Request CLI on Set 1 at 6-month mark to increase total available credit`,
  },
  {
    user_id: DEMO_A_ID,
    report_type: 'next_step_summary',
    title: 'Next Step Summary — Card Set 2 Window',
    generated_at: daysAgo(5),
    content: `**Next Step Summary**\n\nClient: Alex Mercer | Generated: ${new Date(daysAgo(5)).toLocaleDateString()}\n\n**Your Immediate Next Action**\n\nYou are 14 days away from your Card Set 2 application window. Here is exactly what to do:\n\n**Day 0 (Application Day)**\n- 9:00 AM — Apply for Capital One Venture X Business (best first — easiest approval in this tier)\n- 10:30 AM — Apply for US Bank Business Leverage\n- Do NOT check your credit between applications\n\n**Pre-Application Checklist**\n- Utilization below 30%: ✅ Confirmed\n- No new accounts opened in last 60 days: ✅ Confirmed\n- Income documentation ready: Required for Capital One — have your Schedule C or profit/loss ready\n- Business address consistent across all applications: Verify your registered LLC address matches your card applications\n\n**Expected Outcomes**\n- Capital One Venture X: High probability of approval at $5,000–$15,000 limit\n- US Bank Business Leverage: Moderate probability — may require reconsideration call\n\n**If Denied**\nCall the reconsideration line within 24 hours. Reference your clean payment history and income stability. Success rate on recon is approximately 35%.`,
  },
]

const DEMO_A_DOCUMENTS = [
  {
    user_id: DEMO_A_ID,
    document_type: 'personal_credit_report',
    file_url: 'https://placehold.co/600x400?text=Credit+Report+Demo',
    file_name: 'alex_mercer_credit_report_equifax.pdf',
    file_size: 245760,
    uploaded_at: daysAgo(40),
    review_status: 'approved',
    notes: 'Equifax report reviewed. Score 704. 4 inquiries noted. Utilization at 47% on primary card.',
  },
  {
    user_id: DEMO_A_ID,
    document_type: 'other',
    file_url: 'https://placehold.co/600x400?text=Balance+Transfer+Plan+Demo',
    file_name: 'balance_transfer_repayment_plan.pdf',
    file_size: 102400,
    uploaded_at: daysAgo(8),
    review_status: 'pending',
    notes: null,
  },
]

const DEMO_A_APPROVALS = [
  {
    id: 'da010000-0000-4000-8000-000000000001',
    user_id: DEMO_A_ID,
    program_type: 'Program A',
    approval_type: '0% APR Card',
    issuer_name: 'Chase',
    account_name: 'Chase Ink Business Preferred',
    approved_amount: null,
    approved_limit: 8000,
    approval_date: daysAgo(10).split('T')[0],
    status: 'Approved',
    notes: 'Applied Card Set 1. Approved instantly. 0% intro APR for 12 months.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(10),
  },
  {
    id: 'da010000-0000-4000-8000-000000000002',
    user_id: DEMO_A_ID,
    program_type: 'Program A',
    approval_type: '0% APR Card',
    issuer_name: 'American Express',
    account_name: 'Amex Blue Business Plus',
    approved_amount: null,
    approved_limit: 7500,
    approval_date: daysAgo(10).split('T')[0],
    status: 'Approved',
    notes: 'Applied same day as Chase. Approved. 0% intro APR for 15 months.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(10),
  },
  {
    id: 'da010000-0000-4000-8000-000000000003',
    user_id: DEMO_A_ID,
    program_type: 'Program A',
    approval_type: 'Business Credit Card',
    issuer_name: 'US Bank',
    account_name: 'US Bank Business Triple Cash',
    approved_amount: null,
    approved_limit: null,
    approval_date: daysAgo(10).split('T')[0],
    status: 'Declined',
    notes: 'Applied Set 1 — denied. Too many recent inquiries.',
    decline_reason: 'too many inquiries',
    mark_for_reattempt: true,
    created_at: daysAgo(10),
  },
  {
    id: 'da010000-0000-4000-8000-000000000004',
    user_id: DEMO_A_ID,
    program_type: 'Program A',
    approval_type: '0% APR Card',
    issuer_name: 'Capital One',
    account_name: 'Capital One Venture X Business',
    approved_amount: null,
    approved_limit: 5000,
    approval_date: daysFromNow(14),
    status: 'Pending',
    notes: 'Card Set 2 application window in 14 days. Pre-scheduled.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(1),
  },
]

const DEMO_A_NOTIFICATIONS = [
  {
    user_id: DEMO_A_ID,
    type: 'task_due',
    title: 'Card Set 2 window opens in 14 days',
    message: 'Your 91-day waiting period ends on ' + daysFromNow(14) + '. Prepare your income documentation now.',
    read: false,
    created_at: daysAgo(1),
  },
  {
    user_id: DEMO_A_ID,
    type: 'report_ready',
    title: 'New report: Next Step Summary',
    message: 'Your AI agent generated a new Next Step Summary covering the Card Set 2 application window.',
    read: false,
    created_at: daysAgo(5),
  },
  {
    user_id: DEMO_A_ID,
    type: 'ai_update',
    title: 'Utilization risk flag cleared',
    message: 'Your utilization dropped to 28% — below the 30% threshold. You\'re now clear for the Set 2 application window.',
    read: true,
    created_at: daysAgo(12),
  },
]

// ─── Demo B: Program B — Business Credit Builder ──────────────────────────────
const DEMO_B_PROFILE = {
  id: DEMO_B_ID,
  full_name: 'Brianna Cole',
  email: 'demo-b@sourcifylending.com',
  business_name: 'BluWave Services LLC',
  business_age: '1 year',
  entity_type: 'LLC',
  industry: 'Cleaning & Facilities',
  monthly_revenue_range: '$5k–$10k',
  monthly_deposit_range: '$4k–$8k',
  nsf_flag: false,
  credit_score_range: '640-679',
  utilization_range: '21-40%',
  inquiry_range: '1-2',
  business_credit_reporting_status: 'recently_opened',
  assigned_program: 'program_b',
  readiness_status: 'Conditionally Ready',
  current_stage: 'Store Credit',
  progress_percentage: 48,
  subscription_status: 'active',
  portal_blocked: false,
  is_demo: true,
  admin_notes: 'Seeded demo account — Program B. Foundation + Vendor stage complete. 5 reporting accounts. Store Credit stage in progress.',
}

const DEMO_B_TASKS = [
  {
    task_id: 'db02-task-0001-0000-000000000001',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'Foundation',
    title: 'Verify EIN and business registration',
    description: 'Confirm your EIN is properly registered with the IRS and matches your business formation documents. This must be consistent across all vendor applications.',
    status: 'completed',
    due_date: null,
    requires_document: true,
    completed_at: daysAgo(55),
    sort_order: 1,
  },
  {
    task_id: 'db02-task-0002-0000-000000000002',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'Foundation',
    title: 'Open dedicated business checking account',
    description: 'Open a business checking account in your business name with your EIN (not SSN). Banks: Chase Business Complete, Bank of America Business Advantage, or a local credit union.',
    status: 'completed',
    due_date: null,
    requires_document: true,
    completed_at: daysAgo(50),
    sort_order: 2,
  },
  {
    task_id: 'db02-task-0003-0000-000000000003',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'Foundation',
    title: 'Register with Dun & Bradstreet (D-U-N-S number)',
    description: 'Register your business for a free D-U-N-S number at dnb.com. This is your business credit identity number — required for most trade credit accounts.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(45),
    sort_order: 3,
  },
  {
    task_id: 'db02-task-0004-0000-000000000004',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'Vendor Credit',
    title: 'Apply for Uline net-30 account',
    description: 'Apply for a Uline net-30 trade account. Use your business name, EIN, and business address. Uline reports to D&B, Experian Business, and Equifax Business.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(35),
    sort_order: 4,
  },
  {
    task_id: 'db02-task-0005-0000-000000000005',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'Vendor Credit',
    title: 'Apply for Quill net-30 account',
    description: 'Apply for a Quill Office Supplies net-30 account. Quill reports to D&B. Make an initial purchase of $50+ within 30 days to trigger reporting.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(30),
    sort_order: 5,
  },
  {
    task_id: 'db02-task-0006-0000-000000000006',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'Store Credit',
    title: 'Apply for Staples Business Advantage account',
    description: 'Apply for a Staples Business Advantage account. This is a net-30 store credit that reports to D&B. Order $75+ in office supplies to activate reporting.',
    status: 'pending',
    due_date: daysFromNow(7),
    requires_document: false,
    completed_at: null,
    sort_order: 6,
  },
  {
    task_id: 'db02-task-0007-0000-000000000007',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'Store Credit',
    title: 'Apply for Home Depot Commercial Credit account',
    description: 'Home Depot Commercial Credit reports to Experian Business. Apply online using your EIN. Requires 1+ year business history and a DUNS number.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 7,
  },
  {
    task_id: 'db02-task-0008-0000-000000000008',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'Store Credit',
    title: 'Confirm all 5 accounts are reporting to bureaus',
    description: 'Log into Nav.com or CreditSafe to verify Uline, Quill, and any new store accounts are showing on your D&B and Experian Business profiles.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 8,
  },
  {
    task_id: 'db02-task-0009-0000-000000000009',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'PAYDEX',
    title: 'Complete first full payment cycle on all accounts',
    description: 'Pay all net-30 invoices 5–10 days EARLY (not just on time). PAYDEX rewards early payment with a higher score. Target 80+ PAYDEX.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 9,
  },
  {
    task_id: 'db02-task-0010-0000-000000000010',
    user_id: DEMO_B_ID,
    program: 'program_b',
    stage: 'PAYDEX',
    title: 'Generate PAYDEX readiness report',
    description: 'After 3 months of reporting, generate a tradeline progress report from the AI agent to confirm PAYDEX score and identify any gaps.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 10,
  },
]

const DEMO_B_REPORTS = [
  {
    user_id: DEMO_B_ID,
    report_type: 'tradeline_progress_report',
    title: 'Tradeline Progress Report — BluWave Services LLC',
    generated_at: daysAgo(15),
    content: `**Tradeline Progress Report**\n\nClient: Brianna Cole | Business: BluWave Services LLC | Date: ${new Date(daysAgo(15)).toLocaleDateString()}\n\n**Active Reporting Tradelines: 5**\n\n| Account | Bureau(s) | Status | Payment History |\n|---|---|---|---|\n| Uline | D&B, Experian | Reporting ✅ | Paid early x2 |\n| Quill | D&B | Reporting ✅ | Paid on time x2 |\n| Business Checking | Internal | Active | 50+ days history |\n| Formation LLC | State | Active | N/A |\n| D-U-N-S | D&B | Verified | Registered ✅ |\n\n**D&B PAYDEX Projection**\nWith 2 months of early payments on Uline and Quill, your projected PAYDEX score is 72–78. To reach 80+ (the target), you need:\n- 1 more early payment cycle on both accounts\n- Add Staples Business Advantage (net-30) to increase account count\n- Ensure Home Depot reports within 60 days of account opening\n\n**Next Milestone**\nReach 5+ reporting net-30 accounts with 3 months of clean payment history. This positions you for business credit cards (Capital One Spark, Brex, Ramp) without a personal guarantee.`,
  },
  {
    user_id: DEMO_B_ID,
    report_type: 'next_step_summary',
    title: 'Next Step Summary — Store Credit Stage',
    generated_at: daysAgo(3),
    content: `**Next Step Summary**\n\nClient: Brianna Cole | Generated: ${new Date(daysAgo(3)).toLocaleDateString()}\n\n**Current Stage: Store Credit**\n\nYou've successfully built your vendor credit foundation. Here's what you need to do RIGHT NOW:\n\n**This Week**\n- Apply for Staples Business Advantage (due in 7 days)\n  - Go to staples.com/business\n  - Select "Business Advantage Account"\n  - Use EIN: *(on file)*, Business address from formation docs\n  - Make a $75+ purchase to trigger reporting\n\n**Why This Matters**\nAdding Staples brings your reporting accounts to 5 — the minimum threshold for business credit card eligibility without a personal guarantee. Issuers like Capital One Spark and Brex require 5+ trade references.\n\n**Warning: What NOT to Do**\n- Do NOT apply for any personal credit cards during this period\n- Do NOT co-mingle personal and business expenses\n- Do NOT miss a single payment — even one late payment resets your PAYDEX score\n\n**30-Day Target**\n5 reporting accounts, PAYDEX 75+, Experian Business Intelliscore 50+`,
  },
]

const DEMO_B_DOCUMENTS = [
  {
    user_id: DEMO_B_ID,
    document_type: 'business_formation',
    file_url: 'https://placehold.co/600x400?text=LLC+Formation+Docs+Demo',
    file_name: 'bluwave_services_llc_articles.pdf',
    file_size: 312000,
    uploaded_at: daysAgo(52),
    review_status: 'approved',
    notes: 'Florida LLC formation documents verified. Business address confirmed.',
  },
  {
    user_id: DEMO_B_ID,
    document_type: 'ein_letter',
    file_url: 'https://placehold.co/600x400?text=EIN+Letter+Demo',
    file_name: 'irs_ein_letter_bluwave.pdf',
    file_size: 89600,
    uploaded_at: daysAgo(50),
    review_status: 'approved',
    notes: 'EIN confirmed. Matches business name on all applications.',
  },
  {
    user_id: DEMO_B_ID,
    document_type: 'bank_statement',
    file_url: 'https://placehold.co/600x400?text=Bank+Statement+Demo',
    file_name: 'bluwave_checking_statement_nov.pdf',
    file_size: 156000,
    uploaded_at: daysAgo(20),
    review_status: 'reviewed',
    notes: 'Average daily balance $4,200. 0 NSF events. Clean.',
  },
]

const DEMO_B_APPROVALS = [
  {
    id: 'db020000-0000-4000-8000-000000000001',
    user_id: DEMO_B_ID,
    program_type: 'Program B',
    approval_type: 'Net 30 Account',
    issuer_name: 'Uline',
    account_name: 'Uline Net-30 Trade Account',
    approved_amount: null,
    approved_limit: 2500,
    approval_date: daysAgo(35).split('T')[0],
    status: 'Approved',
    notes: 'First vendor account. Reporting to D&B and Experian Business.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(35),
  },
  {
    id: 'db020000-0000-4000-8000-000000000002',
    user_id: DEMO_B_ID,
    program_type: 'Program B',
    approval_type: 'Net 30 Account',
    issuer_name: 'Quill',
    account_name: 'Quill Office Supplies Net-30',
    approved_amount: null,
    approved_limit: 1500,
    approval_date: daysAgo(30).split('T')[0],
    status: 'Approved',
    notes: 'Approved. Initial $50 purchase placed to trigger reporting.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(30),
  },
  {
    id: 'db020000-0000-4000-8000-000000000003',
    user_id: DEMO_B_ID,
    program_type: 'Program B',
    approval_type: 'Net 30 Account',
    issuer_name: 'Grainger',
    account_name: 'Grainger Net-30 Account',
    approved_amount: null,
    approved_limit: 3000,
    approval_date: daysAgo(22).split('T')[0],
    status: 'Approved',
    notes: 'Approved. Reports to D&B. Good for facilities/cleaning industry.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(22),
  },
  {
    id: 'db020000-0000-4000-8000-000000000004',
    user_id: DEMO_B_ID,
    program_type: 'Program B',
    approval_type: 'Store Account',
    issuer_name: 'Staples',
    account_name: 'Staples Business Advantage',
    approved_amount: null,
    approved_limit: null,
    approval_date: daysFromNow(7),
    status: 'Pending',
    notes: 'Application scheduled. Due in 7 days.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(0),
  },
]

const DEMO_B_NOTIFICATIONS = [
  {
    user_id: DEMO_B_ID,
    type: 'task_due',
    title: 'Staples application due in 7 days',
    message: 'Your Staples Business Advantage application is due in 7 days. Apply now at staples.com/business.',
    read: false,
    created_at: daysAgo(0),
  },
  {
    user_id: DEMO_B_ID,
    type: 'ai_update',
    title: 'Uline confirmed reporting to D&B',
    message: 'Your Uline net-30 account is now confirmed reporting to Dun & Bradstreet. First payment cycle earned: Early.',
    read: true,
    created_at: daysAgo(18),
  },
]

// ─── Demo C: Program C — Capital Monitoring ───────────────────────────────────
const DEMO_C_PROFILE = {
  id: DEMO_C_ID,
  full_name: 'Carlos Vega',
  email: 'demo-c@sourcifylending.com',
  business_name: 'Vega Capital Group LLC',
  business_age: '3 years',
  entity_type: 'LLC',
  industry: 'Real Estate Investment',
  monthly_revenue_range: '$25k–$50k',
  monthly_deposit_range: '$20k–$40k',
  nsf_flag: false,
  credit_score_range: '720-759',
  utilization_range: '11-20%',
  inquiry_range: '0-1',
  business_credit_reporting_status: 'established',
  assigned_program: 'program_c',
  readiness_status: 'Conditionally Ready',
  current_stage: 'Monitoring',
  progress_percentage: 60,
  subscription_status: 'active',
  portal_blocked: false,
  is_demo: true,
  admin_notes: 'Seeded demo account — Program C. Monitoring stage 60% progress. Report history x3. Readiness 64/100.',
}

const DEMO_C_TASKS = [
  {
    task_id: 'dc03-task-0001-0000-000000000001',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Setup',
    title: 'Submit initial financial snapshot',
    description: 'Complete the financial snapshot form covering personal credit, business credit, banking activity, and monthly obligations. This baseline feeds your monthly monitoring.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(65),
    sort_order: 1,
  },
  {
    task_id: 'dc03-task-0002-0000-000000000002',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Setup',
    title: 'Connect bank account for deposit analysis',
    description: 'Authorize read-only access to your primary business checking account. This enables monthly banking analysis for lender qualification.',
    status: 'completed',
    due_date: null,
    requires_document: true,
    completed_at: daysAgo(63),
    sort_order: 2,
  },
  {
    task_id: 'dc03-task-0003-0000-000000000003',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Setup',
    title: 'Complete initial 3-bureau credit pull',
    description: 'Pull all 3 bureau reports to establish your baseline score and identify any risk factors before monitoring begins.',
    status: 'completed',
    due_date: null,
    requires_document: true,
    completed_at: daysAgo(60),
    sort_order: 3,
  },
  {
    task_id: 'dc03-task-0004-0000-000000000004',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Monitoring',
    title: 'Review Month 1 banking activity summary',
    description: 'Review your Month 1 banking analysis report. Identify deposit consistency, average balance trends, and any obligation flags.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(35),
    sort_order: 4,
  },
  {
    task_id: 'dc03-task-0005-0000-000000000005',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Monitoring',
    title: 'Address Month 1 action items',
    description: 'Complete all flagged action items from Month 1: reduce credit card balance by $2,000, avoid new hard inquiries, keep NSF count at 0.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(28),
    sort_order: 5,
  },
  {
    task_id: 'dc03-task-0006-0000-000000000006',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Monitoring',
    title: 'Review Month 2 banking activity summary',
    description: 'Review your Month 2 banking analysis. Focus on deposit growth trend and average daily balance improvement.',
    status: 'completed',
    due_date: null,
    requires_document: false,
    completed_at: daysAgo(7),
    sort_order: 6,
  },
  {
    task_id: 'dc03-task-0007-0000-000000000007',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Monitoring',
    title: 'Address Month 2 action items',
    description: 'Month 2 flagged: 1 obligation risk (car loan payment missed reporting cycle). Confirm payment history with lender and document. Also: increase average daily balance to $15k+.',
    status: 'pending',
    due_date: daysFromNow(5),
    requires_document: true,
    completed_at: null,
    sort_order: 7,
  },
  {
    task_id: 'dc03-task-0008-0000-000000000008',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Monitoring',
    title: 'Review Month 3 banking activity summary',
    description: 'Your Month 3 monitoring report will be auto-generated. Review it for deposit consistency, lender qualification score, and risk flags.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 8,
  },
  {
    task_id: 'dc03-task-0009-0000-000000000009',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Monitoring',
    title: 'Complete quarterly risk factor review',
    description: 'At the 90-day mark, run a full risk factor review covering DTI ratio, utilization trajectory, obligation risk score, and banking qualification score.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 9,
  },
  {
    task_id: 'dc03-task-0010-0000-000000000010',
    user_id: DEMO_C_ID,
    program: 'program_c',
    stage: 'Monitoring',
    title: 'Generate quarterly capital readiness report',
    description: 'Generate a full Funding Readiness Analysis report after 90 days. This report determines if you qualify for SBA loans, DSCR financing, or business lines of credit.',
    status: 'locked',
    due_date: null,
    requires_document: false,
    completed_at: null,
    sort_order: 10,
  },
]

const DEMO_C_REPORTS = [
  {
    user_id: DEMO_C_ID,
    report_type: 'monthly_monitoring_report',
    title: 'Monthly Monitoring Report — Month 1',
    generated_at: daysAgo(38),
    content: `**Monthly Capital Monitoring Report — Month 1**\n\nClient: Carlos Vega | Business: Vega Capital Group LLC | Period: ${new Date(daysAgo(65)).toLocaleDateString()} – ${new Date(daysAgo(38)).toLocaleDateString()}\n\n**Credit Snapshot**\n- Personal Score (avg): 737 ↑ (+4 vs baseline)\n- Utilization: 17% ✅ (below 20% threshold)\n- Hard inquiries: 1 (auto loan — acceptable)\n- Negative items: 0\n\n**Banking Analysis**\n- Average daily balance: $12,400 (target: $15,000)\n- Total deposits: $31,200 (strong for 30-day window)\n- NSF events: 0 ✅\n- Largest outflow: $8,100 (wire transfer — noted)\n\n**Obligation Risk Scan**\n- Active obligations: 3 (mortgage, auto, business LOC)\n- DTI estimate: 28% ✅ (below 43% threshold for most lenders)\n- Risk flag: Auto loan payment reporting gap — verify with lender\n\n**30-Day Action Plan**\n1. Increase average daily balance by $3,000 (target: $15,000)\n2. Resolve auto loan reporting gap — obtain payment confirmation letter\n3. Maintain 0 hard inquiries\n4. Keep all obligations current — pay 3–5 days early when possible\n\n**Capital Readiness Score: 61/100** — Conditionally Ready`,
  },
  {
    user_id: DEMO_C_ID,
    report_type: 'monthly_monitoring_report',
    title: 'Monthly Monitoring Report — Month 2',
    generated_at: daysAgo(8),
    content: `**Monthly Capital Monitoring Report — Month 2**\n\nClient: Carlos Vega | Business: Vega Capital Group LLC | Period: ${new Date(daysAgo(38)).toLocaleDateString()} – ${new Date(daysAgo(8)).toLocaleDateString()}\n\n**Credit Snapshot**\n- Personal Score (avg): 741 ↑ (+4 vs Month 1)\n- Utilization: 15% ✅ (improved from 17%)\n- Hard inquiries: 0 ✅\n- Negative items: 0 ✅\n\n**Banking Analysis**\n- Average daily balance: $13,800 (target: $15,000 — close)\n- Total deposits: $34,500 ↑ (+10% vs Month 1)\n- NSF events: 0 ✅\n- Deposit consistency: 8 of 8 weeks with consistent inflows ✅\n\n**Obligation Risk Scan**\n- DTI estimate: 26% ✅\n- Auto loan gap: FLAGGED ⚠️ — Payment confirmation letter still needed\n- All other obligations: Current ✅\n\n**30-Day Action Plan**\n1. ⚠️ PRIORITY: Upload auto loan payment confirmation letter (due in 5 days)\n2. Push average daily balance to $15,000+ (currently $1,200 short)\n3. No new obligations until Month 3 review\n4. Prepare income documentation for Q1 capital readiness report\n\n**Capital Readiness Score: 64/100** — Conditionally Ready (up from 61)`,
  },
  {
    user_id: DEMO_C_ID,
    report_type: 'next_step_summary',
    title: 'Next Step Summary — Month 2 Action Items',
    generated_at: daysAgo(3),
    content: `**Next Step Summary**\n\nClient: Carlos Vega | Generated: ${new Date(daysAgo(3)).toLocaleDateString()}\n\n**Your Immediate Priority — 5 Days Remaining**\n\nYou have ONE critical open item from your Month 2 report:\n\n**⚠️ Auto Loan Payment Confirmation Letter**\nYour auto lender failed to report 1 payment cycle. This creates a reporting gap that lenders will question during underwriting. To resolve:\n\n1. Call your auto lender (loan servicer number on your monthly statement)\n2. Request a "payment history letter" or "account statement" covering the last 6 months\n3. Ask them to confirm the most recent payment was received on [date]\n4. Upload the document to your Document Manager under "Bank Statement" category\n\nThis single item is holding your Capital Readiness Score at 64 instead of 70+.\n\n**Also This Week**\n- Transfer $1,200 to business checking to reach $15,000 average daily balance\n- Do not open any new credit accounts\n- Pay all obligations 3–5 days early if possible\n\n**Next Milestone: 90-Day Capital Report**\nIn 22 days, your AI agent will generate a full Funding Readiness Analysis. If you resolve the auto loan flag and hit the $15k balance target, your score should reach 70–74, qualifying you for:\n- SBA 7(a) loans up to $500k\n- DSCR business loans\n- Unsecured business lines of credit ($50k–$150k)`,
  },
]

const DEMO_C_DOCUMENTS = [
  {
    user_id: DEMO_C_ID,
    document_type: 'personal_credit_report',
    file_url: 'https://placehold.co/600x400?text=Credit+Report+Demo',
    file_name: 'carlos_vega_3bureau_report.pdf',
    file_size: 389120,
    uploaded_at: daysAgo(60),
    review_status: 'approved',
    notes: 'Baseline 3-bureau pull. Score 733/737/741. Utilization 17%. No derogatory marks.',
  },
  {
    user_id: DEMO_C_ID,
    document_type: 'bank_statement',
    file_url: 'https://placehold.co/600x400?text=Bank+Statement+Demo',
    file_name: 'vega_capital_checking_oct_nov.pdf',
    file_size: 210000,
    uploaded_at: daysAgo(10),
    review_status: 'reviewed',
    notes: 'Months 1–2 banking confirmed. Average daily balance $13,200. 0 NSF events.',
  },
]

const DEMO_C_NOTIFICATIONS = [
  {
    user_id: DEMO_C_ID,
    type: 'task_due',
    title: '⚠️ Auto loan letter due in 5 days',
    message: 'Upload your auto loan payment confirmation letter to clear the Month 2 obligation risk flag before your 90-day report.',
    read: false,
    created_at: daysAgo(0),
  },
  {
    user_id: DEMO_C_ID,
    type: 'report_ready',
    title: 'Month 2 monitoring report ready',
    message: 'Your Month 2 Capital Monitoring Report is ready. Capital Readiness Score: 64/100 (+3 vs last month).',
    read: false,
    created_at: daysAgo(8),
  },
  {
    user_id: DEMO_C_ID,
    type: 'ai_update',
    title: 'Score improved: 737 → 741',
    message: 'Your average credit score increased 4 points this month. Utilization improvement from 17% to 15% contributed.',
    read: true,
    created_at: daysAgo(9),
  },
]

// ─── Credit Disputes — Demo A (Alex Mercer, Program A) ────────────────────────
const DEMO_A_DISPUTES = [
  {
    user_id: DEMO_A_ID,
    bureau: 'Experian',
    dispute_type: 'Hard Inquiry',
    item_disputed: 'Unauthorized Hard Inquiry — Capital One Auto, March 2024',
    incorrect_information: 'Hard inquiry from Capital One Auto Finance dated 03/14/2024 does not belong to me. I never authorized or applied for auto financing through this lender.',
    correct_information: 'This inquiry should be removed entirely. I have no record of applying for Capital One Auto Finance and did not authorize this credit pull.',
    generated_letter: `To Whom It May Concern,\n\nI am writing to formally dispute an unauthorized hard inquiry appearing on my Experian credit report. The inquiry from Capital One Auto Finance dated 03/14/2024 was made without my knowledge or consent.\n\nUnder the Fair Credit Reporting Act (FCRA) Section 604, a consumer reporting agency may only furnish a consumer report when there is a permissible purpose. I did not apply for auto financing with Capital One, nor did I authorize any party to pull my credit for this purpose.\n\nI request that this unauthorized inquiry be immediately removed from my credit file.\n\nName: Alex Mercer\nSSN Last 4: On file\nDate of Birth: On file\n\nSincerely,\nAlex Mercer`,
    status: 'Under Investigation',
    date_generated: daysAgo(22),
    date_sent: daysAgo(20),
    investigation_deadline: daysAgo(-10),
    response_notes: 'Bureau acknowledged receipt on ' + new Date(Date.now() - 18 * 86400000).toLocaleDateString() + '. Awaiting investigation results.',
  },
  {
    user_id: DEMO_A_ID,
    bureau: 'TransUnion',
    dispute_type: 'Account Information',
    item_disputed: 'Chase Freedom — Reported Balance $3,200 (Incorrect)',
    incorrect_information: 'Chase Freedom account (Account #****4821) is showing a balance of $3,200. This account was paid in full on 01/15/2024 and the balance should be $0.',
    correct_information: 'Balance should reflect $0. Payment was made in full on January 15, 2024. Bank statement and payment confirmation are available upon request.',
    generated_letter: `To Whom It May Concern,\n\nI am writing to dispute inaccurate account information appearing on my TransUnion credit report.\n\nThe account in question:\n- Creditor: Chase Freedom\n- Account Number: ****4821\n- Reported Balance: $3,200 (INCORRECT)\n- Correct Balance: $0 (paid in full 01/15/2024)\n\nThis incorrect balance is inflating my reported utilization and negatively impacting my credit score. Under FCRA Section 611, I request an investigation and correction of this error.\n\nI have enclosed my January 2024 bank statement showing the payment of $3,200 to Chase on 01/15/2024.\n\nSincerely,\nAlex Mercer`,
    status: 'Resolved',
    date_generated: daysAgo(45),
    date_sent: daysAgo(43),
    investigation_deadline: daysAgo(13),
    response_notes: 'TransUnion completed investigation on ' + new Date(Date.now() - 16 * 86400000).toLocaleDateString() + '. Account updated to $0 balance. Score improved +11 points.',
  },
  {
    user_id: DEMO_A_ID,
    bureau: 'Equifax',
    dispute_type: 'Collection Account',
    item_disputed: 'Midland Credit Management — $847 Collection (Not Mine)',
    incorrect_information: 'Collection account from Midland Credit Management for $847 appearing on my file. I have no record of this debt. This account does not belong to me.',
    correct_information: 'This collection account should be deleted. I have never had an account with the original creditor (listed as "Various") and have no obligation to this debt.',
    generated_letter: `To Whom It May Concern,\n\nI am disputing a collection account appearing on my Equifax credit report that does not belong to me.\n\nCollection Account Details:\n- Collector: Midland Credit Management\n- Amount: $847\n- Original Creditor: Various (unspecified)\n- Account Status: Collection\n\nI have no knowledge of this debt and have never had an account with this collector or its listed original creditor. This appears to be a case of mixed file or identity error.\n\nPursuant to FCRA Section 611, I request that Equifax investigate this account and delete it from my credit file if it cannot be verified.\n\nSincerely,\nAlex Mercer`,
    status: 'Sent',
    date_generated: daysAgo(8),
    date_sent: daysAgo(6),
    investigation_deadline: daysAgo(-24),
    response_notes: null,
  },
]

// ─── Credit Disputes — Demo B (Brianna Cole, Program B) ──────────────────────
const DEMO_B_DISPUTES = [
  {
    user_id: DEMO_B_ID,
    bureau: 'Equifax',
    dispute_type: 'Personal Information',
    item_disputed: 'Incorrect Address — 4821 Westview Dr, Tampa FL (Not My Address)',
    incorrect_information: 'An unknown address (4821 Westview Dr, Tampa FL 33612) is listed on my credit file. I have never lived at this address and it is not associated with any account I own.',
    correct_information: 'My current address is on file. The incorrect address at 4821 Westview Dr, Tampa FL should be removed from my credit profile entirely.',
    generated_letter: `To Whom It May Concern,\n\nI am writing to dispute incorrect personal information appearing on my Equifax credit report.\n\nThe following address listed on my file is incorrect:\n4821 Westview Dr, Tampa FL 33612\n\nI have never resided at this address. Its presence on my file may be the result of a mixed file or data entry error by a creditor.\n\nUnder the FCRA, I request that this address be removed from my credit file immediately.\n\nSincerely,\nBrianna Cole`,
    status: 'Resolved',
    date_generated: daysAgo(60),
    date_sent: daysAgo(58),
    investigation_deadline: daysAgo(28),
    response_notes: 'Equifax removed the incorrect address on ' + new Date(Date.now() - 30 * 86400000).toLocaleDateString() + '. File updated successfully.',
  },
  {
    user_id: DEMO_B_ID,
    bureau: 'TransUnion',
    dispute_type: 'Hard Inquiry',
    item_disputed: 'Unauthorized Inquiry — Santander Consumer USA, July 2024',
    incorrect_information: 'Hard inquiry from Santander Consumer USA dated 07/08/2024. I did not authorize this inquiry and have no record of applying for credit through Santander.',
    correct_information: 'This inquiry should be removed. I never applied for financing with Santander Consumer USA and did not authorize this credit pull.',
    generated_letter: `To Whom It May Concern,\n\nI am formally disputing an unauthorized hard inquiry on my TransUnion credit report.\n\nInquiry Details:\n- Creditor: Santander Consumer USA\n- Date: 07/08/2024\n\nI did not apply for any credit with Santander Consumer USA and did not authorize this inquiry. This pull was made without my knowledge or consent, in violation of FCRA Section 604.\n\nI request immediate removal of this unauthorized inquiry.\n\nSincerely,\nBrianna Cole`,
    status: 'Under Investigation',
    date_generated: daysAgo(14),
    date_sent: daysAgo(12),
    investigation_deadline: daysAgo(-18),
    response_notes: 'Dispute submitted. TransUnion has 30 days to complete investigation per FCRA.',
  },
]

// ─── Credit Disputes — Demo C (Carlos Vega, Program C) ───────────────────────
const DEMO_C_DISPUTES = [
  {
    user_id: DEMO_C_ID,
    bureau: 'Experian',
    dispute_type: 'Account Information',
    item_disputed: 'Auto Loan — Ally Financial — Payment History Error (Showing 30-Day Late, August 2023)',
    incorrect_information: 'Ally Financial auto loan is showing a 30-day late payment for August 2023. This is inaccurate. Payment was submitted on 08/01/2023 via ACH — 5 days before the due date.',
    correct_information: 'Payment for August 2023 was made on time via ACH on 08/01/2023. The account should show no late payments. Bank records and payment confirmation are available.',
    generated_letter: `To Whom It May Concern,\n\nI am disputing an inaccurate late payment notation on my Experian credit report.\n\nAccount: Ally Financial — Auto Loan (Account #****7734)\nError: 30-day late payment reported for August 2023\nFact: Payment of $612 was submitted via ACH on 08/01/2023, five days before the due date of 08/06/2023.\n\nI have enclosed:\n1. ACH payment confirmation from my bank dated 08/01/2023\n2. August 2023 bank statement showing debit of $612\n\nThis error is negatively impacting my capital readiness score. Under FCRA Section 611, I request investigation and deletion of the erroneous late payment notation.\n\nSincerely,\nCarlos Vega`,
    status: 'Resolved',
    date_generated: daysAgo(55),
    date_sent: daysAgo(53),
    investigation_deadline: daysAgo(23),
    response_notes: 'Experian confirmed payment was on time. Late payment notation removed on ' + new Date(Date.now() - 25 * 86400000).toLocaleDateString() + '. Score improved +18 points.',
  },
  {
    user_id: DEMO_C_ID,
    bureau: 'Equifax',
    dispute_type: 'Account Information',
    item_disputed: 'Closed Credit Card — Reported as Open with $0 Balance (Account Status Error)',
    incorrect_information: 'A closed Capital One credit card (Account #****2291, closed 03/2022) is still being reported as "Open" on my Equifax file. The card was voluntarily closed over 2 years ago.',
    correct_information: 'Account status should be updated to "Closed — Account in Good Standing." All payments were made on time prior to closure. No balance owed.',
    generated_letter: `To Whom It May Concern,\n\nI am requesting correction of an account status error on my Equifax credit report.\n\nAccount: Capital One (Account #****2291)\nCurrent Status Reported: Open\nCorrect Status: Closed — March 2022 (Voluntarily by consumer)\n\nThis account was closed at my request in March 2022 with a $0 balance and clean payment history. Reporting it as open is inaccurate under the FCRA.\n\nI request that Equifax update the account status to reflect that it was closed in March 2022, in good standing.\n\nSincerely,\nCarlos Vega`,
    status: 'Generated',
    date_generated: daysAgo(3),
    date_sent: null,
    investigation_deadline: null,
    response_notes: null,
  },
]

// ─── Demo AB: Program A+B Dual Demo (Alex Rivera) ─────────────────────────────
const DEMO_AB_PROFILE = {
  id: DEMO_AB_ID,
  full_name: 'Alex Rivera',
  email: 'demo@sourcifylending.com',
  business_name: 'Rivera Group LLC',
  business_age: '2 years',
  entity_type: 'LLC',
  industry: 'Construction',
  monthly_revenue_range: '$10k–$25k',
  monthly_deposit_range: '$8k–$20k',
  nsf_flag: false,
  credit_score_range: '720-759',
  utilization_range: '11-20%',
  inquiry_range: '0-2',
  business_credit_reporting_status: 'recently_opened',
  assigned_program: 'program_a',
  readiness_status: 'Ready',
  current_stage: 'Application Strategy',
  progress_percentage: 40,
  subscription_status: 'active',
  portal_blocked: false,
  is_demo: true,
  admin_notes: 'Dual-program demo account. Use "Switch Program" button in sidebar to toggle between Program A and Program B views. Login: demo@sourcifylending.com / DemoSL2026!',
}

const DEMO_AB_TASKS_A = [
  { task_id: 'dab4-ta-01', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Credit Readiness', title: 'Pull All Three Credit Reports', description: 'Obtain full personal credit reports from Experian, TransUnion, and Equifax via AnnualCreditReport.com.', status: 'completed', due_date: null, requires_document: true, completed_at: daysAgo(20), sort_order: 1 },
  { task_id: 'dab4-ta-02', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Credit Readiness', title: 'Dispute Any Inaccurate Negative Items', description: 'Review each report for errors and file disputes with the bureaus for any inaccurate derogatory marks.', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(18), sort_order: 2 },
  { task_id: 'dab4-ta-03', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Credit Readiness', title: 'Pay Down Revolving Balances Below 30%', description: 'Bring all revolving credit card utilization under 30% across all accounts.', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(16), sort_order: 3 },
  { task_id: 'dab4-ta-04', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Credit Readiness', title: 'Confirm Score is 700+', description: 'Verify your FICO score has reached 700 or above before proceeding to applications.', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(14), sort_order: 4 },
  { task_id: 'dab4-ta-05', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Application Strategy', title: 'Research Best 0% Intro APR Business Cards', description: 'Identify 3–5 business cards with the longest 0% intro APR periods and highest credit limits.', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(12), sort_order: 5 },
  { task_id: 'dab4-ta-06', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Application Strategy', title: 'Freeze Unused Bureau Reports', description: 'Freeze Equifax and TransUnion before applying to limit hard inquiries to target bureaus only.', status: 'pending', due_date: daysFromNow(3), requires_document: false, completed_at: null, sort_order: 6 },
  { task_id: 'dab4-ta-07', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Application Strategy', title: 'Time Applications in a Single Window', description: 'Submit all card applications within a 7–14 day window to minimize credit impact.', status: 'locked', due_date: null, requires_document: false, completed_at: null, sort_order: 7 },
  { task_id: 'dab4-ta-08', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Card Acquisition', title: 'Submit Applications for Target Cards', description: 'Apply for your pre-selected 0% intro APR business cards using the optimal application sequence.', status: 'locked', due_date: null, requires_document: false, completed_at: null, sort_order: 8 },
  { task_id: 'dab4-ta-09', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Card Acquisition', title: 'Record Approval Amounts and APR Windows', description: 'Log each approved card, credit limit, 0% intro period end date, and minimum payment.', status: 'locked', due_date: null, requires_document: false, completed_at: null, sort_order: 9 },
  { task_id: 'dab4-ta-10', user_id: DEMO_AB_ID, program: 'program_a', stage: 'Optimization', title: 'Set Up Auto-Pay for Minimum Payments', description: 'Enable autopay for at least the minimum payment on each card to protect your credit score.', status: 'locked', due_date: null, requires_document: false, completed_at: null, sort_order: 10 },
]

const DEMO_AB_TASKS_B = [
  { task_id: 'dab4-tb-01', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Foundation', title: 'Register Business with Dun & Bradstreet (DUNS)', description: 'Obtain a free D-U-N-S number from Dun & Bradstreet to establish your business credit file.', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(20), sort_order: 1 },
  { task_id: 'dab4-tb-02', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Foundation', title: 'Register on Experian Business and Equifax Business', description: 'Create business profiles on all major business credit bureaus.', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(18), sort_order: 2 },
  { task_id: 'dab4-tb-03', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Foundation', title: 'Set Up Dedicated Business Phone & Address', description: 'Establish a 411-listed business phone number and a real business address (no PO boxes).', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(17), sort_order: 3 },
  { task_id: 'dab4-tb-04', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Foundation', title: 'Open Dedicated Business Checking Account', description: 'Open a business-only bank account and keep it separate from personal finances.', status: 'completed', due_date: null, requires_document: true, completed_at: daysAgo(16), sort_order: 4 },
  { task_id: 'dab4-tb-05', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Vendor Accounts', title: 'Apply for Uline Net-30 Account', description: 'Apply for a Net-30 account with Uline — reports to D&B, Experian Business, and Equifax Business.', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(14), sort_order: 5 },
  { task_id: 'dab4-tb-06', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Vendor Accounts', title: 'Apply for Quill Net-30 Account', description: 'Apply for a Net-30 account with Quill — reports to D&B and Experian Business.', status: 'completed', due_date: null, requires_document: false, completed_at: daysAgo(12), sort_order: 6 },
  { task_id: 'dab4-tb-07', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Vendor Accounts', title: 'Apply for Grainger Net-30 Account', description: 'Apply for a Grainger commercial account and make an initial purchase to establish a D&B PAYDEX tradeline.', status: 'pending', due_date: daysFromNow(5), requires_document: false, completed_at: null, sort_order: 7 },
  { task_id: 'dab4-tb-08', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Vendor Accounts', title: 'Verify All Vendor Accounts Are Reporting', description: 'Confirm each vendor account is appearing on your D&B, Experian Business, and Equifax Business reports.', status: 'locked', due_date: null, requires_document: false, completed_at: null, sort_order: 8 },
  { task_id: 'dab4-tb-09', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Store Credit', title: 'Apply for Home Depot Commercial Account', description: 'Net-30 commercial account — reports to D&B. Requires 1+ year in business and active DUNS.', status: 'locked', due_date: null, requires_document: false, completed_at: null, sort_order: 9 },
  { task_id: 'dab4-tb-10', user_id: DEMO_AB_ID, program: 'program_b', stage: 'Fleet Credit', title: 'Apply for earnify™fleet Fuel Card', description: 'BP/Amoco fleet card — accepted at 7,500+ locations, reports to D&B and Experian Business.', status: 'locked', due_date: null, requires_document: false, completed_at: null, sort_order: 10 },
]

const DEMO_AB_REPORTS = [
  {
    user_id: DEMO_AB_ID,
    report_type: 'credit_readiness_summary',
    title: 'Credit Readiness Summary — Alex Rivera (Demo)',
    generated_at: daysAgo(12),
    content: `**Credit Readiness Summary**\n\nClient: Alex Rivera | Business: Rivera Group LLC | Program: Dual (A + B)\n\n**Overall Readiness: READY**\n\nAlex Rivera presents a strong credit profile eligible for both the 0% Intro APR Card Strategy (Program A) and the Business Credit Builder (Program B) simultaneously.\n\n**Personal Credit Strengths**\n- FICO score estimated at 738 — well above the 700 threshold for Program A targets\n- Utilization at 15% — excellent (under 20%)\n- Only 1 hard inquiry in last 12 months\n- 2-year LLC history in construction industry\n- Clean payment history — no late payments, no derogatory marks\n\n**Program A Recommendation**\nProceed with Experian-pull target cards first. Recommended sequence:\n1. Chase Ink Business Unlimited (Experian pull — highest approval rate)\n2. Wells Fargo Signify Business Cash (Experian pull — 0% for 12 months)\n3. Capital One Spark Cash Plus after 91-day window\n\n**Program B Status**\n- DUNS registered and active ✅\n- Experian Business and Equifax Business files open ✅\n- 2 vendor accounts reporting (Uline, Quill)\n- Grainger application pending — adding this brings you to 3 D&B tradelines\n\n**Risk Assessment:** Low. Both programs are viable and can run concurrently without conflict.`,
  },
  {
    user_id: DEMO_AB_ID,
    report_type: 'tradeline_progress_report',
    title: 'Business Credit Progress Report — Rivera Group LLC',
    generated_at: daysAgo(5),
    content: `**Business Credit Progress Report**\n\nClient: Alex Rivera | Business: Rivera Group LLC | Date: ${new Date(Date.now() - 5 * 86400000).toLocaleDateString()}\n\n**Active Business Credit Files**\n- D&B DUNS: Registered ✅ | PAYDEX: 72 (improving)\n- Experian Business: File Active ✅ | Intelliscore: 61/100\n- Equifax Business: File Active ✅\n\n**Reporting Tradelines (2 Active)**\n\n| Vendor | Limit | Balance | Bureau(s) | Payment |\n|--------|-------|---------|-----------|--------|\n| Uline | $2,500 | $0 | D&B, Experian | Early x2 |\n| Quill | $1,500 | $0 | D&B | On time x1 |\n\n**PAYDEX Projection**\nCurrent: 72 | Target: 80+\nWith Grainger added and 2 more early payment cycles, projected PAYDEX reaches 80–85 within 60 days.\n\n**Program A Parallel Track**\nPersonal credit (738 FICO, 15% utilization) is application-ready now. Recommended to proceed with card applications while building business credit simultaneously.\n\n**Next Steps**\n1. Apply for Grainger Net-30 (next pending task)\n2. Freeze TransUnion + Equifax before Program A card applications\n3. Submit Program A applications within next 14 days`,
  },
]

const DEMO_AB_APPROVALS = [
  {
    id: 'dab40000-0000-4000-8000-000000000001',
    user_id: DEMO_AB_ID,
    program_type: 'Program B',
    approval_type: 'Net 30 Account',
    issuer_name: 'Uline',
    account_name: 'Uline Net-30 Trade Account',
    approved_amount: null,
    approved_limit: 2500,
    approval_date: daysAgo(14).split('T')[0],
    status: 'Approved',
    notes: 'First business credit account. Reporting to D&B and Experian Business. First payment made early.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(14),
  },
  {
    id: 'dab40000-0000-4000-8000-000000000002',
    user_id: DEMO_AB_ID,
    program_type: 'Program B',
    approval_type: 'Net 30 Account',
    issuer_name: 'Quill',
    account_name: 'Quill Office Supplies Net-30',
    approved_amount: null,
    approved_limit: 1500,
    approval_date: daysAgo(12).split('T')[0],
    status: 'Approved',
    notes: 'Approved. Initial purchase of $75 placed. Reports to D&B.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(12),
  },
  {
    id: 'dab40000-0000-4000-8000-000000000003',
    user_id: DEMO_AB_ID,
    program_type: 'Program A',
    approval_type: '0% APR Card',
    issuer_name: 'Chase',
    account_name: 'Chase Ink Business Unlimited',
    approved_amount: null,
    approved_limit: null,
    approval_date: daysFromNow(10),
    status: 'Pending',
    notes: 'Targeted for Program A application window. Freeze TransUnion + Equifax first.',
    decline_reason: null,
    mark_for_reattempt: false,
    created_at: daysAgo(2),
  },
]

const DEMO_AB_NOTIFICATIONS = [
  {
    user_id: DEMO_AB_ID,
    type: 'system',
    title: '🎉 Welcome to SourcifyLending — Dual Program Demo',
    message: 'This account shows both Program A (0% APR Card Strategy) and Program B (Business Credit Builder). Use the "Switch Program" button in the sidebar to toggle between views.',
    read: true,
    created_at: daysAgo(20),
  },
  {
    user_id: DEMO_AB_ID,
    type: 'task_due',
    title: 'Task Ready: Freeze Unused Bureau Reports',
    message: 'Your next Program A step is ready. Freeze TransUnion and Equifax before applying for target cards to protect your credit score.',
    read: false,
    created_at: daysAgo(2),
  },
  {
    user_id: DEMO_AB_ID,
    type: 'task_due',
    title: 'Program B: Apply for Grainger Net-30',
    message: 'Your Uline and Quill accounts are active. Apply for Grainger now to reach 3 D&B tradelines — the key milestone for PAYDEX 80+.',
    read: false,
    created_at: daysAgo(1),
  },
  {
    user_id: DEMO_AB_ID,
    type: 'ai_update',
    title: 'Both programs are active and progressing',
    message: 'Program A: Application Strategy 60% complete. Program B: Vendor Accounts 67% complete. You\'re ahead of schedule on both tracks.',
    read: false,
    created_at: daysAgo(3),
  },
]

const DEMO_AB_DOCUMENTS = [
  {
    user_id: DEMO_AB_ID,
    document_type: 'personal_credit_report',
    file_url: 'https://placehold.co/600x400?text=Credit+Report+Demo',
    file_name: 'alex_rivera_experian_report.pdf',
    file_size: 289792,
    uploaded_at: daysAgo(19),
    review_status: 'approved',
    notes: 'Experian report. FICO 738. Utilization 15%. 1 inquiry. Clean payment history.',
  },
  {
    user_id: DEMO_AB_ID,
    document_type: 'business_formation',
    file_url: 'https://placehold.co/600x400?text=LLC+Formation+Demo',
    file_name: 'rivera_group_llc_articles.pdf',
    file_size: 198656,
    uploaded_at: daysAgo(18),
    review_status: 'approved',
    notes: 'Florida LLC. 2 years in business. Construction industry.',
  },
]

const DEMO_AB_BIZ_CREDIT_PROFILE = {
  user_id: DEMO_AB_ID,
  duns_number: '07-445-3821',
  duns_status: 'verified',
  duns_date: daysAgo(60).split('T')[0],
  experian_status: 'registered',
  experian_date: daysAgo(45).split('T')[0],
  experian_score: null,
  equifax_status: 'registered',
  equifax_date: daysAgo(30).split('T')[0],
  equifax_score: null,
  nav_status: 'registered',
  nav_date: daysAgo(30).split('T')[0],
  paydex_score: 72,
  paydex_date: daysAgo(7).split('T')[0],
  intelliscore: 61,
  intelliscore_date: daysAgo(7).split('T')[0],
  notes: 'PAYDEX 72 — improving. 2 tradelines active (Uline, Quill). Target 80+ after Grainger addition.',
}

const DEMO_AB_CREDIBILITY = (() => {
  const allKeys = ['ein_obtained','business_bank_account','business_address','business_phone_411',
    'professional_email','business_website','duns_registered','experian_business_profile',
    'equifax_business_profile','google_business_listed','business_license','naics_code_assigned']
  const completedKeys = ['ein_obtained','business_bank_account','business_address','business_phone_411',
    'professional_email','duns_registered','experian_business_profile','equifax_business_profile']
  return allKeys.map(key => ({ user_id: DEMO_AB_ID, item_key: key, is_complete: completedKeys.includes(key) }))
})()

const DEMO_AB_TRADELINES = [
  { user_id: DEMO_AB_ID, creditor_name: 'Uline', account_type: 'Net 30', credit_limit: 2500, balance: 0, payment_status: 'current', date_opened: daysAgo(60).split('T')[0], reporting_bureaus: ['D&B', 'Experian Business'], notes: 'First net-30 account. 2 early payment cycles.' },
  { user_id: DEMO_AB_ID, creditor_name: 'Quill', account_type: 'Net 30', credit_limit: 1500, balance: 0, payment_status: 'current', date_opened: daysAgo(45).split('T')[0], reporting_bureaus: ['D&B'], notes: 'Office supplies account. 1 payment cycle completed.' },
]

const DEMO_AB_DISPUTES = [
  {
    user_id: DEMO_AB_ID,
    bureau: 'Experian',
    dispute_type: 'Hard Inquiry',
    item_disputed: 'Unauthorized Hard Inquiry — Santander Consumer, April 2024',
    incorrect_information: 'Hard inquiry from Santander Consumer USA dated 04/22/2024. I never applied for any financing through Santander and did not authorize this credit pull.',
    correct_information: 'This inquiry should be removed. I did not apply for any Santander product and this pull was made without my consent.',
    generated_letter: `To Whom It May Concern,\n\nI am formally disputing an unauthorized hard inquiry on my Experian credit report.\n\nInquiry: Santander Consumer USA | Date: 04/22/2024\n\nI did not apply for credit with Santander Consumer USA and did not authorize this inquiry. Per FCRA Section 604, credit may only be pulled with a permissible purpose. No such purpose exists here.\n\nI request this inquiry be immediately removed.\n\nSincerely,\nAlex Rivera`,
    status: 'Resolved',
    date_generated: daysAgo(35),
    date_sent: daysAgo(33),
    investigation_deadline: daysAgo(3),
    response_notes: 'Experian removed the unauthorized inquiry on ' + new Date(Date.now() - 5 * 86400000).toLocaleDateString() + '. Score improved +6 points.',
  },
  {
    user_id: DEMO_AB_ID,
    bureau: 'TransUnion',
    dispute_type: 'Account Information',
    item_disputed: 'Personal Visa Card — Balance Showing $1,800 (Should Be $0)',
    incorrect_information: 'A personal Visa card is showing an $1,800 balance on TransUnion. This card was paid in full and closed in February 2024.',
    correct_information: 'Balance should be $0. Card was paid in full and closed February 2024. Closing letter is available from the issuer.',
    generated_letter: `To Whom It May Concern,\n\nI am disputing an inaccurate balance on a closed account appearing on my TransUnion credit report.\n\nAccount: Personal Visa (closed 02/2024)\nReported Balance: $1,800\nCorrect Balance: $0 (paid in full prior to closure)\n\nThis incorrect balance is inflating my reported utilization. Under FCRA Section 611, I request investigation and correction.\n\nSincerely,\nAlex Rivera`,
    status: 'Under Investigation',
    date_generated: daysAgo(18),
    date_sent: daysAgo(16),
    investigation_deadline: daysAgo(-14),
    response_notes: 'TransUnion acknowledged dispute on ' + new Date(Date.now() - 14 * 86400000).toLocaleDateString() + '. Investigation in progress.',
  },
]

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const errors: string[] = []

  // ── Biz credit profile seed data ─────────────────────────────────────────────
  const DEMO_A_BIZ_CREDIT_PROFILE = {
    user_id: DEMO_A_ID,
    duns_number: null, duns_status: 'not_started', duns_date: null,
    experian_status: 'not_started', experian_date: null, experian_score: null,
    equifax_status: 'not_started', equifax_date: null, equifax_score: null,
    nav_status: 'not_started', nav_date: null,
    paydex_score: null, paydex_date: null,
    intelliscore: null, intelliscore_date: null, notes: 'Business credit not yet established — focus on personal credit optimization first.',
  }

  const DEMO_B_BIZ_CREDIT_PROFILE = {
    user_id: DEMO_B_ID,
    duns_number: '08-734-5219', duns_status: 'verified', duns_date: daysAgo(90).split('T')[0],
    experian_status: 'registered', experian_date: daysAgo(75).split('T')[0], experian_score: null,
    equifax_status: 'registered', equifax_date: daysAgo(60).split('T')[0], equifax_score: null,
    nav_status: 'registered', nav_date: daysAgo(60).split('T')[0],
    paydex_score: 82, paydex_date: daysAgo(14).split('T')[0],
    intelliscore: 58, intelliscore_date: daysAgo(14).split('T')[0],
    notes: 'PAYDEX 82 — on track for 90+. 4 vendor accounts reporting. Staples pending.',
  }

  const DEMO_C_BIZ_CREDIT_PROFILE = {
    user_id: DEMO_C_ID,
    duns_number: '06-221-9847', duns_status: 'verified', duns_date: daysAgo(180).split('T')[0],
    experian_status: 'verified', experian_date: daysAgo(150).split('T')[0], experian_score: 72,
    equifax_status: 'verified', equifax_date: daysAgo(120).split('T')[0], equifax_score: 68,
    nav_status: 'registered', nav_date: daysAgo(120).split('T')[0],
    paydex_score: 91, paydex_date: daysAgo(7).split('T')[0],
    intelliscore: 74, intelliscore_date: daysAgo(7).split('T')[0],
    notes: 'Strong PAYDEX 91. All bureaus verified. Monitoring for lender qualification.',
  }

  // ── Credibility checklist seed data ──────────────────────────────────────────
  const makeChecklist = (userId: string, completedKeys: string[]) =>
    ['ein_obtained','business_bank_account','business_address','business_phone_411',
     'professional_email','business_website','duns_registered','experian_business_profile',
     'equifax_business_profile','google_business_listed','business_license','naics_code_assigned',
    ].map(key => ({
      user_id: userId,
      item_key: key,
      is_complete: completedKeys.includes(key),
    }))

  const DEMO_A_CREDIBILITY = makeChecklist(DEMO_A_ID, [
    'ein_obtained', 'business_bank_account', 'business_address', 'professional_email',
  ])

  const DEMO_B_CREDIBILITY = makeChecklist(DEMO_B_ID, [
    'ein_obtained','business_bank_account','business_address','business_phone_411',
    'professional_email','business_website','duns_registered','experian_business_profile',
    'google_business_listed','naics_code_assigned',
  ])

  const DEMO_C_CREDIBILITY = makeChecklist(DEMO_C_ID, [
    'ein_obtained','business_bank_account','business_address','business_phone_411',
    'professional_email','business_website','duns_registered','experian_business_profile',
    'equifax_business_profile','google_business_listed','business_license','naics_code_assigned',
  ])

  // ── Business tradelines seed data ─────────────────────────────────────────────
  const DEMO_B_TRADELINES = [
    { user_id: DEMO_B_ID, creditor_name: 'Uline', account_type: 'Net 30', credit_limit: 2500, balance: 0, payment_status: 'current', date_opened: daysAgo(85).split('T')[0], reporting_bureaus: ['D&B', 'Experian Business'], notes: 'First net-30 account. Paid early 3 consecutive cycles.' },
    { user_id: DEMO_B_ID, creditor_name: 'Quill', account_type: 'Net 30', credit_limit: 1500, balance: 0, payment_status: 'current', date_opened: daysAgo(70).split('T')[0], reporting_bureaus: ['D&B'], notes: 'Office supplies. Paid on time.' },
    { user_id: DEMO_B_ID, creditor_name: 'Grainger', account_type: 'Net 30', credit_limit: 3000, balance: 480, payment_status: 'current', date_opened: daysAgo(55).split('T')[0], reporting_bureaus: ['D&B', 'Experian Business'], notes: 'Industrial supplies. Active account.' },
    { user_id: DEMO_B_ID, creditor_name: 'Office Depot Business', account_type: 'Net 30', credit_limit: 1000, balance: 0, payment_status: 'current', date_opened: daysAgo(40).split('T')[0], reporting_bureaus: ['Experian Business'], notes: 'Recently started reporting.' },
  ]

  const DEMO_C_TRADELINES = [
    { user_id: DEMO_C_ID, creditor_name: 'Uline', account_type: 'Net 30', credit_limit: 5000, balance: 0, payment_status: 'current', date_opened: daysAgo(170).split('T')[0], reporting_bureaus: ['D&B', 'Experian Business'], notes: 'Established account. Consistent early payment.' },
    { user_id: DEMO_C_ID, creditor_name: 'Quill', account_type: 'Net 30', credit_limit: 2500, balance: 0, payment_status: 'current', date_opened: daysAgo(160).split('T')[0], reporting_bureaus: ['D&B'], notes: 'Office supply account — 5 reporting cycles.' },
    { user_id: DEMO_C_ID, creditor_name: 'Grainger', account_type: 'Net 30', credit_limit: 7500, balance: 1200, payment_status: 'current', date_opened: daysAgo(140).split('T')[0], reporting_bureaus: ['D&B', 'Experian Business', 'Equifax Business'], notes: 'All 3 bureaus reporting.' },
    { user_id: DEMO_C_ID, creditor_name: 'Home Depot Commercial', account_type: 'Revolving', credit_limit: 10000, balance: 2200, payment_status: 'current', date_opened: daysAgo(120).split('T')[0], reporting_bureaus: ['Experian Business'], notes: 'Revolving commercial account.' },
    { user_id: DEMO_C_ID, creditor_name: 'Staples Business Advantage', account_type: 'Net 30', credit_limit: 3000, balance: 0, payment_status: 'current', date_opened: daysAgo(90).split('T')[0], reporting_bureaus: ['D&B', 'Experian Business'], notes: '5th reporting account — unlocked card eligibility.' },
    { user_id: DEMO_C_ID, creditor_name: 'Amazon Business', account_type: 'Net 30', credit_limit: 5000, balance: 850, payment_status: 'current', date_opened: daysAgo(60).split('T')[0], reporting_bureaus: ['Experian Business'], notes: 'Most recent addition. Active purchasing.' },
  ]

  const demoUsers = [
    {
      id: DEMO_A_ID,
      email: 'demo-a@sourcifylending.com',
      password: 'Demo1234!',
      profile: DEMO_A_PROFILE,
      tasks: DEMO_A_TASKS,
      reports: DEMO_A_REPORTS,
      documents: DEMO_A_DOCUMENTS,
      notifications: DEMO_A_NOTIFICATIONS,
      approvals: DEMO_A_APPROVALS,
      bizCreditProfile: DEMO_A_BIZ_CREDIT_PROFILE,
      credibilityItems: DEMO_A_CREDIBILITY,
      tradelines: [],
      disputes: DEMO_A_DISPUTES,
      demoSecondaryProgram: null,
    },
    {
      id: DEMO_B_ID,
      email: 'demo-b@sourcifylending.com',
      password: 'Demo1234!',
      profile: DEMO_B_PROFILE,
      tasks: DEMO_B_TASKS,
      reports: DEMO_B_REPORTS,
      documents: DEMO_B_DOCUMENTS,
      notifications: DEMO_B_NOTIFICATIONS,
      approvals: DEMO_B_APPROVALS,
      bizCreditProfile: DEMO_B_BIZ_CREDIT_PROFILE,
      credibilityItems: DEMO_B_CREDIBILITY,
      tradelines: DEMO_B_TRADELINES,
      disputes: DEMO_B_DISPUTES,
      demoSecondaryProgram: null,
    },
    {
      id: DEMO_C_ID,
      email: 'demo-c@sourcifylending.com',
      password: 'Demo1234!',
      profile: DEMO_C_PROFILE,
      tasks: DEMO_C_TASKS,
      reports: DEMO_C_REPORTS,
      documents: DEMO_C_DOCUMENTS,
      notifications: DEMO_C_NOTIFICATIONS,
      approvals: [],
      bizCreditProfile: DEMO_C_BIZ_CREDIT_PROFILE,
      credibilityItems: DEMO_C_CREDIBILITY,
      tradelines: DEMO_C_TRADELINES,
      disputes: DEMO_C_DISPUTES,
      demoSecondaryProgram: null,
    },
    {
      id: DEMO_AB_ID,
      email: 'demo@sourcifylending.com',
      password: 'DemoSL2026!',
      profile: DEMO_AB_PROFILE,
      tasks: [...DEMO_AB_TASKS_A, ...DEMO_AB_TASKS_B],
      reports: DEMO_AB_REPORTS,
      documents: DEMO_AB_DOCUMENTS,
      notifications: DEMO_AB_NOTIFICATIONS,
      approvals: DEMO_AB_APPROVALS,
      bizCreditProfile: DEMO_AB_BIZ_CREDIT_PROFILE,
      credibilityItems: DEMO_AB_CREDIBILITY,
      tradelines: DEMO_AB_TRADELINES,
      disputes: DEMO_AB_DISPUTES,
      demoSecondaryProgram: 'program_b',
    },
  ]

  for (const demo of demoUsers) {
    try {
      // 1. Create or update auth user
      // Try to get existing user first
      const { data: existingUser } = await supabase.auth.admin.getUserById(demo.id)

      if (!existingUser?.user) {
        const { error: createError } = await supabase.auth.admin.createUser({
          id: demo.id,
          email: demo.email,
          password: demo.password,
          email_confirm: true,
          user_metadata: { full_name: demo.profile.full_name },
        })
        if (createError && !createError.message.includes('already')) {
          errors.push(`Auth create ${demo.email}: ${createError.message}`)
        }
      }

      // 2. Upsert profile (by fixed UUID)
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(demo.profile, { onConflict: 'id' })

      if (profileError) errors.push(`Profile ${demo.email}: ${profileError.message}`)

      // 3. Delete + reinsert tasks (idempotent)
      await supabase.from('tasks').delete().eq('user_id', demo.id)
      const { error: tasksError } = await supabase.from('tasks').insert(demo.tasks)
      if (tasksError) errors.push(`Tasks ${demo.email}: ${tasksError.message}`)

      // 4. Delete + reinsert reports
      await supabase.from('reports').delete().eq('user_id', demo.id)
      const { error: reportsError } = await supabase.from('reports').insert(demo.reports)
      if (reportsError) errors.push(`Reports ${demo.email}: ${reportsError.message}`)

      // 5. Delete + reinsert documents
      await supabase.from('documents').delete().eq('user_id', demo.id)
      const { error: docsError } = await supabase.from('documents').insert(demo.documents)
      if (docsError) errors.push(`Documents ${demo.email}: ${docsError.message}`)

      // 6. Delete + reinsert notifications
      await supabase.from('notifications').delete().eq('user_id', demo.id)
      const { error: notifsError } = await supabase.from('notifications').insert(demo.notifications)
      if (notifsError) errors.push(`Notifications ${demo.email}: ${notifsError.message}`)

      // 7. Delete + reinsert funding approvals
      await supabase.from('funding_approvals').delete().eq('user_id', demo.id)
      if (demo.approvals.length > 0) {
        const { error: approvalsError } = await supabase.from('funding_approvals').insert(demo.approvals)
        if (approvalsError) errors.push(`Approvals ${demo.email}: ${approvalsError.message}`)
      }

      // 8. Upsert business credit profile
      if (demo.bizCreditProfile) {
        const { error: bcpError } = await supabase
          .from('business_credit_profile')
          .upsert(demo.bizCreditProfile, { onConflict: 'user_id' })
        if (bcpError) errors.push(`BizCreditProfile ${demo.email}: ${bcpError.message}`)
      }

      // 9. Delete + reinsert business credibility checklist
      if (demo.credibilityItems && demo.credibilityItems.length > 0) {
        await supabase.from('business_credibility_checklist').delete().eq('user_id', demo.id)
        const { error: credError } = await supabase.from('business_credibility_checklist').insert(demo.credibilityItems)
        if (credError) errors.push(`CredibilityChecklist ${demo.email}: ${credError.message}`)
      }

      // 10. Delete + reinsert business tradelines
      if (demo.tradelines && demo.tradelines.length > 0) {
        await supabase.from('business_tradelines').delete().eq('user_id', demo.id)
        const { error: tlError } = await supabase.from('business_tradelines').insert(demo.tradelines)
        if (tlError) errors.push(`Tradelines ${demo.email}: ${tlError.message}`)
      }

      // 11. Delete + reinsert credit disputes
      if (demo.disputes && demo.disputes.length > 0) {
        await supabase.from('credit_disputes').delete().eq('user_id', demo.id)
        const { error: disputeError } = await supabase.from('credit_disputes').insert(demo.disputes)
        if (disputeError) errors.push(`Disputes ${demo.email}: ${disputeError.message}`)
      }

      // 12. Set demo_secondary_program if applicable (migration-added column — silently skip if missing)
      if (demo.demoSecondaryProgram) {
        const { error: dspError } = await supabase
          .from('profiles')
          .update({ demo_secondary_program: demo.demoSecondaryProgram })
          .eq('id', demo.id)
        if (dspError && !dspError.message.includes('column') && !dspError.message.includes('schema')) {
          errors.push(`DemoSecondaryProgram ${demo.email}: ${dspError.message}`)
        }
      }

    } catch (err) {
      errors.push(`Fatal error for ${demo.email}: ${String(err)}`)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({
      success: false,
      message: 'Seed completed with errors',
      errors,
    }, { status: 207 })
  }

  return NextResponse.json({
    success: true,
    message: 'All 4 demo accounts seeded successfully',
    accounts: [
      { name: 'Alex Mercer', email: 'demo-a@sourcifylending.com', program: 'Program A — 0% APR Advisory (pw: Demo1234!)' },
      { name: 'Brianna Cole', email: 'demo-b@sourcifylending.com', program: 'Program B — Business Credit Builder (pw: Demo1234!)' },
      { name: 'Carlos Vega', email: 'demo-c@sourcifylending.com', program: 'Program C — Capital Monitoring (pw: Demo1234!)' },
      { name: 'Alex Rivera', email: 'demo@sourcifylending.com', program: 'Program A + B Dual Demo — use Switch Program button (pw: DemoSL2026!)' },
    ],
    password: 'Demo1234!',
  })
}
