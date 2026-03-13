-- Leads table for free analyzer submissions
-- Captures contact info before showing analyzer results

CREATE TABLE IF NOT EXISTS leads (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  business_name   TEXT,
  source          TEXT NOT NULL DEFAULT 'free_analyzer',
  -- Analyzer result snapshot
  assigned_program       TEXT,
  readiness_status       TEXT,
  risk_flags             TEXT[], -- array of risk flag strings
  analyzer_answers       JSONB,  -- full answers payload
  -- CRM integration
  notion_page_id  TEXT,   -- Notion contact page ID after sync
  synced_to_notion BOOLEAN DEFAULT FALSE,
  -- Dedup
  CONSTRAINT leads_email_source_unique UNIQUE (email, source)
);

-- Index for quick lookup by email/phone
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (email);
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads (phone);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);

-- RLS — only service role can access leads (no client-side access)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- No client-side policies — all lead writes go through the server-side API
-- Service role bypasses RLS by default
