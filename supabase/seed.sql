-- ============================================================
-- SourcifyLending Portal — Seed Data
-- ============================================================
-- Creates demo auth users + full profile/task/report data.
-- Safe to re-run (ON CONFLICT DO NOTHING everywhere).
-- ============================================================

-- ─── Create demo auth users first (required for FK on profiles) ─────────────
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change
) VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'jordan@example.com',
    crypt('demo_password_123', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Jordan Mitchell"}'::jsonb,
    NOW() - INTERVAL '45 days', NOW(),
    '', '', '', ''
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'samantha@example.com',
    crypt('demo_password_123', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Samantha Rivera"}'::jsonb,
    NOW() - INTERVAL '30 days', NOW(),
    '', '', '', ''
  ),
  (
    'cccccccc-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'marcus@example.com',
    crypt('demo_password_123', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Marcus Johnson"}'::jsonb,
    NOW() - INTERVAL '60 days', NOW(),
    '', '', '', ''
  ),
  -- Dual-program demo account (Program A + Program B switcher)
  (
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

-- Also create identities for each demo user (required by Supabase auth)
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"jordan@example.com"}'::jsonb, NOW(), NOW() - INTERVAL '45 days', NOW()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'email', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","email":"samantha@example.com"}'::jsonb, NOW(), NOW() - INTERVAL '30 days', NOW()),
  ('cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 'email', '{"sub":"cccccccc-0000-0000-0000-000000000003","email":"marcus@example.com"}'::jsonb, NOW(), NOW() - INTERVAL '60 days', NOW()),
  ('eeeeeeee-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000005', 'email', '{"sub":"eeeeeeee-0000-0000-0000-000000000005","email":"demo@sourcifylending.com"}'::jsonb, NOW(), NOW() - INTERVAL '20 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── Profiles ─────────────────────────────────────────────────────────────────

INSERT INTO profiles (
  id, full_name, email, business_name, business_age, entity_type, industry,
  monthly_revenue_range, monthly_deposit_range, nsf_flag,
  credit_score_range, utilization_range, inquiry_range,
  business_credit_reporting_status,
  assigned_program, readiness_status, current_stage,
  progress_percentage, subscription_status,
  created_at, updated_at
) VALUES
  -- Program A — 0% Intro APR Card Strategy client
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Jordan Mitchell', 'jordan@example.com',
    'Mitchell Digital LLC', '3 years', 'LLC', 'Marketing & Advertising',
    '$10,001 – $25,000', '$5,001 – $10,000', false,
    '720–759', 'Under 30%', '0–2 inquiries',
    'Yes — reporting on Dun & Bradstreet and Experian',
    'program_a', 'Ready', 'Application Strategy',
    35, 'active',
    NOW() - INTERVAL '45 days', NOW()
  ),
  -- Program B — Business Credit Builder client
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    'Samantha Rivera', 'samantha@example.com',
    'Rivera Consulting Group', '1 year', 'LLC', 'Consulting',
    '$5,001 – $10,000', '$2,001 – $5,000', false,
    '650–679', '31–49%', '3–5 inquiries',
    'Partially — only on Dun & Bradstreet',
    'program_b', 'Conditionally Ready', 'Vendor Accounts',
    20, 'active',
    NOW() - INTERVAL '30 days', NOW()
  ),
  -- Program C — Capital Monitoring Membership client
  (
    'cccccccc-0000-0000-0000-000000000003',
    'Marcus Johnson', 'marcus@example.com',
    'Johnson Holdings Inc', '5+ years', 'S-Corp', 'Real Estate',
    '$25,001 – $50,000', '$10,001 – $25,000', false,
    '760+', 'Under 30%', '0–2 inquiries',
    'Yes — reporting on all major bureaus',
    'program_c', 'Ready', 'Monthly Review',
    60, 'active',
    NOW() - INTERVAL '60 days', NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Subscriptions ────────────────────────────────────────────────────────────

INSERT INTO subscriptions (
  user_id, stripe_subscription_id, stripe_customer_id,
  status, program, current_period_start, current_period_end,
  created_at, updated_at
) VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'sub_seed_program_a_001', 'cus_seed_jordan_001',
    'active', 'program_a',
    NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days',
    NOW() - INTERVAL '45 days', NOW()
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    'sub_seed_program_b_002', 'cus_seed_samantha_002',
    'active', 'program_b',
    NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days',
    NOW() - INTERVAL '30 days', NOW()
  ),
  (
    'cccccccc-0000-0000-0000-000000000003',
    'sub_seed_program_c_003', 'cus_seed_marcus_003',
    'active', 'program_c',
    NOW() - INTERVAL '30 days', NOW(),
    NOW() - INTERVAL '60 days', NOW()
  )
ON CONFLICT (user_id) DO NOTHING;

-- ─── Tasks — Program A (Jordan Mitchell) ──────────────────────────────────────

INSERT INTO tasks (task_id, user_id, program, stage, title, description, status, requires_document, sort_order, created_at) VALUES
  ('seed-a-01', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Credit Readiness', 'Pull All Three Credit Reports', 'Obtain your full personal credit reports from Experian, TransUnion, and Equifax via AnnualCreditReport.com.', 'completed', true, 1, NOW() - INTERVAL '45 days'),
  ('seed-a-02', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Credit Readiness', 'Dispute Any Inaccurate Negative Items', 'Review each report for errors and file disputes with the bureaus for any inaccurate derogatory marks.', 'completed', false, 2, NOW() - INTERVAL '45 days'),
  ('seed-a-03', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Credit Readiness', 'Pay Down Revolving Balances Below 30%', 'Bring all revolving credit card utilization under 30% across all accounts.', 'completed', false, 3, NOW() - INTERVAL '45 days'),
  ('seed-a-04', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Credit Readiness', 'Confirm Score is 700+', 'Verify your FICO score has reached 700 or above before proceeding to applications.', 'completed', false, 4, NOW() - INTERVAL '45 days'),
  ('seed-a-05', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Application Strategy', 'Research Best 0% Intro APR Business Cards', 'Identify 3–5 business cards with the longest 0% intro APR periods and highest credit limits.', 'completed', false, 5, NOW() - INTERVAL '40 days'),
  ('seed-a-06', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Application Strategy', 'Freeze Unused Bureau Reports', 'Freeze Equifax and TransUnion (or whichever bureaus target cards do not pull) to limit hard inquiries.', 'pending', false, 6, NOW() - INTERVAL '40 days'),
  ('seed-a-07', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Application Strategy', 'Time Applications in a Single Window', 'Submit all card applications within a 7–14 day window to minimize credit impact.', 'locked', false, 7, NOW() - INTERVAL '40 days'),
  ('seed-a-08', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Card Acquisition', 'Submit Applications for Target Cards', 'Apply for your pre-selected 0% intro APR business cards using the optimal application sequence.', 'locked', false, 8, NOW() - INTERVAL '40 days'),
  ('seed-a-09', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Card Acquisition', 'Record Approval Amounts and APR Windows', 'Log each approved card, credit limit, 0% intro period end date, and minimum payment.', 'locked', false, 9, NOW() - INTERVAL '40 days'),
  ('seed-a-10', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Card Acquisition', 'Upload Approval Confirmation Documents', 'Upload screenshots or letters confirming each card approval.', 'locked', true, 10, NOW() - INTERVAL '40 days'),
  ('seed-a-11', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Optimization', 'Set Up Auto-Pay for Minimum Payments', 'Enable autopay for at least the minimum payment on each card to protect your credit score.', 'locked', false, 11, NOW() - INTERVAL '40 days'),
  ('seed-a-12', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Optimization', 'Deploy Capital Into Business Revenue Activities', 'Use the available 0% credit lines strategically for business operations or investments.', 'locked', false, 12, NOW() - INTERVAL '40 days'),
  ('seed-a-13', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Optimization', 'Create Payoff Plan Before Intro Period Ends', 'Build a written payoff schedule to eliminate balances before the 0% window closes.', 'locked', false, 13, NOW() - INTERVAL '40 days'),
  ('seed-a-14', 'aaaaaaaa-0000-0000-0000-000000000001', 'program_a', 'Optimization', 'Submit Final Progress Report', 'Upload your final statement showing balances and a summary of capital deployed.', 'locked', true, 14, NOW() - INTERVAL '40 days')
ON CONFLICT (task_id) DO NOTHING;

-- ─── Tasks — Program B (Samantha Rivera) ──────────────────────────────────────

INSERT INTO tasks (task_id, user_id, program, stage, title, description, status, requires_document, sort_order, created_at) VALUES
  ('seed-b-01', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Foundation', 'Register Business with Dun & Bradstreet (DUNS)', 'Obtain a free D-U-N-S number from Dun & Bradstreet to establish your business credit file.', 'completed', false, 1, NOW() - INTERVAL '30 days'),
  ('seed-b-02', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Foundation', 'Register on Experian Business and Equifax Business', 'Create business profiles on all major business credit bureaus.', 'completed', false, 2, NOW() - INTERVAL '30 days'),
  ('seed-b-03', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Foundation', 'Set Up Dedicated Business Phone & Address', 'Establish a 411-listed business phone number and a real business address (no PO boxes).', 'completed', false, 3, NOW() - INTERVAL '30 days'),
  ('seed-b-04', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Foundation', 'Open Dedicated Business Checking Account', 'Open a business-only bank account and keep it separate from personal finances.', 'completed', true, 4, NOW() - INTERVAL '30 days'),
  ('seed-b-05', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Vendor Accounts', 'Open Uline Net-30 Account', 'Apply for a Net-30 account with Uline — one of the primary Tier-1 vendors that reports to D&B.', 'pending', false, 5, NOW() - INTERVAL '25 days'),
  ('seed-b-06', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Vendor Accounts', 'Open Quill Net-30 Account', 'Apply for a Net-30 account with Quill, a staples-owned office supply vendor reporting to D&B.', 'locked', false, 6, NOW() - INTERVAL '25 days'),
  ('seed-b-07', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Vendor Accounts', 'Open Grainger Net-30 Account', 'Apply for a Grainger account and make an initial purchase to establish a trade line.', 'locked', false, 7, NOW() - INTERVAL '25 days'),
  ('seed-b-08', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Vendor Accounts', 'Verify All Vendor Accounts Are Reporting', 'Confirm each vendor account is appearing on your D&B and Experian Business reports.', 'locked', false, 8, NOW() - INTERVAL '25 days'),
  ('seed-b-09', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Store Credit', 'Apply for Home Depot Business Credit Card', 'Apply for the Home Depot Pro Credit Card — available with established vendor history.', 'locked', false, 9, NOW() - INTERVAL '25 days'),
  ('seed-b-10', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Store Credit', 'Apply for Office Depot/OfficeMax Business Card', 'Apply for the Office Depot Business Credit Account once vendor lines are established.', 'locked', false, 10, NOW() - INTERVAL '25 days'),
  ('seed-b-11', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Store Credit', 'Use and Pay Store Cards on Time', 'Make monthly purchases on each store card and pay the full balance before due dates.', 'locked', false, 11, NOW() - INTERVAL '25 days'),
  ('seed-b-12', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Fleet Credit', 'Apply for WEX Fleet Card', 'Apply for a WEX Fleet fuel card — requires 3+ trade lines reporting.', 'locked', false, 12, NOW() - INTERVAL '25 days'),
  ('seed-b-13', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Fleet Credit', 'Apply for Shell Fleet Card', 'Apply for the Shell Small Business Card as a secondary fleet line.', 'locked', false, 13, NOW() - INTERVAL '25 days'),
  ('seed-b-14', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Fleet Credit', 'Verify Fleet Cards Reporting to Bureaus', 'Confirm fleet cards are appearing on your business credit reports.', 'locked', false, 14, NOW() - INTERVAL '25 days'),
  ('seed-b-15', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Cash Credit Readiness', 'Check Business Credit Score (Paydex 80+)', 'Verify your D&B Paydex score has reached 80 or higher before applying for cash credit.', 'locked', false, 15, NOW() - INTERVAL '25 days'),
  ('seed-b-16', 'bbbbbbbb-0000-0000-0000-000000000002', 'program_b', 'Cash Credit Readiness', 'Apply for Business Cash Credit Card', 'Apply for a business Visa or Mastercard with a cash credit line from your bank or credit union.', 'locked', false, 16, NOW() - INTERVAL '25 days')
ON CONFLICT (task_id) DO NOTHING;

-- ─── Tasks — Program C (Marcus Johnson) ───────────────────────────────────────

INSERT INTO tasks (task_id, user_id, program, stage, title, description, status, requires_document, sort_order, created_at) VALUES
  ('seed-c-01', 'cccccccc-0000-0000-0000-000000000003', 'program_c', 'Monthly Review', 'Pull Current Personal Credit Reports', 'Download updated reports from all three bureaus for this month''s review cycle.', 'completed', true, 1, NOW() - INTERVAL '60 days'),
  ('seed-c-02', 'cccccccc-0000-0000-0000-000000000003', 'program_c', 'Monthly Review', 'Review Business Credit Reports (D&B, Experian, Equifax)', 'Check all business bureau reports for new trade lines, scores, and any derogatory marks.', 'completed', true, 2, NOW() - INTERVAL '60 days'),
  ('seed-c-03', 'cccccccc-0000-0000-0000-000000000003', 'program_c', 'Monthly Review', 'Check for New Inquiries or Negative Marks', 'Identify any hard inquiries or new negative items added since last month.', 'completed', false, 3, NOW() - INTERVAL '60 days'),
  ('seed-c-04', 'cccccccc-0000-0000-0000-000000000003', 'program_c', 'Monthly Review', 'Generate AI Capital Readiness Report', 'Request an AI-generated capital readiness analysis for this month.', 'pending', false, 4, NOW() - INTERVAL '30 days'),
  ('seed-c-05', 'cccccccc-0000-0000-0000-000000000003', 'program_c', 'Monthly Review', 'Review Funding Opportunities Identified', 'Review lender matches and funding programs flagged by the AI this cycle.', 'locked', false, 5, NOW() - INTERVAL '30 days'),
  ('seed-c-06', 'cccccccc-0000-0000-0000-000000000003', 'program_c', 'Monthly Review', 'Submit Monthly Progress Check-In', 'Complete the monthly check-in survey and upload any new financial documents.', 'locked', true, 6, NOW() - INTERVAL '30 days')
ON CONFLICT (task_id) DO NOTHING;

-- ─── Reports ──────────────────────────────────────────────────────────────────

INSERT INTO reports (report_id, user_id, report_type, title, content, generated_at) VALUES
  (
    'eeeeeeee-0000-0000-0000-000000000101',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'credit_readiness_summary',
    'Credit Readiness Summary — Jordan Mitchell',
    E'**Overall Assessment:** Jordan Mitchell presents a strong credit profile for the 0% Intro APR Card Strategy.\n\n**Strengths:**\n- FICO score of 740, well above the 700 threshold\n- Revolving utilization at 22%, within the optimal range\n- Only 1 inquiry in the last 90 days\n- Business established 3 years with consistent revenue\n\n**Recommended Actions:**\n- Proceed with Experian-pull target cards first\n- Freeze TransUnion and Equifax before applying\n- Target Chase Ink Business Unlimited and Capital One Spark Cash Plus\n\n**Risk Assessment:** Low risk. Client is Ready to proceed with Phase 2 applications.',
    NOW() - INTERVAL '30 days'
  ),
  (
    'eeeeeeee-0000-0000-0000-000000000102',
    'cccccccc-0000-0000-0000-000000000003',
    'monthly_monitoring_report',
    'Monthly Monitoring Report — March 2026',
    E'**Monitoring Period:** February 2026 – March 2026\n\n**Personal Credit Summary:**\n- Experian FICO: 778 (↑ 4 points from last month)\n- TransUnion: 772\n- Equifax: 769\n- No new negative marks detected\n\n**Business Credit Summary:**\n- D&B Paydex Score: 80 (Satisfactory)\n- Experian Business: 76/100\n- 12 active trade lines reporting\n\n**Funding Opportunities Identified:**\n- SBA 7(a) loan up to $350,000 — client qualifies based on revenue and time in business\n- Business line of credit $50,000–$150,000 from regional bank partners\n\n**Recommendation:** Client is capital-ready. Schedule consultation to discuss SBA application timeline.',
    NOW() - INTERVAL '7 days'
  )
ON CONFLICT (report_id) DO NOTHING;

-- ─── Notifications ────────────────────────────────────────────────────────────

INSERT INTO notifications (id, user_id, type, title, message, read, created_at) VALUES
  (
    'ffffffff-0000-0000-0000-000000000201',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'system',
    '🎉 Welcome to SourcifyLending!',
    'Your 0% Intro APR Card Strategy program is now active. Visit your dashboard to see your first task.',
    true,
    NOW() - INTERVAL '45 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000202',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'task_due',
    'Task Ready: Freeze Unused Bureau Reports',
    'Your next task is ready. Freezing unused bureaus before applying will protect your credit score.',
    false,
    NOW() - INTERVAL '2 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000203',
    'bbbbbbbb-0000-0000-0000-000000000002',
    'system',
    '🎉 Welcome to SourcifyLending!',
    'Your Business Credit Builder program is now active. Visit your dashboard to see your first task.',
    true,
    NOW() - INTERVAL '30 days'
  ),
  (
    'ffffffff-0000-0000-0000-000000000204',
    'bbbbbbbb-0000-0000-0000-000000000002',
    'reminder',
    'Vendor Account Tip',
    'When opening your Uline account, make a small purchase right away to start building your payment history.',
    false,
    NOW() - INTERVAL '1 day'
  ),
  (
    'ffffffff-0000-0000-0000-000000000205',
    'cccccccc-0000-0000-0000-000000000003',
    'report_ready',
    '📊 Monthly Monitoring Report Ready',
    'Your March 2026 capital monitoring report has been generated. Your score increased 4 points!',
    false,
    NOW() - INTERVAL '7 days'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Analyzer Results ─────────────────────────────────────────────────────────

INSERT INTO analyzer_results (
  id, user_id,
  business_name, business_age, entity_type, industry,
  monthly_revenue_range, monthly_deposit_range, nsf_last_90_days,
  credit_score_range, utilization_range, inquiry_count_last_90_days,
  business_credit_reporting_status, primary_goal,
  readiness_status, assigned_program,
  risk_flags, summary, recommendation,
  created_at
) VALUES
  (
    'a1a1a1a1-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Mitchell Digital LLC', '3 years', 'LLC', 'Marketing & Advertising',
    '$10,001 – $25,000', '$5,001 – $10,000', false,
    '720–759', 'Under 30%', '0–2 inquiries',
    'Yes — reporting on Dun & Bradstreet and Experian',
    'business_cards',
    'Ready', 'program_a',
    '[]',
    'Your credit profile is strong and your business is well-positioned to pursue 0% introductory APR business credit cards.',
    'We recommend starting with Phase 1 of the 0% Intro APR Card Strategy immediately. Your score, utilization, and inquiry count are all within optimal ranges.',
    NOW() - INTERVAL '46 days'
  ),
  (
    'b2b2b2b2-0000-0000-0000-000000000002',
    'bbbbbbbb-0000-0000-0000-000000000002',
    'Rivera Consulting Group', '1 year', 'LLC', 'Consulting',
    '$5,001 – $10,000', '$2,001 – $5,000', false,
    '650–679', '31–49%', '3–5 inquiries',
    'Partially — only on Dun & Bradstreet',
    'build_ein_credit',
    'Conditionally Ready', 'program_b',
    '["Credit score below 680", "Utilization above 30%", "Incomplete business bureau profile"]',
    'Your business has a solid foundation, but your personal credit score and utilization need improvement before pursuing cash credit.',
    'We recommend the Business Credit Builder program to establish a strong EIN-based credit profile over the next 90–180 days.',
    NOW() - INTERVAL '31 days'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Dual-Program Demo Account (Alex Rivera) ──────────────────────────────────
-- Login: demo@sourcifylending.com / DemoSL2026!
-- Starts as Program A. "Switch Program" button swaps to Program B and back.
--
-- We INSERT only base columns (guaranteed to exist from 001_initial.sql),
-- then UPDATE migration-added columns in a safe DO block so this seed
-- runs cleanly regardless of which migrations have been applied.

INSERT INTO profiles (
  id, full_name, email, business_name, business_age, entity_type, industry,
  monthly_revenue_range, monthly_deposit_range, nsf_flag,
  credit_score_range, utilization_range, inquiry_range,
  business_credit_reporting_status,
  assigned_program, readiness_status, current_stage,
  progress_percentage, subscription_status,
  created_at, updated_at
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000005',
  'Alex Rivera', 'demo@sourcifylending.com',
  'Rivera Group LLC', '2 years', 'LLC', 'Construction',
  '$10,001 – $25,000', '$5,001 – $10,000', false,
  '720–759', 'Under 30%', '0–2 inquiries',
  'Yes — reporting on Dun & Bradstreet and Experian',
  'program_a', 'Ready', 'Application Strategy',
  40, 'active',
  NOW() - INTERVAL '20 days', NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Safely set migration-added columns (each wrapped so missing columns don't abort the seed)
DO $$ BEGIN
  UPDATE profiles SET is_demo = true
  WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE profiles SET account_state = 'active_member'
  WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE profiles SET demo_secondary_program = 'program_b'
  WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE profiles SET underwriting_next_due_at = NOW() + INTERVAL '25 days'
  WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE profiles SET underwriting_review_count = 1
  WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
EXCEPTION WHEN undefined_column THEN NULL; END $$;

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

-- Tasks — Program A (Application Strategy in progress)
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

-- Tasks — Program B (Store Credit in progress)
INSERT INTO tasks (task_id, user_id, program, stage, title, description, status, requires_document, sort_order, created_at) VALUES
  ('seed-demo-b-01', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Foundation', 'Register Business with Dun & Bradstreet (DUNS)', 'Obtain a free D-U-N-S number from Dun & Bradstreet to establish your business credit file.', 'completed', false, 1, NOW() - INTERVAL '20 days'),
  ('seed-demo-b-02', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Foundation', 'Register on Experian Business and Equifax Business', 'Create business profiles on all major business credit bureaus.', 'completed', false, 2, NOW() - INTERVAL '20 days'),
  ('seed-demo-b-03', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Foundation', 'Set Up Dedicated Business Phone & Address', 'Establish a 411-listed business phone number and a real business address (no PO boxes).', 'completed', false, 3, NOW() - INTERVAL '18 days'),
  ('seed-demo-b-04', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Foundation', 'Open Dedicated Business Checking Account', 'Open a business-only bank account and keep it separate from personal finances.', 'completed', true, 4, NOW() - INTERVAL '17 days'),
  ('seed-demo-b-05', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Open Uline Net-30 Account', 'Apply for a Net-30 account with Uline — one of the primary Tier-1 vendors reporting to D&B, Experian Business, and Equifax Business.', 'completed', false, 5, NOW() - INTERVAL '14 days'),
  ('seed-demo-b-06', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Open Quill Net-30 Account', 'Apply for a Net-30 account with Quill to add a D&B and Experian Business tradeline.', 'completed', false, 6, NOW() - INTERVAL '12 days'),
  ('seed-demo-b-07', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Open Grainger Net-30 Account', 'Apply for a Grainger commercial account and make an initial purchase to establish a D&B PAYDEX tradeline.', 'pending', false, 7, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-08', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Open Crown Office Supplies Net-30 Account', 'Apply for Crown Office Supplies net-30 for tri-bureau reporting (D&B, Experian Business, Equifax Business).', 'locked', false, 8, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-09', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Store Credit', 'Verify All Vendor Accounts Are Reporting', 'Confirm each vendor account is appearing on your D&B, Experian Business, and Equifax Business reports.', 'locked', false, 9, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-10', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Fleet & Gas', 'Apply for AtoB Fleet Card', 'Apply for AtoB fuel card — accepted anywhere Visa is accepted, tri-bureau reporting, no PG required.', 'locked', false, 10, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-11', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Fleet & Gas', 'Apply for Coast Fleet Card', 'Apply for Coast fleet card — Visa-accepted, no PG, dual-bureau Experian Business + Equifax Business.', 'locked', false, 11, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-12', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Fleet & Gas', 'Verify Fleet Cards Reporting to Bureaus', 'Confirm fleet cards are appearing on your business credit reports.', 'locked', false, 12, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-13', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Cash & Revolving', 'Check Business Credit Score (Paydex 80+)', 'Verify your D&B Paydex score has reached 80 or higher before applying for cash revolving credit.', 'locked', false, 13, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-14', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Cash & Revolving', 'Apply for BILL Spend & Expense Corporate Card', 'Apply for BILL corporate card — no PG, tri-bureau business reporting, no annual fee.', 'locked', false, 14, NOW() - INTERVAL '10 days'),
  ('seed-demo-b-15', 'eeeeeeee-0000-0000-0000-000000000005', 'program_b', 'Cash & Revolving', 'Apply for Capital on Tap Business Credit Card', 'Apply for Capital on Tap — high limits, no annual fee options, reports to D&B and Experian Business.', 'locked', false, 15, NOW() - INTERVAL '10 days')
ON CONFLICT (task_id) DO NOTHING;

-- Reports
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

-- Notifications
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

-- Analyzer Result
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
