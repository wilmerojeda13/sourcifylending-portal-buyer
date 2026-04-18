-- ============================================================
-- SOURCIFYLENDING — VOICE AGENT MODULE
-- Migration: 20260323_voice_agent.sql
-- ============================================================

-- ─── voice_campaigns ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_campaigns (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL,
  status                    text NOT NULL DEFAULT 'draft',   -- draft | active | paused | completed | archived
  description               text,
  lead_source_filter        text DEFAULT 'all',             -- all | purchased | facebook | inbound | other
  script_template           text,                            -- freeform notes / override
  max_attempts_tier1        int  NOT NULL DEFAULT 3,
  max_attempts_tier2        int  NOT NULL DEFAULT 3,
  max_attempts_tier3        int  NOT NULL DEFAULT 2,
  max_call_duration_seconds int  NOT NULL DEFAULT 90,
  quiet_hours_start         text NOT NULL DEFAULT '21:00',
  quiet_hours_end           text NOT NULL DEFAULT '09:00',
  timezone                  text NOT NULL DEFAULT 'America/New_York',
  b2b_mode                  boolean NOT NULL DEFAULT true,
  caller_id                 text,
  transfer_number           text,
  analyzer_url              text,
  -- counters (updated by triggers / API)
  total_leads               int NOT NULL DEFAULT 0,
  total_calls               int NOT NULL DEFAULT 0,
  total_connects            int NOT NULL DEFAULT 0,
  total_qualified           int NOT NULL DEFAULT 0,
  created_by                uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voice_campaigns_status_check CHECK (status IN ('draft','active','paused','completed','archived'))
);

