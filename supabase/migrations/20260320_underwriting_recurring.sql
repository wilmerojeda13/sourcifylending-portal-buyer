-- ─── Underwriting Recurring Review System ────────────────────────────────────
-- Adds monthly underwriting cycle + full review history table.
-- Run AFTER 20260320_underwriting_intelligence.sql

-- ── 1. New columns on profiles ────────────────────────────────────────────────
ALTER TABLE profiles
  -- When the NEXT review is due. NULL = never done. Past = overdue.
  ADD COLUMN IF NOT EXISTS underwriting_next_due_at    TIMESTAMPTZ    DEFAULT NULL,
  -- Total number of completed underwriting reviews (for display + history)
  ADD COLUMN IF NOT EXISTS underwriting_review_count   INTEGER        DEFAULT 0,
  -- Snapshot of the previous review for delta/progress comparison
  ADD COLUMN IF NOT EXISTS uw_prev_approval_likelihood TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_prev_risk_score          INTEGER        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uw_prev_stage               TEXT           DEFAULT NULL;

-- ── 2. underwriting_reviews — full history table ──────────────────────────────
CREATE TABLE IF NOT EXISTS underwriting_reviews (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program                 TEXT          NOT NULL,
  review_number           INTEGER       NOT NULL DEFAULT 1,   -- 1st, 2nd, 3rd review…
  completed_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Scoring outputs
  approval_likelihood     TEXT          NOT NULL,             -- 'high'|'medium'|'low'|'disqualified'
  risk_level              TEXT          NOT NULL,             -- 'LOW'|'MEDIUM'|'HIGH'
  risk_score              INTEGER       NOT NULL,             -- 0–100
  -- Stage (Program B)
  determined_stage        TEXT          DEFAULT NULL,
  -- AI outputs
  ai_summary              TEXT          DEFAULT NULL,
  ai_recommendations      TEXT[]        DEFAULT '{}',
  key_issues              TEXT[]        DEFAULT '{}',
  next_accounts           TEXT[]        DEFAULT '{}',
  -- Program A outputs
  estimated_funding_range TEXT          DEFAULT NULL,
  recommended_issuers     TEXT[]        DEFAULT '{}',
  -- Delta vs previous review (computed at save time)
  risk_score_delta        INTEGER       DEFAULT NULL,         -- positive = improved (score went down)
  stage_advanced          BOOLEAN       DEFAULT FALSE,
  -- Raw form answers (JSONB for full auditability)
  raw_answers             JSONB         DEFAULT '{}',
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_uw_reviews_user_id
  ON underwriting_reviews (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_uw_due
  ON profiles (id, account_state, assigned_program, underwriting_next_due_at)
  WHERE account_state = 'active_member';

-- Comments
COMMENT ON TABLE underwriting_reviews IS
  'Full history of every underwriting review per client. Used for trend analysis, admin visibility, and AI context.';
COMMENT ON COLUMN profiles.underwriting_next_due_at IS
  'NULL = never reviewed. Past timestamp = review overdue. Gate: check this < NOW().';
COMMENT ON COLUMN underwriting_reviews.risk_score_delta IS
  'Previous risk_score minus current risk_score. Positive = improvement (risk went down). NULL on first review.';
