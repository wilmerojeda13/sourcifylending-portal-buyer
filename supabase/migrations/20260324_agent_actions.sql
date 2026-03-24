-- ─── Agent Actions Log ────────────────────────────────────────────────────────
-- Stores every action taken by any AI agent across the platform.
-- Used for client activity feed and admin intelligence dashboard.

CREATE TABLE IF NOT EXISTS agent_actions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  agent_name      TEXT        NOT NULL, -- 'onboarding' | 'document' | 'roadmap' | 'opportunity' | 'billing' | 'support' | 'health'
  action_type     TEXT        NOT NULL, -- 'profile_updated' | 'task_completed' | 'document_classified' | 'roadmap_refreshed' | 'flag_raised' | 'info'
  title           TEXT        NOT NULL, -- short human-readable: "Analyzed your EIN letter"
  description     TEXT,                 -- longer detail shown on expand
  status          TEXT        NOT NULL DEFAULT 'completed', -- 'completed' | 'pending_approval' | 'failed' | 'skipped'
  auto_fixed      BOOLEAN     NOT NULL DEFAULT false,
  needs_review    BOOLEAN     NOT NULL DEFAULT false,
  visible_to_user BOOLEAN     NOT NULL DEFAULT true,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS agent_actions_user_id_idx    ON agent_actions(user_id);
CREATE INDEX IF NOT EXISTS agent_actions_created_at_idx ON agent_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_actions_agent_name_idx ON agent_actions(agent_name);
CREATE INDEX IF NOT EXISTS agent_actions_needs_review_idx ON agent_actions(needs_review) WHERE needs_review = true;

-- RLS
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own visible actions
CREATE POLICY "Users read own agent actions"
  ON agent_actions FOR SELECT
  USING (auth.uid() = user_id AND visible_to_user = true);

-- Service role has full access (used by all agents)
CREATE POLICY "Service role full access"
  ON agent_actions FOR ALL
  USING (true)
  WITH CHECK (true);
