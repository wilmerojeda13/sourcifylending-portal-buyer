-- ─── agreements ───────────────────────────────────────────────────────────────
-- Stores accepted program service agreements with audit trail.
-- Required before Stripe checkout is initiated.

CREATE TABLE IF NOT EXISTS agreements (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program           TEXT        NOT NULL CHECK (program IN ('program_a', 'program_b', 'program_c')),
  agreement_version TEXT        NOT NULL DEFAULT 'v1.0',
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agreements_user_id ON agreements(user_id);

ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agreements_select_own" ON agreements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "agreements_insert_own" ON agreements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS for admin reads


-- ─── activity_logs ────────────────────────────────────────────────────────────
-- Fire-and-forget audit/event log used throughout the portal.
-- No FK constraint on user_id so logs survive user deletion.

CREATE TABLE IF NOT EXISTS activity_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  event_type  TEXT        NOT NULL,
  event_data  JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs (via service role — bypasses RLS automatically)
-- Regular users have no direct access to activity_logs
