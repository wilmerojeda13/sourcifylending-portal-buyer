-- ─── Account Opportunities Table ──────────────────────────────────────────────
-- Controlled database of funding/credit opportunities shown to portal members.
-- AI agent and portal pages ONLY reference this table — never invent lenders.

CREATE TABLE IF NOT EXISTS account_opportunities (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT        NOT NULL,
  program       TEXT        NOT NULL,     -- 'program_a' | 'program_b' | 'program_c' | 'all'
  stage         TEXT        NOT NULL,     -- stage name when this becomes available (matches current_stage in profiles)
  category      TEXT        NOT NULL,     -- 'funding' | 'vendor' | 'store' | 'fleet' | 'cash' | 'monitoring'
  reports_to    TEXT,                     -- credit bureaus: e.g. 'Equifax, Experian' or 'D&B, Equifax'
  terms         TEXT,                     -- e.g. 'Net-30', '$0 Annual Fee', 'Revolving'
  pg_required   TEXT        NOT NULL DEFAULT 'yes', -- 'yes' | 'no' | 'varies'
  description   TEXT,
  learn_more_url TEXT,
  apply_url     TEXT,
  priority_score INTEGER    NOT NULL DEFAULT 50,  -- 0–100, higher = show first
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,                     -- admin-only internal notes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: members can only read active opportunities; admins can write
ALTER TABLE account_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read active opportunities"
  ON account_opportunities FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Service role bypasses RLS automatically (used in admin routes)

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_opportunities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER opportunities_updated_at
  BEFORE UPDATE ON account_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_opportunities_updated_at();


-- ─── Seed Data ─────────────────────────────────────────────────────────────────

-- ── Program A: Business Credit Cards (Personal Credit Optimization path) ──────
-- Stage: 'Card Acquisition' means user is ready to apply now
-- Stage: 'Application Strategy' means recommended once strategy is set
-- Priority: higher = show first

INSERT INTO account_opportunities
  (name, program, stage, category, reports_to, terms, pg_required, description, priority_score, notes)
VALUES

-- Starter cards — recommended when profile is clean and score 660+
('Capital One Spark Cash Select', 'program_a', 'Card Acquisition', 'funding',
 'Personal bureaus (Experian, Equifax, TransUnion)',
 'No annual fee · 1.5% cash back · 0% intro APR on purchases',
 'yes',
 'A popular starter business credit card. Reports to personal bureaus and helps establish a positive payment history. Typically accessible at 660+ personal credit score with low utilization.',
 90, 'Top starter recommendation for Program A clients in Card Acquisition stage'),

('American Express Blue Business Cash', 'program_a', 'Card Acquisition', 'funding',
 'Personal bureaus (Experian, Equifax)',
 'No annual fee · 2% cash back up to $50K/yr · 0% intro APR 12 months',
 'yes',
 'Strong cash-back business card from American Express. Does not report negatives to personal bureaus for authorized users. Best for clients with 680+ personal credit.',
 88, NULL),

('Chase Ink Business Cash', 'program_a', 'Card Acquisition', 'funding',
 'Personal bureaus (Experian)',
 'No annual fee · Up to 5% cash back · 0% intro APR 12 months',
 'yes',
 'Highly competitive business cash card. Chase typically requires established business history and 670+ personal credit. Reports to personal bureaus only on derogatory events.',
 85, NULL),

('Chase Ink Business Unlimited', 'program_a', 'Card Acquisition', 'funding',
 'Personal bureaus (Experian)',
 'No annual fee · 1.5% flat cash back · 0% intro APR 12 months',
 'yes',
 'Simplified flat-rate alternative to Ink Business Cash. Same Chase approval criteria. Ideal if you want one simple card before building a full stack.',
 82, NULL),

('Wells Fargo Business Secured Credit Card', 'program_a', 'Application Strategy', 'funding',
 'Personal bureaus (Experian, Equifax, TransUnion)',
 'Secured · $500–$25,000 deposit · Annual fee varies',
 'yes',
 'A secured business credit card ideal for rebuilding or establishing credit. Your deposit becomes your credit limit. Reports to all three personal bureaus monthly — a strong profile builder.',
 75, 'Good entry point for clients with sub-660 personal scores'),

('Bank of America Business Advantage Cash Rewards', 'program_a', 'Card Acquisition', 'funding',
 'Personal bureaus (Equifax, TransUnion)',
 'No annual fee · Up to 3% cash back · Preferred Rewards bonus available',
 'yes',
 'Solid mid-tier business card. Bank of America clients with existing relationships may have easier approval paths. Best at 680+ personal credit.',
 78, NULL),

('U.S. Bank Business Platinum Card', 'program_a', 'Card Acquisition', 'funding',
 'Personal bureaus (Equifax, TransUnion)',
 'No annual fee · 0% intro APR 18 billing cycles · Promotional rate for balance transfers',
 'yes',
 'One of the longest 0% intro APR windows available on a business card. Ideal for Program A clients who want to maximize interest-free runway while building payment history.',
 80, 'Best 0% APR window in the Program A card stack'),

('Brex Corporate Card', 'program_a', 'Optimization', 'funding',
 'D&B, Equifax Business',
 'No personal guarantee · No annual fee · Rewards vary by spend category',
 'no',
 'Corporate card that does NOT require a personal guarantee. Underwritten based on business profile, cash balance, and revenue. Reports to business bureaus — ideal once business credit is established.',
 70, 'No PG option — best for clients in Optimization stage with established business'),

('Ramp Corporate Card', 'program_a', 'Optimization', 'funding',
 'D&B, Equifax Business',
 'No personal guarantee · No annual fee · 1.5% flat cash back',
 'no',
 'Expense management platform and corporate card combined. No personal credit pull. Requires minimum business bank balance and revenue history. Reports to business credit bureaus.',
 68, NULL),

('Divvy (BILL) Corporate Card', 'program_a', 'Optimization', 'funding',
 'D&B',
 'No personal guarantee · No annual fee · Spend controls & budgeting built-in',
 'no',
 'Charge card with weekly payment cycle. Builds business credit through consistent reporting to D&B. Best for businesses with steady cash flow who can pay weekly.',
 65, NULL),

-- ── Program B: Vendor / Net-30 Accounts ───────────────────────────────────────
-- Stage: 'Foundation' = starter vendor accounts to establish trade lines

('Uline Net-30 Account', 'program_b', 'Foundation', 'vendor',
 'D&B, Experian Business',
 'Net-30 · No annual fee · Minimum order may apply',
 'no',
 'One of the most commonly used starter net-30 vendors for business credit building. Reports to D&B and Experian Business monthly. Place a small order each month to keep the account active.',
 95, 'Priority 1 vendor account — recommend to all Program B clients immediately'),

('Quill Business Account', 'program_b', 'Foundation', 'vendor',
 'D&B',
 'Net-30 · No minimum order · Office supplies',
 'no',
 'Office supplies vendor with a net-30 payment option for approved businesses. Reports to D&B. Easy to get approved with EIN, business address, and DUNS number on file.',
 90, NULL),

('Grainger Industrial Supply (Net-30)', 'program_b', 'Foundation', 'vendor',
 'D&B, Experian Business',
 'Net-30 · Industrial & safety supplies',
 'no',
 'Industrial supply vendor that extends net-30 terms to businesses with an established DUNS profile. Strong D&B reporter. Useful for businesses in construction, manufacturing, or facilities.',
 85, NULL),

('Amazon Business (Net-30)', 'program_b', 'Foundation', 'vendor',
 'D&B',
 'Net-30 option · Amazon Business account required',
 'no',
 'Amazon Business offers a net-30 payment option for qualified business accounts. Apply through the Amazon Business account portal. Reports business payment behavior to D&B.',
 88, NULL),

('Crown Office Supplies', 'program_b', 'Foundation', 'vendor',
 'D&B, Equifax Business, Experian Business',
 'Net-30 · Easy approval for new businesses · No minimum order',
 'no',
 'Starter-friendly net-30 vendor known for approving newer businesses. Reports to all three major business credit bureaus. Ideal as one of the first three vendor accounts in a Program B foundation.',
 92, 'Tier 1 starter vendor — reports to all 3 business bureaus'),

-- ── Program B: Store Credit Accounts ──────────────────────────────────────────
('Home Depot Commercial Revolving Charge', 'program_b', 'Store Credit', 'store',
 'D&B, Equifax Business',
 'Revolving · Net-30 option · Home improvement/supplies',
 'varies',
 'Home Depot offers a commercial account with revolving or net-30 terms for businesses. Reports to D&B and Equifax Business. May require personal guarantee for newer businesses.',
 78, NULL),

('Sam''s Club Business Credit', 'program_b', 'Store Credit', 'store',
 'Equifax Business, D&B',
 'Revolving · No annual fee for Business Plus members · Membership required',
 'varies',
 'Sam''s Club business credit card available to members. Reports to Equifax Business and D&B. Useful as a store account in the business credit stack after vendor accounts are established.',
 72, NULL),

-- ── Program B: Fleet Accounts ──────────────────────────────────────────────────
('WEX Fleet Card', 'program_b', 'Fleet & Gas', 'fleet',
 'D&B, Equifax Business',
 'Revolving · Fuel purchases · Accepted at major fuel networks',
 'varies',
 'WEX is a leading fleet card provider that reports business payment history to major business credit bureaus. Excellent for businesses with vehicles or field operations. Helps diversify the business credit profile.',
 80, NULL),

-- ── Program B: Cash / Revolving Accounts ──────────────────────────────────────
('Kabbage (American Express Business Line)', 'program_b', 'Cash & Revolving', 'cash',
 'Personal bureaus (varies) · Business bureaus (varies)',
 'Revolving line · Up to $250K · Monthly fee structure',
 'yes',
 'Business line of credit from American Express (acquired Kabbage). Requires personal guarantee. Approval is based on bank account data and revenue history. Provides revolving access to working capital.',
 75, NULL),

-- ── Program C: Monitoring ──────────────────────────────────────────────────────
('Nav Business Credit Monitoring', 'program_c', 'Monthly Review', 'monitoring',
 'D&B, Equifax Business, Experian Business',
 'Monthly subscription · Free tier available',
 'no',
 'Nav provides monitoring of your business credit profiles across D&B, Equifax Business, and Experian Business. Receive alerts on changes, dispute errors, and track score improvements over time. Included as part of your Program C monthly review process.',
 90, 'Primary monitoring tool for Program C clients'),

('Dun & Bradstreet CreditBuilder Plus', 'program_c', 'Monthly Review', 'monitoring',
 'D&B',
 'Annual or monthly subscription · Includes PAYDEX score tracking',
 'no',
 'Directly from D&B, CreditBuilder Plus allows you to submit payment references, monitor your PAYDEX score, and track who has been pulling your business credit report. Helps accelerate D&B profile establishment.',
 85, 'D&B direct product — accelerates PAYDEX score building');
