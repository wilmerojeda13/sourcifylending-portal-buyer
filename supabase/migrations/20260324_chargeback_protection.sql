-- ─── Chargeback Protection: Welcome Gate + Access Grant + Stage Acknowledgments
-- Run this in Supabase SQL Editor

-- 1. Add welcome gate tracking to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_agreement_signed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_agreement_name TEXT;

-- 2. Add admin grant-access audit trail to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_granted_by UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_granted_by_name TEXT;

-- 3. Add gate_type to existing agreements table (distinguish welcome gate vs service agreement)
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS gate_type TEXT NOT NULL DEFAULT 'service';

-- 4. Create stage acknowledgments table
CREATE TABLE IF NOT EXISTS stage_acknowledgments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stage           TEXT        NOT NULL,
  program         TEXT        NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stage_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stage acknowledgments"
  ON stage_acknowledgments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert stage acknowledgments"
  ON stage_acknowledgments FOR INSERT
  WITH CHECK (true);

-- 5. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stage_acks_user_id ON stage_acknowledgments(user_id);
CREATE INDEX IF NOT EXISTS idx_stage_acks_stage   ON stage_acknowledgments(user_id, stage);