-- ─── voice_leads ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          uuid REFERENCES voice_campaigns(id) ON DELETE SET NULL,
  first_name           text,
  last_name            text,
  business_name        text,
  owner_name           text,
  email                text,
  phone_raw            text,
  phone_e164           text,
  phone_validated      boolean NOT NULL DEFAULT false,
  line_type            text NOT NULL DEFAULT 'unknown',      -- mobile | landline | voip | unknown
  validation_status    text NOT NULL DEFAULT 'pending',      -- pending | valid | invalid | skipped
  lead_source          text NOT NULL DEFAULT 'other',        -- purchased | facebook | inbound | other
  lead_age_days        int,
  geography            text,
  duplicate_group_id   text,
  is_duplicate         boolean NOT NULL DEFAULT false,
  lead_quality_score   int NOT NULL DEFAULT 50,
  lead_priority_tier   int NOT NULL DEFAULT 2,               -- 1 | 2 | 3
  last_disposition     text,
  call_attempt_count   int NOT NULL DEFAULT 0,
  last_called_at       timestamptz,
  analyzer_link_sent   boolean NOT NULL DEFAULT false,
  callback_requested   boolean NOT NULL DEFAULT false,
  transferred_live     boolean NOT NULL DEFAULT false,
  do_not_call          boolean NOT NULL DEFAULT false,
  opted_out_at         timestamptz,
  notes                text,
  metadata             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voice_leads_tier_check CHECK (lead_priority_tier IN (1,2,3)),
  CONSTRAINT voice_leads_score_check CHECK (lead_quality_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS voice_leads_campaign_idx   ON voice_leads(campaign_id);
CREATE INDEX IF NOT EXISTS voice_leads_phone_idx      ON voice_leads(phone_e164);
CREATE INDEX IF NOT EXISTS voice_leads_score_idx      ON voice_leads(lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS voice_leads_tier_idx       ON voice_leads(lead_priority_tier, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS voice_leads_dnc_idx        ON voice_leads(do_not_call);

-- ─── voice_calls ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid REFERENCES voice_campaigns(id) ON DELETE SET NULL,
  lead_id             uuid REFERENCES voice_leads(id) ON DELETE SET NULL,
  twilio_call_sid     text UNIQUE,
  status              text NOT NULL DEFAULT 'initiated',
  direction           text NOT NULL DEFAULT 'outbound-api',
  from_number         text,
  to_number           text,
  duration_seconds    int,
  disposition         text,
  recording_url       text,
  transcription       text,
  summary             text,
  sentiment_score     numeric,
  started_at          timestamptz,
  ended_at            timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_calls_campaign_idx    ON voice_calls(campaign_id);
CREATE INDEX IF NOT EXISTS voice_calls_lead_idx        ON voice_calls(lead_id);
CREATE INDEX IF NOT EXISTS voice_calls_sid_idx         ON voice_calls(twilio_call_sid);
CREATE INDEX IF NOT EXISTS voice_calls_status_idx      ON voice_calls(status);
CREATE INDEX IF NOT EXISTS voice_calls_created_idx     ON voice_calls(created_at DESC);

-- ─── voice_call_events ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_call_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     uuid NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  event_data  jsonb,
  timestamp   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_call_events_call_idx ON voice_call_events(call_id);

-- ─── voice_dispositions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_dispositions (
  id             text PRIMARY KEY,
  label          text NOT NULL,
  category       text NOT NULL DEFAULT 'neutral',  -- positive | negative | neutral
  score_delta    int  NOT NULL DEFAULT 0,
  auto_suppress  boolean NOT NULL DEFAULT false,
  auto_stop      boolean NOT NULL DEFAULT false
);

INSERT INTO voice_dispositions (id, label, category, score_delta, auto_suppress, auto_stop) VALUES
  ('decision_maker',    'Decision Maker',    'positive',  30, false, false),
  ('gatekeeper',        'Gatekeeper',        'neutral',   -5, false, false),
  ('voicemail',         'Voicemail',         'neutral',  -10, false, false),
  ('no_answer',         'No Answer',         'neutral',   -5, false, false),
  ('bad_number',        'Bad Number',        'negative', -30, true,  true),
  ('wrong_number',      'Wrong Number',      'negative', -25, true,  true),
  ('business_closed',   'Business Closed',   'negative', -20, false, true),
  ('personal_line',     'Personal Line',     'negative', -15, false, false),
  ('not_interested',    'Not Interested',    'negative', -10, false, false),
  ('do_not_call',       'Do Not Call',       'negative', -50, true,  true),
  ('send_link',         'Send Link',         'positive',  25, false, false),
  ('callback_requested','Callback Requested','positive',  20, false, false),
  ('interested',        'Interested',        'positive',  15, false, false),
  ('transferred_live',  'Transferred Live',  'positive',  35, false, false)
ON CONFLICT (id) DO NOTHING;

-- ─── voice_suppression_list ───────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_suppression_list (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164  text NOT NULL UNIQUE,
  reason      text NOT NULL DEFAULT 'manual',  -- opted_out | wrong_number | bad_number | manual
  source      text,                             -- call_id or 'manual'
  added_at    timestamptz NOT NULL DEFAULT now(),
  added_by    uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS voice_suppression_phone_idx ON voice_suppression_list(phone_e164);

-- ─── voice_followups ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_followups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES voice_leads(id) ON DELETE CASCADE,
  call_id       uuid REFERENCES voice_calls(id) ON DELETE SET NULL,
  type          text NOT NULL,           -- sms | email
  status        text NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  recipient     text,
  message       text,
  sent_at       timestamptz,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_followups_lead_idx ON voice_followups(lead_id);

-- ─── voice_agent_settings ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_agent_settings (
  id                    text PRIMARY KEY DEFAULT 'default',
  twilio_account_sid    text,
  twilio_caller_id      text,
  transfer_number       text,
  voice_server_ws_url   text DEFAULT 'ws://localhost:3002',
  analyzer_url          text DEFAULT 'https://www.sourcifylending.com/analyzer',
  sms_template          text DEFAULT 'Hi {{name}}, this is SourcifyLending. Here is the free business credit analyzer: {{link}}',
  email_template        text,
  email_subject         text DEFAULT 'Free Business Credit Analyzer — SourcifyLending',
  scoring_weights       jsonb DEFAULT '{
    "inbound_facebook": 20,
    "full_name_present": 15,
    "valid_phone": 10,
    "email_present": 10,
    "target_geography": 10,
    "is_duplicate": -20,
    "invalid_number": -25,
    "prior_opt_out": -30,
    "personal_line": -15,
    "incomplete_purchased": -15
  }',
  retry_rules           jsonb DEFAULT '{
    "tier1_max": 3,
    "tier2_max": 3,
    "tier3_max": 2,
    "voicemail_max": 2,
    "min_retry_hours": 4
  }',
  quiet_hours_start     text NOT NULL DEFAULT '21:00',
  quiet_hours_end       text NOT NULL DEFAULT '09:00',
  timezone              text NOT NULL DEFAULT 'America/New_York',
  recording_disclosure  boolean NOT NULL DEFAULT false,
  max_concurrent_calls  int NOT NULL DEFAULT 1,
  b2b_mode_only         boolean NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES profiles(id) ON DELETE SET NULL
);

-- Insert default settings row
INSERT INTO voice_agent_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ─── voice_prompt_versions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_prompt_versions (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                           text NOT NULL,
  version                        int NOT NULL DEFAULT 1,
  is_active                      boolean NOT NULL DEFAULT false,
  system_prompt                  text NOT NULL,
  opening_purchased              text,
  opening_facebook               text,
  opening_inbound                text,
  opening_other                  text,
  objection_not_interested       text,
  objection_busy                 text,
  objection_send_info            text,
  objection_already_funded       text,
  objection_working_with_someone text,
  objection_what_is_this         text,
  objection_is_this_loan         text,
  objection_remove_me            text,
  created_by                     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                     timestamptz NOT NULL DEFAULT now()
);

-- ─── voice_lead_scores ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_lead_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES voice_leads(id) ON DELETE CASCADE,
  score_before int NOT NULL,
  score_after  int NOT NULL,
  delta        int NOT NULL,
  reason       text,
  scored_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_lead_scores_lead_idx ON voice_lead_scores(lead_id);

-- ─── RLS policies (admin-only) ────────────────────────────────
ALTER TABLE voice_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_calls            ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_call_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_dispositions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_followups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_agent_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_prompt_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_lead_scores      ENABLE ROW LEVEL SECURITY;

-- All voice tables: admin only (service role bypasses RLS)
CREATE POLICY "admin_all_voice_campaigns"        ON voice_campaigns        FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_all_voice_leads"            ON voice_leads            FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_all_voice_calls"            ON voice_calls            FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_all_voice_call_events"      ON voice_call_events      FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_read_voice_dispositions"    ON voice_dispositions     FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_all_voice_suppression"      ON voice_suppression_list FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_all_voice_followups"        ON voice_followups        FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_all_voice_settings"         ON voice_agent_settings   FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_all_voice_prompts"          ON voice_prompt_versions  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "admin_all_voice_lead_scores"      ON voice_lead_scores      FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ─── Insert default prompt template ───────────────────────────
INSERT INTO voice_prompt_versions (
  name, version, is_active,
  system_prompt,
  opening_purchased, opening_facebook, opening_inbound, opening_other,
  objection_not_interested, objection_busy, objection_send_info,
  objection_already_funded, objection_working_with_someone,
  objection_what_is_this, objection_is_this_loan, objection_remove_me
) VALUES (
  'Default Script v1', 1, true,
  'You are Sarah, a professional business credit advisor at SourcifyLending. You speak in a calm, confident, professional female voice. You are not a lender — you help business owners understand their business credit profile and funding readiness through an advisory portal. Keep your sentences short and clear. Never promise funding or credit approvals. Never use hype language. Ask only one question at a time. Your goal is to qualify the decision maker and send them the free business credit analyzer link. When the conversation ends, output a JSON summary on a new line in this exact format: [DISPOSITION:disposition_code] [SUMMARY:brief summary]. Valid disposition codes: decision_maker, gatekeeper, voicemail, no_answer, bad_number, wrong_number, business_closed, personal_line, not_interested, do_not_call, send_link, callback_requested, interested, transferred_live.',
  'Hi, this is Sarah from SourcifyLending. I was reaching out to see who handles business credit or business funding strategy for your company.',
  'Hi, this is Sarah from SourcifyLending. We noticed you had expressed interest in business funding resources. I wanted to follow up briefly.',
  'Hi, this is Sarah from SourcifyLending. You had recently reached out to us, and I wanted to personally follow up.',
  'Hi, this is Sarah from SourcifyLending. I was reaching out to see who handles business credit or business funding strategy for your company.',
  'Totally understand. I''ll let you go. If things change, feel free to visit SourcifyLending dot com. Have a great day.',
  'No problem at all. I can be very brief — we simply help business owners see where they stand with business credit. Can I send you a free link to check?',
  'Absolutely. I can send you a short link to our free business credit analyzer. What''s the best number or email for that?',
  'That''s great to hear. We actually focus on business credit strategy and ongoing monitoring, which is a bit different. Would a free analysis still be helpful?',
  'Got it, no problem. I just wanted to make sure you have access to our free tool as well. Feel free to visit SourcifyLending dot com anytime.',
  'Great question. We''re an advisory platform — we help business owners build and monitor their business credit profile. We''re not a lender.',
  'No, we''re not a lender at all. We''re a business credit advisory platform. We help owners understand their credit profile and funding readiness.',
  'Absolutely, I''ll remove you right away. Sorry for the interruption. Have a great day.'
) ON CONFLICT DO NOTHING;
