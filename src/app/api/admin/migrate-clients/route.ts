import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// ─── Fixed UUIDs for idempotent migration ─────────────────────────────────────
const ARNOLD_ID  = '00000000-0000-4000-8001-000000000001'
const ALEX_ID    = '00000000-0000-4000-8001-000000000002'
const BRUCE_ID   = '00000000-0000-4000-8001-000000000003'

const now = new Date().toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

// ─── Profiles ─────────────────────────────────────────────────────────────────
const ARNOLD_PROFILE = {
  id: ARNOLD_ID,
  full_name: 'Arnold Mswia',
  email: 'junglemastertrucking@gmail.com',
  phone: '(678) 548-6796',
  business_name: 'Jungle Master Trucking LLC',
  entity_type: 'LLC',
  assigned_program: 'program_b',
  current_stage: 'Stage A — Vendor Trades',
  subscription_status: 'active',
  progress_percentage: 22,
  portal_blocked: false,
  is_demo: false,
  account_state: 'active_member',
  admin_notes: `MIGRATED FROM NOTION 2026-03-19

Notion Contact: https://www.notion.so/31ac10fb3198819fb7a2e3367ed78561
Notion Fulfillment: https://www.notion.so/31bc10fb31988128a6d5cb1f8df4bfc7
Progress Report: https://www.notion.so/10507beba87a40bf8aa353701bedf2aa
Drive Folder: https://drive.google.com/drive/folders/1VBdOHDXGIgv36KVMgm4xPBfNaSSt1Sjx

⚠️ MIGRATION WARNING — Stage Conflict:
  Contact record shows "Fulfillment Stage: ✅ Completed" — IGNORE.
  Client Fulfillment record shows "⚙️ Stage A — Vendor Trades" — USE THIS.

⚠️ SOS Status Note:
  Open comment on contact record showed SOS dissolved as of 03/10/2026.
  Fulfillment record confirms NC SOS verified CURRENT-ACTIVE on 03/11/2026.

Payment: $332 deposit received. Re-enrolled in Program B.
CC assistant on all emails: Doreen — Doreensantiful@gmail.com / 910-302-1507

Docs received: W-9, Secretary of State paperwork (exact file names UNCLEAR — verify in Drive).
Documents missing/pending: Not enumerated — verify in Drive folder.`,
}

const ALEX_PROFILE = {
  id: ALEX_ID,
  full_name: 'Alexander De Armas',
  email: 'alex@jzdemo.com',
  phone: '(305) 793-2984',
  business_name: 'JZ Demolition Corp',
  entity_type: 'Corp',
  assigned_program: 'program_b',
  current_stage: 'Underwriting',
  subscription_status: 'active',
  progress_percentage: 12,
  portal_blocked: false,
  is_demo: false,
  account_state: 'active_member',
  admin_notes: `MIGRATED FROM NOTION 2026-03-19

Notion Contact: https://www.notion.so/31bc10fb3198817bb873db5669b72087
Notion Fulfillment: https://www.notion.so/31bc10fb319881f9b778dcf6fafa0b0b
Progress Report: https://www.notion.so/88d65622229e4c949df381cacd8770e2
Drive Folder: https://drive.google.com/drive/folders/1peqnf8eo3M1c7aY0CrhTPkpmfkV3lK1H

⚠️ MIGRATION WARNING — Dual Fulfillment Track:
  Separate active Notion record: "Alexander De Armas — Personal Credit Dispute"
  (Stage: 🧾 Bureau Investigation) — Notion: https://www.notion.so/800569bb86eb4267b35d81ec6f44d2c3
  DO NOT mix personal credit dispute work into Program B sequencing.
  Personal dispute track is advisory/educational only — client controls the process.

🚫 HARD GATES (do not advance past until resolved):
  1. No personal credit pulls authorized.
  2. EIN-based actions only during refinance window (target: March 2026).
  3. No vendor tradelines until bureau identity alignment is confirmed.

Blocker: Missing docs — NAV account, Experian Biz, Equifax Biz, IRS EIN letter (CP575/147C).
Identity alignment pending: D&B profile review + Experian identity correction.

Payment: Setup fee paid 2026-01-29. Enrollment date: 2026-01-29.

Docs received: Articles of Incorporation, FL State Registry Active Status, W9 (EIN confirmed), Experian Business Credit Report. (Exact file names UNCLEAR — verify in Drive.)
Signed service agreement on file: SourcifyLending_JZ_Demo_deposit_service_agreement_signed.pdf`,
}

