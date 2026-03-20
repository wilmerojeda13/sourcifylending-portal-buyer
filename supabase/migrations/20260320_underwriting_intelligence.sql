-- ─── Underwriting Intelligence System Migration ──────────────────────────────
-- Run this in Supabase SQL Editor before deploying the underwriting system.
-- All columns use DEFAULT NULL/FALSE so existing rows are unaffected.

ALTER TABLE profiles
  -- Core gate column — NULL = not done, TIMESTAMPTZ = completed
  ADD COLUMN IF NOT EXISTS underwriting_completed_at   TIMESTAMPTZ    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS underwriting_program         TEXT           DEFAULT NULL,

  -- Shared form fields (collected at underwriting time)
  ADD COLUMN IF NOT EXISTS uw_time_in_business_conf     TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_annual_revenue_conf        TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_average_daily_balance      TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_bank_statement_months      TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_outstanding_balances       TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_recent_derogatory          BOOLEAN        DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS uw_public_records             BOOLEAN        DEFAULT FALSE,

  -- Program A specific fields
  ADD COLUMN IF NOT EXISTS uw_total_credit_limit         TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_monthly_income             TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_negative_accounts          BOOLEAN        DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS uw_card_application_strategy  TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_existing_card_balances     TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_authorized_user_status     BOOLEAN        DEFAULT FALSE,

  -- Program B specific fields
  ADD COLUMN IF NOT EXISTS uw_ein                        TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_business_state             TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_business_address           TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_duns_status                TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_experian_biz_exists        BOOLEAN        DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS uw_tradelines_count           INTEGER        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uw_ein_open_date              TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_vendor_tier_readiness      TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_existing_biz_debts         TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_bank_statements_uploaded   BOOLEAN        DEFAULT FALSE,

  -- AI + scoring outputs
  ADD COLUMN IF NOT EXISTS uw_approval_likelihood        TEXT           DEFAULT NULL,  -- 'high' | 'medium' | 'low' | 'disqualified'
  ADD COLUMN IF NOT EXISTS uw_risk_level                 TEXT           DEFAULT NULL,  -- 'LOW' | 'MEDIUM' | 'HIGH'
  ADD COLUMN IF NOT EXISTS uw_risk_score                 INTEGER        DEFAULT NULL,  -- 0-100
  ADD COLUMN IF NOT EXISTS uw_ai_summary                 TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_ai_recommendations         TEXT[]         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uw_key_issues                 TEXT[]         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uw_next_accounts              TEXT[]         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uw_estimated_funding_range    TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_recommended_issuers        TEXT[]         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uw_disqualification_reason    TEXT           DEFAULT NULL;

-- Fast index for gate check (most common query: "does this active member need underwriting?")
CREATE INDEX IF NOT EXISTS idx_profiles_uw_gate
  ON profiles (id, account_state, assigned_program, underwriting_completed_at)
  WHERE account_state = 'active_member';

-- Comment for documentation
COMMENT ON COLUMN profiles.underwriting_completed_at IS
  'NULL = underwriting not completed; TIMESTAMPTZ = completed. Gate check: active_member + program_a/b + NULL = show lock.';
COMMENT ON COLUMN profiles.uw_approval_likelihood IS
  'Underwriting output: high | medium | low | disqualified';
COMMENT ON COLUMN profiles.uw_risk_score IS
  'Deterministic risk score 0-100. Higher = more risk. Computed by underwriting-scorer.ts.';
