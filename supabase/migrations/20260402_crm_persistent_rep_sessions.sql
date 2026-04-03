CREATE TABLE IF NOT EXISTS public.crm_dialer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  rep_phone_number text NOT NULL,
  session_status text NOT NULL DEFAULT 'connecting' CHECK (
    session_status IN ('ready', 'not_ready', 'connecting', 'waiting', 'in_call', 'ended', 'failed')
  ),
  conference_name text NOT NULL UNIQUE,
  twilio_agent_call_sid text UNIQUE,
  twilio_conference_sid text,
  current_lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  current_crm_call_id uuid REFERENCES public.crm_calls(id) ON DELETE SET NULL,
  last_error text,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_dialer_sessions_one_active_per_agent_idx
  ON public.crm_dialer_sessions (agent_user_id)
  WHERE session_status IN ('ready', 'connecting', 'waiting', 'in_call');

CREATE INDEX IF NOT EXISTS crm_dialer_sessions_status_idx
  ON public.crm_dialer_sessions (session_status, updated_at DESC);

ALTER TABLE public.crm_dialer_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm_dialer_sessions" ON public.crm_dialer_sessions;
CREATE POLICY "Admins manage crm_dialer_sessions"
  ON public.crm_dialer_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = true
    )
  );

ALTER TABLE public.crm_calls
  ADD COLUMN IF NOT EXISTS dialer_session_id uuid REFERENCES public.crm_dialer_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_mode text NOT NULL DEFAULT 'per_call',
  ADD COLUMN IF NOT EXISTS conference_name text,
  ADD COLUMN IF NOT EXISTS twilio_conference_sid text,
  ADD COLUMN IF NOT EXISTS lead_leg_status text;

ALTER TABLE public.crm_calls
  DROP CONSTRAINT IF EXISTS crm_calls_session_mode_check;

ALTER TABLE public.crm_calls
  ADD CONSTRAINT crm_calls_session_mode_check
  CHECK (session_mode IN ('per_call', 'persistent'));

CREATE INDEX IF NOT EXISTS crm_calls_dialer_session_idx
  ON public.crm_calls (dialer_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_calls_session_mode_idx
  ON public.crm_calls (session_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_calls_twilio_conference_sid_idx
  ON public.crm_calls (twilio_conference_sid)
  WHERE twilio_conference_sid IS NOT NULL;
