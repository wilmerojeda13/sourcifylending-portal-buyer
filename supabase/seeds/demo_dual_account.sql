-- ============================================================
-- SourcifyLending — Dual-Program Demo Account Seed
-- ============================================================
-- Creates one demo user that can switch between Program A and
-- Program B views using the "Switch Program" button in the sidebar.
-- Login: demo@sourcifylending.com / DemoSL2026!
-- ============================================================

-- ─── Auth User ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'demo@sourcifylending.com',
  crypt('DemoSL2026!', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Alex Rivera"}'::jsonb,
  NOW() - INTERVAL '20 days', NOW(),
  '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000005',
  'eeeeeeee-0000-0000-0000-000000000005',
  'eeeeeeee-0000-0000-0000-000000000005',
  'email',
  '{"sub":"eeeeeeee-0000-0000-0000-000000000005","email":"demo@sourcifylending.com"}'::jsonb,
  NOW(), NOW() - INTERVAL '20 days', NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ─── Profile ───────────────────────────────────────────────────────────────────
-- Starts as Program A. demo_secondary_program = program_b lets them switch.
-- underwriting_next_due_at set 25 days in future so the underwriting gate is passed.
INSERT INTO profiles (
  id, full_name, email, business_name, business_age, entity_type, industry,
  monthly_revenue_range, monthly_deposit_range, nsf_flag,
  credit_score_range, utilization_range, inquiry_range,
  business_credit_reporting_status,
  assigned_program, demo_secondary_program,
  readiness_status, current_stage,
  progress_percentage, subscription_status,
  account_state, is_demo,
  underwriting_next_due_at, underwriting_review_count,
  created_at, updated_at
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000005',
  'Alex Rivera', 'demo@sourcifylending.com',
  'Rivera Group LLC', '2 years', 'LLC', 'Construction',
  '$10,001 – $25,000', '$5,001 – $10,000', false,
  '720–759', 'Under 30%', '0–2 inquiries',
  'Yes — reporting on Dun & Bradstreet and Experian',
  'program_a', 'program_b',
  'Ready', 'Application Strategy',
  40, 'active',
  'active_member', true,
  NOW() + INTERVAL '25 days', 1,
  NOW() - INTERVAL '20 days', NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ─── Subscription ──────────────────────────────────────────────────────────────
INSERT INTO subscriptions (
  user_id, stripe_subscription_id, stripe_customer_id,
  status, program, current_period_start, current_period_end,
  created_at, updated_at
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000005',
  'sub_seed_demo_dual_005', 'cus_seed_demo_dual_005',
  'active', 'program_a',
  NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days',
  NOW() - INTERVAL '20 days', NOW()
)
ON CONFLICT (user_id) DO NOTHING;

-- ─── Tasks — Program A (Alex Rivera — showing Application Strategy in progress) ─
INSERT INTO tasks (task_id, user_id, program, stage, title, description, status, requires_document, sort_order, created_at) VALUES
  ('seed-demo-a-01', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Credit Readiness', 'Pull All Three Credit Reports', 'Obtain full personal credit reports from Experian, TransUnion, and Equifax via AnnualCreditReport.com.', 'completed', true, 1, NOW() - INTERVAL '20 days'),
  ('seed-demo-a-02', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Credit Readiness', 'Dispute Any Inaccurate Negative Items', 'Review each report for errors and file disputes with the bureaus for any inaccurate derogatory marks.', 'completed', false, 2, NOW() - INTERVAL '20 days'),
  ('seed-demo-a-03', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Credit Readiness', 'Pay Down Revolving Balances Below 30%', 'Bring all revolving credit card utilization under 30% across all accounts.', 'completed', false, 3, NOW() - INTERVAL '20 days'),
  ('seed-demo-a-04', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Credit Readiness', 'Confirm Score is 700+', 'Verify your FICO score has reached 700 or above before proceeding to applications.', 'completed', false, 4, NOW() - INTERVAL '18 days'),
  ('seed-demo-a-05', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Application Strategy', 'Research Best 0% Intro APR Business Cards', 'Identify 3–5 business cards with the longest 0% intro APR periods and highest credit limits.', 'completed', false, 5, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-06', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Application Strategy', 'Freeze Unused Bureau Reports', 'Freeze Equifax and TransUnion before applying to limit hard inquiries to target bureaus only.', 'pending', false, 6, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-07', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Application Strategy', 'Time Applications in a Single Window', 'Submit all card applications within a 7–14 day window to minimize credit impact.', 'locked', false, 7, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-08', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Card Acquisition', 'Submit Applications for Target Cards', 'Apply for your pre-selected 0% intro APR business cards using the optimal application sequence.', 'locked', false, 8, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-09', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Card Acquisition', 'Record Approval Amounts and APR Windows', 'Log each approved card, credit limit, 0% intro period end date, and minimum payment.', 'locked', false, 9, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-10', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Card Acquisition', 'Upload Approval Confirmation Documents', 'Upload screenshots or letters confirming each card approval.', 'locked', true, 10, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-11', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Optimization', 'Set Up Auto-Pay for Minimum Payments', 'Enable autopay for at least the minimum payment on each card to protect your credit score.', 'locked', false, 11, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-12', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Optimization', 'Deploy Capital Into Business Revenue Activities', 'Use the available 0% credit lines strategically for business operations or investments.', 'locked', false, 12, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-13', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Optimization', 'Create Payoff Plan Before Intro Period Ends', 'Build a written payoff schedule to eliminate balances before the 0% window closes.', 'locked', false, 13, NOW() - INTERVAL '15 days'),
  ('seed-demo-a-14', 'eeeeeeee-0000-0000-0000-000000000005', 'program_a', 'Optimization', 'Submit Final Progress Report', 'Upload your final statement showing balances and a summary of capital deployed.', 'locked', true, 14, NOW() - INTERVAL '15 days')
ON CONFLICT (task_id) DO NOTHING;

-- ─── Tasks — Program B (Alex Rivera — showing Store Credit in progress) ─────────
INSERT INTO tasks (task_id, user_id, program, stage, title, description, status, requires_document, sort_order, created_at) VALUES
  ('seed-demo-b-01', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Foundation', 'Register Business with Dun & Bradstreet (DUNS)', 'Obtain a free D-U-N-S number from Dun & Bradstreet to establish your business credit file.', 'completed', false, 1, NOW() - INTERVAL '20 days'),
  ('seed-demo-b-02', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Foundation', 'Register on Experian Business and Equifax Business', 'Create business profiles on all major business credit bureaus.', 'completed', false, 2, NOW() - INTERVAL '20 days'),
  ('seed-demo-b-03', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Foundation', 'Set Up Dedicated Business Phone & Address', 'Establish a 411-listed business phone number and a real business address (no PO boxes).', 'completed', false, 3, NOW() - INTERVAL '18 days'),
  ('seed-demo-b-04', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Foundation', 'Open Dedicated Business Checking Account', 'Open a business-only bank account and keep it separate from personal finances.', 'completed', true, 4, NOW() - INTERVAL '17 days'),
  ('seed-demo-b-05', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Open Uline Net-30 Account', 'Apply for a Net-30 account with Uline — one of the primary Tier-1 vendors that reports to D&B, Experian Business, and Equifax Business.', 'completed', false, 5, NOW() - INTERVAL '14 days'),
  ('seed-demo-b-06', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Open Quill Net-30 Account', 'Apply for a Net-30 account with Quill to add a D&B and Experian Business tradeline.', 'completed', false, 6, NOW() - INTERVAL '12 days'),
  ('seed-demo-b-07', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Open Grainger Net-30 Account', 'Apply for a Grainger commercial account and make an initial purchase to establish a D&B PAYDEX tradeline.', 'pending', false, 7, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-08', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Open Crown Office Supplies Net-30 Account', 'Apply for Crown Office Supplies net-30 for tri-bureau reporting (D&B, Experian Business, Equifax Business).', 'locked', false, 8, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-09', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Verify All Vendor Accounts Are Reporting', 'Confirm each vendor account is appearing on your D&B, Experian Business, and Equifax Business reports.', 'locked', false, 9, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-10', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Fleet & Gas', 'Apply for AtoB Fleet Card', 'Apply for AtoB fuel card — accepted anywhere Visa is accepted, reports tri-bureau, no PG required.', 'locked', false, 10, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-11', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Fleet & Gas', 'Apply for Coast Fleet Card', 'Apply for Coast fleet card — Visa-accepted, no PG, dual-bureau Experian Business + Equifax Business.', 'locked', false, 11, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-12', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Fleet & Gas', 'Verify Fleet Cards Reporting to Bureaus', 'Confirm fleet cards are appearing on your business credit reports.', 'locked', false, 12, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-13', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Cash & Revolving', 'Check Business Credit Score (Paydex 80+)', 'Verify your D&B Paydex score has reached 80 or higher before applying for cash revolving credit.', 'locked', false, 13, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-14', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Cash & Revolving', 'Apply for BILL Spend & Expense (Divvy) Corporate Card', 'Apply for BILL corporate card — no PG, tri-bureau business reporting, no annual fee.', 'locked', false, 14, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-15', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Cash & Revolving', 'Apply for Capital on Tap Business Credit Card', 'Apply for Capital on Tap — high limits, no annual fee options, reports to D&B and Experian Business.', 'locked', false, 15, NOW() - INTERVAL '10 days')
ON CONFLICT (task_id) DO NOTHING;

-- ─── Reports ──────────────────────────────────────────────────────────────────
INSERT INTO reports (report_id, user_id, report_type, title, content, generated_at) VALUES
  (
    'dddddddd-0000-0000-0000-000000000301',
    'eeeeeeee-0000-0000-0000-000000000005',
    'credit_readiness_summary',
    'Credit Readiness Summary — Alex Rivera (Demo)',
    E'**Overall Assessment:** Alex Rivera presents a strong credit profile for the 0% Intro APR Card Strategy.\n\n**Strengths:**\n- FICO score of 738, well above the 700 threshold\n- Revolving utilization at 24%, within the optimal range\n- Only 1 inquiry in the last 90 days\n- Business established 2 years with consistent construction industry revenue\n\n**Recommended Actions:**\n- Proceed with Experian-pull target cards first (Chase Ink Unlimited, Ink Cash)\n- Freeze TransUnion and Equifax before applying\n- Target Wells Fargo Signify and U.S. Bank Triple Cash as second-wave applications\n\n**Risk Assessment:** Low risk. Client is Ready to proceed with Application Strategy Phase.',
    NOW() - INTERVAL '12 days'
  ),
  (
    'dddddddd-0000-0000-0000-000000000302',
    'eeeeeeee-0000-0000-0000-000000000005',
    'business_credit_status',
    'Business Credit Status Report — Alex Rivera (Demo)',
    E'**Business Credit Overview — Rivera Group LLC**\n\n**D&B Status:**\n- D-U-N-S registered and active\n- 2 trade lines currently reporting\n- PAYDEX score: 76 (improving — target is 80+)\n\n**Experian Business:**\n- File active\n- Intelliscore: 68/100 (Good)\n- 2 active trade lines\n\n**Equifax Business:**\n- File active\n- 1 active trade line (Uline)\n\n**Next Steps:**\n- Open Grainger net-30 account (pending task)\n- Open Crown Office Supplies for tri-bureau coverage\n- Maintain 100% on-time payment history on all vendor accounts\n\n**Recommendation:** Foundation stage is complete. Store Credit stage is 60% complete. Fleet cards become accessible once 5+ trade lines are confirmed reporting.',
    NOW() - INTERVAL '5 days'
  )
ON CONFLICT (report_id) DO NOTHING;

-- ─── Notifications ────────────────────────────────────────────────────────────
INSERT INTO notifications (id, user_id, type, title, message, read, created_at) VALUES
  (
    'dddddddd-0000-0000-0000-000000000401',
    'eeeeeeee-0000-0000-0000-000000000005',
    'system',
    '🎉 Welcome to SourcifyLending — Dual Program Demo',
    'This is a dual-program demo account. Use the "Switch Program" button in the sidebar to switch between the Program A (0% APR Card Strategy) and Program B (Business Credit Builder) views.',
    false,
    NOW() - INTERVAL '20 days'
  ),
  (
    'dddddddd-0000-0000-0000-000000000402',
    'eeeeeeee-0000-0000-0000-000000000005',
    'task_due',
    'Task Ready: Freeze Unused Bureau Reports',
    'Your next step in Program A is to freeze unused bureau reports before submitting card applications. This protects your score from unnecessary hard inquiries.',
    false,
    NOW() - INTERVAL '3 days'
  ),
  (
    'dddddddd-0000-0000-0000-000000000403',
    'eeeeeeee-0000-0000-0000-000000000005',
    'reminder',
    'Program B: Open Grainger Account Next',
    'Your Grainger net-30 application is the next step in Program B. Your Uline and Quill accounts are active and reporting. Adding Grainger creates your third D&B tradeline.',
    false,
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Analyzer Result ──────────────────────────────────────────────────────────
INSERT INTO analyzer_results (
  id, user_id,
  business_name, business_age, entity_type, industry,
  monthly_revenue_range, monthly_deposit_range, nsf_last_90_days,
  credit_score_range, utilization_range, inquiry_count_last_90_days,
  business_credit_reporting_status, primary_goal,
  readiness_status, assigned_program,
  risk_flags, summary, recommendation,
  created_at
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000501',
  'eeeeeeee-0000-0000-0000-000000000005',
  'Rivera Group LLC', '2 years', 'LLC', 'Construction',
  '$10,001 – $25,000', '$5,001 – $10,000', false,
  '720–759', 'Under 30%', '0–2 inquiries',
  'Partially — only on Dun & Bradstreet',
  'business_cards',
  'Ready', 'program_a',
  '[]',
  'Alex Rivera presents a strong personal credit profile and active business foundation. Both Program A (0% APR Card Strategy) and Program B (Business Credit Builder) are viable pathways.',
  'Program A is recommended as the primary track given the 720+ FICO and 2-year LLC history. Program B should run concurrently to build the EIN-based credit file that unlocks fleet cards and revolving business credit within 90–120 days.',
  NOW() - INTERVAL '21 days'
)
ON CONFLICT (id) DO NOTHING;
