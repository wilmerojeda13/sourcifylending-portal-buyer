-- Add prospect / free-analyzer columns to profiles
-- These support the free analyzer → prospect account creation flow

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_state       TEXT NOT NULL DEFAULT 'active_member'
                                                 CHECK (account_state IN ('prospect', 'active_member')),
  ADD COLUMN IF NOT EXISTS lead_id             UUID,
  ADD COLUMN IF NOT EXISTS latest_analyzer_result JSONB,
  ADD COLUMN IF NOT EXISTS analyzed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notion_page_id      TEXT;

-- Add conversion tracking to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_converted
  ON leads(converted_to_user_id)
  WHERE converted_to_user_id IS NOT NULL;

-- Back-fill: existing users without account_state get 'active_member'
-- (Already handled by DEFAULT above)
