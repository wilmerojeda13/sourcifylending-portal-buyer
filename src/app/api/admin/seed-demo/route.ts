import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Fixed UUIDs — idempotent re-seeding
const DEMO_A_ID = '00000000-0000-4000-8000-00000000da01'
const DEMO_B_ID = '00000000-0000-4000-8000-00000000db02'
const DEMO_C_ID = '00000000-0000-4000-8000-00000000dc03'

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
    id: 'da01-appr-0001-0000-000000000001',
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
    id: 'da01-appr-0002-0000-000000000002',
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
    id: 'da01-appr-0003-0000-000000000003',
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
    id: 'da01-appr-0004-0000-000000000004',
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
    id: 'db02-appr-0001-0000-000000000001',
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
    id: 'db02-appr-0002-0000-000000000002',
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
    id: 'db02-appr-0003-0000-000000000003',
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
    id: 'db02-appr-0004-0000-000000000004',
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

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const errors: string[] = []

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
    message: 'All 3 demo users seeded successfully',
    accounts: [
      { name: 'Alex Mercer', email: 'demo-a@sourcifylending.com', program: 'Program A — 0% APR Advisory', progress: '55%' },
      { name: 'Brianna Cole', email: 'demo-b@sourcifylending.com', program: 'Program B — Business Credit Builder', progress: '48%' },
      { name: 'Carlos Vega', email: 'demo-c@sourcifylending.com', program: 'Program C — Capital Monitoring', progress: '60%' },
    ],
    password: 'Demo1234!',
  })
}
