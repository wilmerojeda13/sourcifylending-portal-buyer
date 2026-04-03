-- ============================================================
-- CRM Calls / Tasks Backfill
-- Ensures the sales workspace tables exist on environments
-- where the original 20260330 migration was not applied.
-- ============================================================

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS lead_temperature text NOT NULL DEFAULT 'cold',
  ADD COLUMN IF NOT EXISTS strategy_call_booked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_to_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS close_probability integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS last_call_outcome text,
  ADD COLUMN IF NOT EXISTS last_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS callback_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_call_note text,
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid references auth.users(id) on delete set null,
  ADD COLUMN IF NOT EXISTS assigned_to_name text;

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_lead_temperature_check;

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_lead_temperature_check
  CHECK (lead_temperature in ('cold','warm','hot'));

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_close_probability_check;

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_close_probability_check
  CHECK (close_probability between 0 and 100);

CREATE TABLE IF NOT EXISTS public.crm_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  agent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_name text,
  lead_name text NOT NULL,
  company_name text,
  phone_number text NOT NULL,
  call_started_at timestamptz NOT NULL DEFAULT now(),
  call_ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  call_status text NOT NULL DEFAULT 'completed',
  call_outcome text NOT NULL DEFAULT 'Follow Up',
  notes text,
  next_follow_up_at timestamptz,
  lead_temperature text NOT NULL DEFAULT 'cold',
  strategy_call_booked boolean NOT NULL DEFAULT false,
  converted_to_client boolean NOT NULL DEFAULT false,
  booked_event_id text,
  booked_event_source text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_calls_status_check CHECK (call_status in ('completed','attempted','scheduled','missed')),
  CONSTRAINT crm_calls_outcome_check CHECK (call_outcome in ('No Answer','Left Voicemail','Bad Number','Not Interested','Call Back Later','Follow Up','Interested','Booked Call','Closed Won','Closed Lost')),
  CONSTRAINT crm_calls_temperature_check CHECK (lead_temperature in ('cold','warm','hot'))
);

CREATE INDEX IF NOT EXISTS crm_calls_lead_idx ON public.crm_calls (lead_id);
CREATE INDEX IF NOT EXISTS crm_calls_started_idx ON public.crm_calls (call_started_at desc);
CREATE INDEX IF NOT EXISTS crm_calls_agent_idx ON public.crm_calls (agent_user_id);
CREATE INDEX IF NOT EXISTS crm_calls_outcome_idx ON public.crm_calls (call_outcome);
CREATE INDEX IF NOT EXISTS crm_calls_follow_up_idx ON public.crm_calls (next_follow_up_at);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  related_call_id uuid REFERENCES public.crm_calls(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'To Do',
  due_at timestamptz,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name text,
  pipeline_stage text,
  notes text,
  completed_at timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_tasks_type_check CHECK (task_type in ('Callback','Follow-Up','Send Email','Review Docs','Book Call','Close Deal','General')),
  CONSTRAINT crm_tasks_priority_check CHECK (priority in ('Low','Medium','High','Urgent')),
  CONSTRAINT crm_tasks_status_check CHECK (status in ('To Do','In Progress','Waiting','Done'))
);

CREATE INDEX IF NOT EXISTS crm_tasks_lead_idx ON public.crm_tasks (lead_id);
CREATE INDEX IF NOT EXISTS crm_tasks_due_idx ON public.crm_tasks (due_at);
CREATE INDEX IF NOT EXISTS crm_tasks_owner_idx ON public.crm_tasks (owner_user_id);
CREATE INDEX IF NOT EXISTS crm_tasks_status_idx ON public.crm_tasks (status);
CREATE INDEX IF NOT EXISTS crm_tasks_priority_idx ON public.crm_tasks (priority);

ALTER TABLE public.crm_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm_calls" ON public.crm_calls;
CREATE POLICY "Admins manage crm_calls"
  ON public.crm_calls FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins manage crm_tasks" ON public.crm_tasks;
CREATE POLICY "Admins manage crm_tasks"
  ON public.crm_tasks FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

NOTIFY pgrst, 'reload schema';
