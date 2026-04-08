ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS readiness_score integer,
  ADD COLUMN IF NOT EXISTS estimated_funding_range text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS readiness_score integer,
  ADD COLUMN IF NOT EXISTS readiness_status text,
  ADD COLUMN IF NOT EXISTS assigned_program text,
  ADD COLUMN IF NOT EXISTS estimated_funding_range text,
  ADD COLUMN IF NOT EXISTS risk_flags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS analyzer_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analyzer_summary text,
  ADD COLUMN IF NOT EXISTS analyzer_score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analyzer_result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analyzer_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS analyzer_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_analyzer_session_id uuid,
  ADD COLUMN IF NOT EXISTS latest_analyzer_session_status text,
  ADD COLUMN IF NOT EXISTS latest_analyzer_session_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_review_reason text;

CREATE TABLE IF NOT EXISTS public.crm_analyzer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  rep_user_id uuid NULL,
  rep_name text NULL,
  source_context text NULL,
  crm_invite_id uuid NULL REFERENCES public.crm_lead_invites(id) ON DELETE SET NULL,
  crm_sms_id uuid NULL REFERENCES public.crm_lead_sms(id) ON DELETE SET NULL,
  session_status text NULL,
  tracked_url text NULL,
  link_sent_at timestamptz NULL,
  link_opened_at timestamptz NULL,
  analyzer_started_at timestamptz NULL,
  analyzer_submitted_at timestamptz NULL,
  readiness_score integer NULL,
  readiness_status text NULL,
  analyzer_summary text NULL,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  account_created boolean NOT NULL DEFAULT false,
  account_created_at timestamptz NULL,
  converted_at timestamptz NULL,
  latest_event_type text NULL,
  last_event_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_analyzer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.crm_analyzer_sessions(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  rep_user_id uuid NULL,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_leads_analyzer_submitted_idx
  ON public.crm_leads (analyzer_submitted, analyzer_submitted_at desc);

CREATE INDEX IF NOT EXISTS crm_leads_account_created_idx
  ON public.crm_leads (account_created, account_created_at desc);

CREATE INDEX IF NOT EXISTS crm_leads_duplicate_review_idx
  ON public.crm_leads (duplicate_review_required)
  WHERE duplicate_review_required = true;

CREATE INDEX IF NOT EXISTS crm_leads_latest_analyzer_session_idx
  ON public.crm_leads (latest_analyzer_session_at desc);

CREATE INDEX IF NOT EXISTS crm_analyzer_sessions_lead_idx
  ON public.crm_analyzer_sessions (lead_id, last_event_at desc);

CREATE INDEX IF NOT EXISTS crm_analyzer_sessions_rep_idx
  ON public.crm_analyzer_sessions (rep_user_id, last_event_at desc);

CREATE INDEX IF NOT EXISTS crm_analyzer_events_lead_idx
  ON public.crm_analyzer_events (lead_id, event_at desc);

CREATE INDEX IF NOT EXISTS crm_analyzer_events_session_idx
  ON public.crm_analyzer_events (session_id, event_at desc);

CREATE INDEX IF NOT EXISTS leads_submitted_at_idx
  ON public.leads (submitted_at desc);

ALTER TABLE public.crm_tasks
  DROP CONSTRAINT IF EXISTS crm_tasks_type_check;

ALTER TABLE public.crm_tasks
  ADD CONSTRAINT crm_tasks_type_check
  CHECK (task_type in ('Callback','Follow-Up','Analyzer Follow-Up','Send Email','Review Docs','Book Call','Close Deal','General'));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_analyzer_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_analyzer_events;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
