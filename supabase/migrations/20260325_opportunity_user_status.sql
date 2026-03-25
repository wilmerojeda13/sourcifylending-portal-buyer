-- opportunity_user_status: per-user tracking of which opportunities have been applied for / approved / denied
-- This powers the "already used" filtering on the Funding Opportunities page

CREATE TABLE IF NOT EXISTS opportunity_user_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES account_opportunities(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('applied', 'approved', 'denied', 'pending')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, opportunity_id)
);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_opportunity_user_status_user
  ON opportunity_user_status(user_id);

-- Row-level security: users can only see/manage their own rows
ALTER TABLE opportunity_user_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own opportunity status"
  ON opportunity_user_status
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at auto-trigger (reuses existing function from initial migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_opportunity_user_status_updated_at'
  ) THEN
    CREATE TRIGGER set_opportunity_user_status_updated_at
      BEFORE UPDATE ON opportunity_user_status
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
