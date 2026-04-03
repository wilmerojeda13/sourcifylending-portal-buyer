ALTER TABLE public.portal_events
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS event_category text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE public.portal_events
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.portal_events
  DROP CONSTRAINT IF EXISTS portal_events_severity_check;

ALTER TABLE public.portal_events
  ADD CONSTRAINT portal_events_severity_check
  CHECK (severity IN ('info', 'success', 'warning', 'critical'));

CREATE INDEX IF NOT EXISTS portal_events_event_type_idx
  ON public.portal_events (event_type);

CREATE INDEX IF NOT EXISTS portal_events_event_category_idx
  ON public.portal_events (event_category);

CREATE TABLE IF NOT EXISTS public.affiliate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  website_or_social TEXT,
  promotion_plan TEXT NOT NULL,
  referral_experience BOOLEAN NOT NULL DEFAULT false,
  monthly_referral_estimate TEXT,
  marketing_channels TEXT[],
  agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'approved', 'declined')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_applications_email_idx
  ON public.affiliate_applications(email);

CREATE INDEX IF NOT EXISTS affiliate_applications_status_idx
  ON public.affiliate_applications(status);

CREATE INDEX IF NOT EXISTS affiliate_applications_created_at_idx
  ON public.affiliate_applications(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_applications_email_new_idx
  ON public.affiliate_applications(email)
  WHERE status = 'new';

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
