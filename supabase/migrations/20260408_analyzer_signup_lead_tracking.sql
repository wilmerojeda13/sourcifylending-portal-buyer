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
  ADD COLUMN IF NOT EXISTS duplicate_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_review_reason text;

CREATE INDEX IF NOT EXISTS crm_leads_analyzer_submitted_idx
  ON public.crm_leads (analyzer_submitted, analyzer_submitted_at desc);

CREATE INDEX IF NOT EXISTS crm_leads_account_created_idx
  ON public.crm_leads (account_created, account_created_at desc);

CREATE INDEX IF NOT EXISTS crm_leads_duplicate_review_idx
  ON public.crm_leads (duplicate_review_required)
  WHERE duplicate_review_required = true;

CREATE INDEX IF NOT EXISTS leads_submitted_at_idx
  ON public.leads (submitted_at desc);

ALTER TABLE public.crm_tasks
  DROP CONSTRAINT IF EXISTS crm_tasks_type_check;

ALTER TABLE public.crm_tasks
  ADD CONSTRAINT crm_tasks_type_check
  CHECK (task_type in ('Callback','Follow-Up','Analyzer Follow-Up','Send Email','Review Docs','Book Call','Close Deal','General'));

NOTIFY pgrst, 'reload schema';
