ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspicious_signup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspicious_signup_reason text,
  ADD COLUMN IF NOT EXISTS signup_risk_score integer,
  ADD COLUMN IF NOT EXISTS signup_source text,
  ADD COLUMN IF NOT EXISTS signup_last_ip text,
  ADD COLUMN IF NOT EXISTS signup_last_user_agent text;

CREATE TABLE IF NOT EXISTS public.signup_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  user_agent text,
  event_type text NOT NULL CHECK (
    event_type IN (
      'attempt',
      'blocked_rate_limit',
      'blocked_validation',
      'blocked_disposable',
      'blocked_captcha',
      'created',
      'suspicious_created',
      'confirmed'
    )
  ),
  risk_score integer,
  risk_reasons text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_security_events_email_idx
  ON public.signup_security_events (email, created_at DESC);

CREATE INDEX IF NOT EXISTS signup_security_events_ip_idx
  ON public.signup_security_events (ip_address, created_at DESC);

ALTER TABLE public.signup_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read signup_security_events" ON public.signup_security_events;
CREATE POLICY "Admins read signup_security_events"
  ON public.signup_security_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = true
    )
  );

UPDATE public.profiles
SET
  portal_blocked = true,
  account_state = 'prospect',
  suspicious_signup = true,
  suspicious_signup_reason = COALESCE(suspicious_signup_reason, 'Randomized name/business metadata, unconfirmed email, and no real downstream activity.'),
  signup_risk_score = COALESCE(signup_risk_score, 90),
  signup_source = COALESCE(signup_source, 'email_password'),
  updated_at = now()
WHERE id IN (
  '688ebe8d-e0d2-42fc-8528-9a2b5ba45d58',
  '0af0affe-9bc9-4710-8b03-eeaaac598c29'
);

NOTIFY pgrst, 'reload schema';
