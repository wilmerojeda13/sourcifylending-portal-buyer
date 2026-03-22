-- ================================================================
-- AFFILIATE APPLICATIONS TABLE
-- ================================================================

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

CREATE INDEX IF NOT EXISTS affiliate_applications_email_idx ON public.affiliate_applications(email);
CREATE INDEX IF NOT EXISTS affiliate_applications_status_idx ON public.affiliate_applications(status);
CREATE INDEX IF NOT EXISTS affiliate_applications_created_at_idx ON public.affiliate_applications(created_at DESC);

-- Prevent duplicate applications from same email in pending/new state
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_applications_email_new_idx
  ON public.affiliate_applications(email)
  WHERE status = 'new';

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;
-- No public read access — service role only

-- Auto-update trigger
DROP TRIGGER IF EXISTS trg_affiliate_applications_updated_at ON public.affiliate_applications;
CREATE TRIGGER trg_affiliate_applications_updated_at
  BEFORE UPDATE ON public.affiliate_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_affiliate();