const BRUCE_PROFILE = {
  id: BRUCE_ID,
  full_name: 'Bruce Thomas',
  email: 'brucethomas829@gmail.com',
  phone: '(719) 717-5499',
  business_name: 'After Hours Plumbing & Drainage',
  entity_type: 'UNCLEAR',
  assigned_program: 'program_b',
  current_stage: 'Onboarding',
  subscription_status: 'active',
  progress_percentage: 5,
  portal_blocked: false,
  is_demo: false,
  account_state: 'active_member',
  admin_notes: `MIGRATED FROM NOTION 2026-03-19

Notion Contact: https://www.notion.so/31bc10fb319881ec854cd807645b9b36
Notion Fulfillment: https://www.notion.so/97651ff9fe2d423c8102714a3f3368aa
Drive Folder: NOT PROVIDED — must be created before document uploads.

⚠️ MIGRATION WARNING — Stage Conflict:
  Contact record shows "Fulfillment Stage: 🔍 Underwriting" — IGNORE.
  Client Fulfillment record shows "📋 Onboarding" — USE THIS.

⚠️ MIGRATION WARNING — Setup Fee Conflict:
  Contact record shows Setup Fee Paid = YES ($499 deposit received 2026-03-18).
  Fulfillment record shows Setup Fee Paid = NO.
  RESOLVE BEFORE finalizing billing state. Do not assume paid in full.
  Payment plan: $499 deposit paid. Next month: remaining $499 + first $199 recurring.

Enrollment date: 2026-03-18. Onboarding call: Sat 2026-03-21 10:00 AM MT.

Client team / CC on all communications:
  Karen (HR): (303) 301-3972 — Kaet38@gmail.com
  Carlos (Tech): (720) 588-3548 — CarlosB@techologist.com
  Lori D. (Bookkeeper): Lori@highpointbookkeeper.com

Docs received: UNCLEAR — Drive folder not provided. No files confirmed yet.
Docs requested (not confirmed received): DL front/back, EIN letter, Articles of Org, vendor account list.
Note: Bank statements NOT required for onboarding step.`,
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
const ARNOLD_TASKS = [
  // COMPLETED
  { task_id: '00000001-migr-4000-8001-000000000001', user_id: ARNOLD_ID, program: 'program_b', stage: 'Foundation', title: 'Enrollment confirmed — $332 deposit received', description: 'Client re-enrolled in Program B. $332 deposit received.', status: 'completed', completed_at: daysAgo(20), sort_order: 1, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000002', user_id: ARNOLD_ID, program: 'program_b', stage: 'Foundation', title: 'Welcome email sent requesting foundational documents', description: 'Welcome email sent. Client asked to provide foundational documents.', status: 'completed', completed_at: daysAgo(18), sort_order: 2, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000003', user_id: ARNOLD_ID, program: 'program_b', stage: 'Foundation', title: 'Client responded with W-9 and Secretary of State paperwork', description: 'Documents received: W-9 and Secretary of State paperwork. Exact file names UNCLEAR — verify in Drive.', status: 'completed', completed_at: daysAgo(15), sort_order: 3, requires_document: true, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000004', user_id: ARNOLD_ID, program: 'program_b', stage: 'Foundation', title: 'Internal verification of public records completed', description: 'Internal team verified public records for Jungle Master Trucking LLC.', status: 'completed', completed_at: daysAgo(10), sort_order: 4, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000005', user_id: ARNOLD_ID, program: 'program_b', stage: 'Foundation', title: 'LLC entity status confirmed Active with NC Secretary of State', description: 'NC Secretary of State status verified CURRENT-ACTIVE for Jungle Master Trucking LLC (SOSID: 2450482). Verified 03/11/2026. Prior administrative dissolution compliance hold cleared.', status: 'completed', completed_at: daysAgo(8), sort_order: 5, requires_document: false, due_date: null },
  // REMAINING — Bureau Setup
  { task_id: '00000001-migr-4000-8001-000000000006', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Foundation Audit completed + delivered', description: 'Complete and deliver the Foundation Audit document to the client.', status: 'pending', completed_at: null, sort_order: 6, requires_document: true, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000007', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Bureau Setup Checklist delivered', description: 'Deliver the Bureau Setup Checklist to the client.', status: 'pending', completed_at: null, sort_order: 7, requires_document: true, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000008', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Trade Line Sequencing Roadmap delivered', description: 'Deliver the Trade Line Sequencing Roadmap to the client.', status: 'pending', completed_at: null, sort_order: 8, requires_document: true, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000009', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Rules of Use document delivered', description: 'Deliver the Rules of Use document to the client.', status: 'pending', completed_at: null, sort_order: 9, requires_document: true, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000010', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Plan Delivery call completed', description: 'Complete the Plan Delivery call with the client.', status: 'pending', completed_at: null, sort_order: 10, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000011', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Confirm whether a D-U-N-S number exists — if not, request one', description: 'Check if Jungle Master Trucking LLC already has a D-U-N-S number. If not, initiate registration at dnb.com. Use exact legal name and address consistently across all bureau and vendor setups.', status: 'pending', completed_at: null, sort_order: 11, requires_document: false, due_date: '2026-03-19' },
  { task_id: '00000001-migr-4000-8001-000000000012', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Client to create Experian Business account', description: 'Have client set up their Experian Business profile. Use exact legal name + address for consistency.', status: 'pending', completed_at: null, sort_order: 12, requires_document: false, due_date: '2026-03-19' },
  { task_id: '00000001-migr-4000-8001-000000000013', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Client to create Nav account', description: 'Have client set up their Nav business credit monitoring account. Use exact legal name + address.', status: 'pending', completed_at: null, sort_order: 13, requires_document: false, due_date: '2026-03-19' },
  { task_id: '00000001-migr-4000-8001-000000000014', user_id: ARNOLD_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Legal business name format confirmed for bureau consistency', description: 'Confirm exact legal name "Jungle Master Trucking LLC" is used consistently across all bureau and vendor applications. No variations.', status: 'pending', completed_at: null, sort_order: 14, requires_document: false, due_date: null },
  // Stage A — Vendor Trades
  { task_id: '00000001-migr-4000-8001-000000000015', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Open Uline net-30 account (Phase 1 — starter vendor)', description: 'Apply for Uline net-30 trade account. Limit first round to 1–2 starter vendors only. Use exact legal name + address. Uline reports to D&B and Experian Business.', status: 'pending', completed_at: null, sort_order: 15, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000016', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Open Grainger net-30 account (Phase 1 — starter vendor)', description: 'Apply for Grainger net-30 trade account. Limit first round to 1–2 starter vendors only.', status: 'pending', completed_at: null, sort_order: 16, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000017', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Open SupplyWorks account', description: 'Apply for SupplyWorks vendor account after Phase 1 reporting confirmed.', status: 'pending', completed_at: null, sort_order: 17, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000018', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Reporting confirmed (30–90 days)', description: 'Confirm all Phase 1 vendor accounts are actively reporting to D&B and/or Experian Business.', status: 'pending', completed_at: null, sort_order: 18, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000019', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Month 1 Check-In call completed', description: '20-minute check-in call with client after first month.', status: 'pending', completed_at: null, sort_order: 19, requires_document: false, due_date: null },
  { task_id: '00000001-migr-4000-8001-000000000020', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Stage A reporting verified before proceeding', description: 'Verify all Stage A vendor accounts are reporting before advancing to Stage B.', status: 'pending', completed_at: null, sort_order: 20, requires_document: false, due_date: null },
  // Stage B
  { task_id: '00000001-migr-4000-8001-000000000021', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Staples account opened', status: 'pending', completed_at: null, sort_order: 21, requires_document: false, due_date: null, description: 'Open Staples Business Advantage account.' },
  { task_id: '00000001-migr-4000-8001-000000000022', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Home Depot account opened', status: 'pending', completed_at: null, sort_order: 22, requires_document: false, due_date: null, description: 'Open Home Depot Commercial Credit account.' },
  { task_id: '00000001-migr-4000-8001-000000000023', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Office Depot account opened', status: 'pending', completed_at: null, sort_order: 23, requires_document: false, due_date: null, description: 'Open Office Depot business account.' },
  { task_id: '00000001-migr-4000-8001-000000000024', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Month 2 Check-In call completed', status: 'pending', completed_at: null, sort_order: 24, requires_document: false, due_date: null, description: '20-minute check-in call after second month.' },
  { task_id: '00000001-migr-4000-8001-000000000025', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Stage B reporting verified before proceeding', status: 'pending', completed_at: null, sort_order: 25, requires_document: false, due_date: null, description: 'Verify all Stage B accounts reporting before advancing.' },
  // Stage C/D
  { task_id: '00000001-migr-4000-8001-000000000026', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage C — Fleet Credit', title: 'Shell fleet card opened', status: 'pending', completed_at: null, sort_order: 26, requires_document: false, due_date: null, description: 'Open Shell Fleet card.' },
  { task_id: '00000001-migr-4000-8001-000000000027', user_id: ARNOLD_ID, program: 'program_b', stage: 'Stage C — Fleet Credit', title: 'BP / WEX / Sunoco opened', status: 'pending', completed_at: null, sort_order: 27, requires_document: false, due_date: null, description: 'Open BP, WEX, or Sunoco fleet account.' },
  { task_id: '00000001-migr-4000-8001-000000000028', user_id: ARNOLD_ID, program: 'program_b', stage: 'Exit', title: 'Stage D Readiness Report delivered', status: 'pending', completed_at: null, sort_order: 28, requires_document: true, due_date: null, description: 'Deliver Stage D Readiness Report to client.' },
  { task_id: '00000001-migr-4000-8001-000000000029', user_id: ARNOLD_ID, program: 'program_b', stage: 'Exit', title: 'Month 3 Exit Review call completed', status: 'pending', completed_at: null, sort_order: 29, requires_document: false, due_date: null, description: '20-minute exit review call with client.' },
  { task_id: '00000001-migr-4000-8001-000000000030', user_id: ARNOLD_ID, program: 'program_b', stage: 'Exit', title: 'Exit Readiness Assessment delivered', status: 'pending', completed_at: null, sort_order: 30, requires_document: true, due_date: null, description: 'Deliver final Exit Readiness Assessment to client.' },
]

const ALEX_TASKS = [
  // COMPLETED
  { task_id: '00000002-migr-4000-8001-000000000001', user_id: ALEX_ID, program: 'program_b', stage: 'Foundation', title: 'Collect credit report (personal + business if available)', description: 'Credit report(s) collected during intake.', status: 'completed', completed_at: daysAgo(48), sort_order: 1, requires_document: true, due_date: null },
  { task_id: '00000002-migr-4000-8001-000000000002', user_id: ALEX_ID, program: 'program_b', stage: 'Foundation', title: 'Collect 3–4 months bank statements', description: 'Bank statements collected during intake.', status: 'completed', completed_at: daysAgo(48), sort_order: 2, requires_document: true, due_date: null },
  { task_id: '00000002-migr-4000-8001-000000000003', user_id: ALEX_ID, program: 'program_b', stage: 'Foundation', title: 'Collect debt list + EIN + business address + NAICS', description: 'Debt list, EIN, business address, and NAICS code collected and confirmed.', status: 'completed', completed_at: daysAgo(48), sort_order: 3, requires_document: true, due_date: null },
  { task_id: '00000002-migr-4000-8001-000000000004', user_id: ALEX_ID, program: 'program_b', stage: 'Foundation', title: 'Confirm D&B, Experian Biz, Equifax Biz bureau files exist', description: 'Bureau file existence confirmed for D&B and Experian Business. Equifax Business file presence NOT confirmed — verify.', status: 'completed', completed_at: daysAgo(40), sort_order: 4, requires_document: false, due_date: null },
  // BLOCKED — Missing Docs
  { task_id: '00000002-migr-4000-8001-000000000005', user_id: ALEX_ID, program: 'program_b', stage: 'Underwriting', title: '🚫 BLOCKER — Client to set up NAV monitoring account', description: 'MISSING: Client must create NAV business credit monitoring account. Do not proceed to vendor tradelines until this is complete.', status: 'pending', completed_at: null, sort_order: 5, requires_document: false, due_date: '2026-03-19' },
  { task_id: '00000002-migr-4000-8001-000000000006', user_id: ALEX_ID, program: 'program_b', stage: 'Underwriting', title: '🚫 BLOCKER — Client to set up Experian Business account', description: 'MISSING: Client must create Experian Business account. Do not proceed to vendor tradelines until complete.', status: 'pending', completed_at: null, sort_order: 6, requires_document: false, due_date: '2026-03-19' },
  { task_id: '00000002-migr-4000-8001-000000000007', user_id: ALEX_ID, program: 'program_b', stage: 'Underwriting', title: '🚫 BLOCKER — Client to set up Equifax Business account', description: 'MISSING: Client must create Equifax Business account. Equifax file presence not confirmed. Do not proceed until complete.', status: 'pending', completed_at: null, sort_order: 7, requires_document: false, due_date: '2026-03-19' },
  { task_id: '00000002-migr-4000-8001-000000000008', user_id: ALEX_ID, program: 'program_b', stage: 'Underwriting', title: '🚫 BLOCKER — Provide IRS EIN confirmation letter (CP575 or 147C)', description: 'MISSING: Client must upload IRS EIN confirmation letter (Form CP575 or 147C). Required before bureau identity alignment.', status: 'pending', completed_at: null, sort_order: 8, requires_document: true, due_date: '2026-03-19' },
  { task_id: '00000002-migr-4000-8001-000000000009', user_id: ALEX_ID, program: 'program_b', stage: 'Underwriting', title: '🚫 BLOCKER — D&B profile review + Experian identity correction', description: 'Identity alignment pending. D&B profile must be reviewed and Experian identity corrected before vendor tradelines can begin. HARD GATE: No vendor tradelines until this is resolved.', status: 'pending', completed_at: null, sort_order: 9, requires_document: false, due_date: null },
  // Remaining — Bureau Setup
  { task_id: '00000002-migr-4000-8001-000000000010', user_id: ALEX_ID, program: 'program_b', stage: 'Underwriting', title: 'Kickoff call completed (Days 1–3, 30 min)', description: 'PENDING — Kickoff call has not yet been completed. Schedule and conduct 30-minute kickoff call.', status: 'pending', completed_at: null, sort_order: 10, requires_document: false, due_date: null },
  { task_id: '00000002-migr-4000-8001-000000000011', user_id: ALEX_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Foundation Audit completed + delivered', status: 'pending', completed_at: null, sort_order: 11, requires_document: true, due_date: null, description: 'Complete and deliver Foundation Audit.' },
  { task_id: '00000002-migr-4000-8001-000000000012', user_id: ALEX_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Bureau Setup Checklist delivered (D&B / Experian Biz / Equifax Biz)', status: 'pending', completed_at: null, sort_order: 12, requires_document: true, due_date: null, description: 'Deliver Bureau Setup Checklist. Prerequisite: all blockers above must be resolved first.' },
  { task_id: '00000002-migr-4000-8001-000000000013', user_id: ALEX_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Trade Line Sequencing Roadmap delivered', status: 'pending', completed_at: null, sort_order: 13, requires_document: true, due_date: null, description: 'Deliver Trade Line Sequencing Roadmap.' },
  { task_id: '00000002-migr-4000-8001-000000000014', user_id: ALEX_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Rules of Use document delivered', status: 'pending', completed_at: null, sort_order: 14, requires_document: true, due_date: null, description: 'Deliver Rules of Use document.' },
  { task_id: '00000002-migr-4000-8001-000000000015', user_id: ALEX_ID, program: 'program_b', stage: 'Bureau Setup', title: 'Plan Delivery call completed (Days 7–10, 30 min)', status: 'pending', completed_at: null, sort_order: 15, requires_document: false, due_date: null, description: '30-minute Plan Delivery call. NOTE: No personal credit pulls authorized. EIN-based actions only during refinance window.' },
  { task_id: '00000002-migr-4000-8001-000000000016', user_id: ALEX_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Uline account opened [GATE: identity alignment must be confirmed first]', status: 'pending', completed_at: null, sort_order: 16, requires_document: false, due_date: null, description: 'HARD GATE: Do not open until bureau identity alignment is confirmed. No vendor tradelines until D&B + Experian identity corrected.' },
  { task_id: '00000002-migr-4000-8001-000000000017', user_id: ALEX_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Grainger account opened', status: 'pending', completed_at: null, sort_order: 17, requires_document: false, due_date: null, description: 'Open after identity alignment confirmed.' },
  { task_id: '00000002-migr-4000-8001-000000000018', user_id: ALEX_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'SupplyWorks (or equivalent) account opened', status: 'pending', completed_at: null, sort_order: 18, requires_document: false, due_date: null, description: 'Open after Phase 1 reporting confirmed.' },
  { task_id: '00000002-migr-4000-8001-000000000019', user_id: ALEX_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Reporting confirmed (30–90 days)', status: 'pending', completed_at: null, sort_order: 19, requires_document: false, due_date: null, description: 'Confirm vendor accounts reporting to bureaus.' },
  { task_id: '00000002-migr-4000-8001-000000000020', user_id: ALEX_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Month 1 Check-In call completed (20 min)', status: 'pending', completed_at: null, sort_order: 20, requires_document: false, due_date: null, description: '20-minute check-in call.' },
  { task_id: '00000002-migr-4000-8001-000000000021', user_id: ALEX_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Stage A reporting verified before proceeding', status: 'pending', completed_at: null, sort_order: 21, requires_document: false, due_date: null, description: 'Verify Stage A reporting before advancing.' },
  { task_id: '00000002-migr-4000-8001-000000000022', user_id: ALEX_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Staples account opened', status: 'pending', completed_at: null, sort_order: 22, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000023', user_id: ALEX_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Home Depot account opened', status: 'pending', completed_at: null, sort_order: 23, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000024', user_id: ALEX_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Office Depot account opened', status: 'pending', completed_at: null, sort_order: 24, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000025', user_id: ALEX_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Month 2 Check-In call completed (20 min)', status: 'pending', completed_at: null, sort_order: 25, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000026', user_id: ALEX_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Monthly Progress Notes delivered', status: 'pending', completed_at: null, sort_order: 26, requires_document: true, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000027', user_id: ALEX_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Stage B reporting verified before proceeding', status: 'pending', completed_at: null, sort_order: 27, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000028', user_id: ALEX_ID, program: 'program_b', stage: 'Stage C — Fleet Credit', title: 'Shell fleet card opened', status: 'pending', completed_at: null, sort_order: 28, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000029', user_id: ALEX_ID, program: 'program_b', stage: 'Stage C — Fleet Credit', title: 'BP / WEX / Sunoco opened', status: 'pending', completed_at: null, sort_order: 29, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000030', user_id: ALEX_ID, program: 'program_b', stage: 'Stage C — Fleet Credit', title: 'Monthly Progress Notes delivered', status: 'pending', completed_at: null, sort_order: 30, requires_document: true, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000031', user_id: ALEX_ID, program: 'program_b', stage: 'Stage C — Fleet Credit', title: 'Stage C reporting verified before proceeding', status: 'pending', completed_at: null, sort_order: 31, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000032', user_id: ALEX_ID, program: 'program_b', stage: 'Exit', title: 'Stage D Readiness Report delivered', status: 'pending', completed_at: null, sort_order: 32, requires_document: true, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000033', user_id: ALEX_ID, program: 'program_b', stage: 'Exit', title: 'Brex / Ramp application advised', status: 'pending', completed_at: null, sort_order: 33, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000034', user_id: ALEX_ID, program: 'program_b', stage: 'Exit', title: 'Chase Ink / Amex Biz application advised', status: 'pending', completed_at: null, sort_order: 34, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000035', user_id: ALEX_ID, program: 'program_b', stage: 'Exit', title: 'Month 3 Exit Review call completed (20 min)', status: 'pending', completed_at: null, sort_order: 35, requires_document: false, due_date: null, description: '' },
  { task_id: '00000002-migr-4000-8001-000000000036', user_id: ALEX_ID, program: 'program_b', stage: 'Exit', title: 'Exit Readiness Assessment delivered', status: 'pending', completed_at: null, sort_order: 36, requires_document: true, due_date: null, description: '' },
]

const BRUCE_TASKS = [
  { task_id: '00000003-migr-4000-8001-000000000001', user_id: BRUCE_ID, program: 'program_b', stage: 'Onboarding', title: 'Contract signed — enrollment confirmed', description: 'Contract signed and completed on 2026-03-17. $499 setup fee deposit received on 2026-03-18. Client is now active.', status: 'completed', completed_at: daysAgo(1), sort_order: 1, requires_document: true, due_date: null },
  { task_id: '00000003-migr-4000-8001-000000000002', user_id: BRUCE_ID, program: 'program_b', stage: 'Onboarding', title: 'Confirm portal login and access', description: 'Client must confirm they can log into the SourcifyLending portal. Send portal invite and confirm access before onboarding call.', status: 'pending', completed_at: null, sort_order: 2, requires_document: false, due_date: '2026-03-21' },
  { task_id: '00000003-migr-4000-8001-000000000003', user_id: BRUCE_ID, program: 'program_b', stage: 'Onboarding', title: 'Upload Driver\'s License (front and back)', description: 'Upload DL front and back via portal documents section before onboarding call on 2026-03-21.', status: 'pending', completed_at: null, sort_order: 3, requires_document: true, due_date: '2026-03-21' },
  { task_id: '00000003-migr-4000-8001-000000000004', user_id: BRUCE_ID, program: 'program_b', stage: 'Onboarding', title: 'Upload EIN confirmation letter (or any doc showing EIN)', description: 'Upload IRS EIN letter (CP575/147C preferred). If not available, any document showing EIN is acceptable for this step. Note: bank statements NOT required for this onboarding step.', status: 'pending', completed_at: null, sort_order: 4, requires_document: true, due_date: '2026-03-21' },
  { task_id: '00000003-migr-4000-8001-000000000005', user_id: BRUCE_ID, program: 'program_b', stage: 'Onboarding', title: 'Upload Articles of Organization / Incorporation (if available)', description: 'Upload formation documents if available. Not blocking if not yet available.', status: 'pending', completed_at: null, sort_order: 5, requires_document: true, due_date: '2026-03-21' },
  { task_id: '00000003-migr-4000-8001-000000000006', user_id: BRUCE_ID, program: 'program_b', stage: 'Onboarding', title: 'Provide business basics (reply-all)', description: 'Client to reply-all with: legal business name, address, entity type, date established, role/title, best phone number.', status: 'pending', completed_at: null, sort_order: 6, requires_document: false, due_date: '2026-03-21' },
  { task_id: '00000003-migr-4000-8001-000000000007', user_id: BRUCE_ID, program: 'program_b', stage: 'Onboarding', title: 'Provide existing Net-30 / vendor accounts list (if any)', description: 'Client to provide list or screenshots of any existing net-30 or vendor accounts they may already have. If none, note that.', status: 'pending', completed_at: null, sort_order: 7, requires_document: false, due_date: '2026-03-21' },
  { task_id: '00000003-migr-4000-8001-000000000008', user_id: BRUCE_ID, program: 'program_b', stage: 'Onboarding', title: 'Onboarding call — Sat 2026-03-21 at 10:00 AM MT', description: 'Scheduled onboarding call: Saturday March 21, 2026 at 10:00 AM Mountain Time. CC: Karen (Kaet38@gmail.com), Carlos (CarlosB@techologist.com), Lori (Lori@highpointbookkeeper.com).', status: 'pending', completed_at: null, sort_order: 8, requires_document: false, due_date: '2026-03-21' },
  // Remaining full checklist
  { task_id: '00000003-migr-4000-8001-000000000009', user_id: BRUCE_ID, program: 'program_b', stage: 'Foundation', title: 'Foundation Audit completed + delivered', status: 'pending', completed_at: null, sort_order: 9, requires_document: true, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000010', user_id: BRUCE_ID, program: 'program_b', stage: 'Foundation', title: 'Bureau Setup Checklist delivered', status: 'pending', completed_at: null, sort_order: 10, requires_document: true, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000011', user_id: BRUCE_ID, program: 'program_b', stage: 'Foundation', title: 'Trade Line Sequencing Roadmap delivered', status: 'pending', completed_at: null, sort_order: 11, requires_document: true, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000012', user_id: BRUCE_ID, program: 'program_b', stage: 'Foundation', title: 'Rules of Use document delivered', status: 'pending', completed_at: null, sort_order: 12, requires_document: true, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000013', user_id: BRUCE_ID, program: 'program_b', stage: 'Foundation', title: 'Plan Delivery call completed', status: 'pending', completed_at: null, sort_order: 13, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000014', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Uline account opened', status: 'pending', completed_at: null, sort_order: 14, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000015', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Grainger account opened', status: 'pending', completed_at: null, sort_order: 15, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000016', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'SupplyWorks account opened', status: 'pending', completed_at: null, sort_order: 16, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000017', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Reporting confirmed (30–90 days)', status: 'pending', completed_at: null, sort_order: 17, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000018', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Month 1 Check-In call completed', status: 'pending', completed_at: null, sort_order: 18, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000019', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage A — Vendor Trades', title: 'Stage A reporting verified before proceeding', status: 'pending', completed_at: null, sort_order: 19, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000020', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Staples account opened', status: 'pending', completed_at: null, sort_order: 20, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000021', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Home Depot account opened', status: 'pending', completed_at: null, sort_order: 21, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000022', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Office Depot account opened', status: 'pending', completed_at: null, sort_order: 22, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000023', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Month 2 Check-In call completed', status: 'pending', completed_at: null, sort_order: 23, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000024', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage B — Store Credit', title: 'Stage B reporting verified before proceeding', status: 'pending', completed_at: null, sort_order: 24, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000025', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage C — Fleet Credit', title: 'Shell fleet card opened', status: 'pending', completed_at: null, sort_order: 25, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000026', user_id: BRUCE_ID, program: 'program_b', stage: 'Stage C — Fleet Credit', title: 'BP / WEX / Sunoco opened', status: 'pending', completed_at: null, sort_order: 26, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000027', user_id: BRUCE_ID, program: 'program_b', stage: 'Exit', title: 'Stage D Readiness Report delivered', status: 'pending', completed_at: null, sort_order: 27, requires_document: true, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000028', user_id: BRUCE_ID, program: 'program_b', stage: 'Exit', title: 'Month 3 Exit Review call completed', status: 'pending', completed_at: null, sort_order: 28, requires_document: false, due_date: null, description: '' },
  { task_id: '00000003-migr-4000-8001-000000000029', user_id: BRUCE_ID, program: 'program_b', stage: 'Exit', title: 'Exit Readiness Assessment delivered', status: 'pending', completed_at: null, sort_order: 29, requires_document: true, due_date: null, description: '' },
]

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const errors: string[] = []
  const results: string[] = []

  const clients = [
    { id: ARNOLD_ID, email: 'junglemastertrucking@gmail.com', name: 'Arnold Mswia',    profile: ARNOLD_PROFILE, tasks: ARNOLD_TASKS },
    { id: ALEX_ID,   email: 'alex@jzdemo.com',                name: 'Alexander De Armas', profile: ALEX_PROFILE, tasks: ALEX_TASKS },
    { id: BRUCE_ID,  email: 'brucethomas829@gmail.com',       name: 'Bruce Thomas',    profile: BRUCE_PROFILE, tasks: BRUCE_TASKS },
  ]

  for (const client of clients) {
    try {
      // 1. Create auth user if not exists
      const { data: existing } = await supabase.auth.admin.getUserById(client.id)
      if (!existing?.user) {
        const { error: createErr } = await supabase.auth.admin.createUser({
          id: client.id,
          email: client.email,
          email_confirm: true,
          user_metadata: { full_name: client.name },
        })
        if (createErr && !createErr.message.includes('already')) {
          errors.push(`Auth ${client.email}: ${createErr.message}`)
          continue
        }
      }

      // 2. Upsert profile
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({ ...client.profile, created_at: now, updated_at: now }, { onConflict: 'id' })
      if (profileErr) errors.push(`Profile ${client.email}: ${profileErr.message}`)

      // 3. Upsert memberships
      const { error: memberErr } = await supabase
        .from('memberships')
        .upsert({
          user_id: client.id,
          program_code: 'program_b',
          status: 'active',
          activated_at: now,
          activated_by: user.email,
        }, { onConflict: 'user_id,program_code' })
      if (memberErr) errors.push(`Membership ${client.email}: ${memberErr.message}`)

      // 4. Upsert subscription record
      const { error: subErr } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: client.id,
          program: 'program_b',
          status: 'active',
          access_status: 'active',
          billing_status: 'partial_setup_paid',
          billing_source: 'manual_off_platform',
          activation_source: 'admin_activated',
          created_at: now,
          updated_at: now,
        }, { onConflict: 'user_id' })
      if (subErr) errors.push(`Subscription ${client.email}: ${subErr.message}`)

      // 5. Delete + reinsert tasks (idempotent)
      await supabase.from('tasks').delete().eq('user_id', client.id)
      const { error: tasksErr } = await supabase.from('tasks').insert(client.tasks)
      if (tasksErr) errors.push(`Tasks ${client.email}: ${tasksErr.message}`)

      results.push(client.name)
    } catch (err) {
      errors.push(`Fatal ${client.email}: ${String(err)}`)
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    migrated: results,
    errors,
    message: errors.length === 0
      ? 'All 3 clients migrated successfully. Use Admin → Members to send portal invites.'
      : 'Migration completed with some errors.',
  }, { status: errors.length === 0 ? 200 : 207 })
}
