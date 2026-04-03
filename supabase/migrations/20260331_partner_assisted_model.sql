-- ================================================================
-- PARTNER-ASSISTED SALES MODEL
-- Supports self-serve vs partner-assisted pricing, ownership, CRM,
-- and payout attribution while preserving legacy affiliate records.
-- ================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acquisition_path TEXT NOT NULL DEFAULT 'self_serve'
    CHECK (acquisition_path IN ('self_serve', 'partner_assisted')),
  ADD COLUMN IF NOT EXISTS assigned_partner_affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_partner_name TEXT,
  ADD COLUMN IF NOT EXISTS partner_relationship_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS partner_onboarding_status TEXT
    CHECK (partner_onboarding_status IN ('unassigned', 'partner_closing', 'onboarding', 'active')),
  ADD COLUMN IF NOT EXISTS delegate_access_authorized BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS acquisition_path TEXT NOT NULL DEFAULT 'self_serve'
    CHECK (acquisition_path IN ('self_serve', 'partner_assisted')),
  ADD COLUMN IF NOT EXISTS assigned_partner_affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS setup_fee_amount_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_amount_cents INTEGER;

ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS acquisition_path TEXT NOT NULL DEFAULT 'self_serve'
    CHECK (acquisition_path IN ('self_serve', 'partner_assisted')),
  ADD COLUMN IF NOT EXISTS assigned_partner_affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_component TEXT
    CHECK (revenue_component IN ('setup_fee', 'recurring', 'refund', 'add_on')),
  ADD COLUMN IF NOT EXISTS partner_commission_eligible BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS acquisition_path TEXT NOT NULL DEFAULT 'self_serve'
    CHECK (acquisition_path IN ('self_serve', 'partner_assisted')),
  ADD COLUMN IF NOT EXISTS assigned_partner_affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_partner_name TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT
    CHECK (onboarding_status IN ('unassigned', 'partner_closing', 'onboarding', 'active'));

ALTER TABLE public.affiliate_leads
  ADD COLUMN IF NOT EXISTS acquisition_path TEXT NOT NULL DEFAULT 'partner_assisted'
    CHECK (acquisition_path IN ('self_serve', 'partner_assisted')),
  ADD COLUMN IF NOT EXISTS assigned_program TEXT
    CHECK (assigned_program IN ('program_a', 'program_b', 'program_c')),
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'partner_closing'
    CHECK (onboarding_status IN ('partner_closing', 'onboarding', 'active', 'canceled')),
  ADD COLUMN IF NOT EXISTS delegate_access_authorized BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_relationship_started_at TIMESTAMPTZ;

ALTER TABLE public.affiliate_referrals
  ADD COLUMN IF NOT EXISTS acquisition_path TEXT NOT NULL DEFAULT 'partner_assisted'
    CHECK (acquisition_path IN ('self_serve', 'partner_assisted')),
  ADD COLUMN IF NOT EXISTS partner_relationship_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT
    CHECK (onboarding_status IN ('partner_closing', 'onboarding', 'active', 'canceled')),
  ADD COLUMN IF NOT EXISTS delegate_access_authorized BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS revenue_component TEXT
    CHECK (revenue_component IN ('setup_fee', 'recurring')),
  ADD COLUMN IF NOT EXISTS acquisition_path TEXT NOT NULL DEFAULT 'partner_assisted'
    CHECK (acquisition_path IN ('self_serve', 'partner_assisted'));

UPDATE public.affiliate_commissions
SET revenue_component = CASE
  WHEN commission_type = 'setup' THEN 'setup_fee'
  ELSE 'recurring'
END
WHERE revenue_component IS NULL;

UPDATE public.affiliate_referrals
SET acquisition_path = 'partner_assisted',
    onboarding_status = COALESCE(onboarding_status, 'partner_closing'),
    partner_relationship_started_at = COALESCE(partner_relationship_started_at, created_at)
WHERE acquisition_path IS DISTINCT FROM 'partner_assisted';

UPDATE public.affiliate_leads
SET acquisition_path = 'partner_assisted',
    onboarding_status = COALESCE(onboarding_status, 'partner_closing'),
    partner_relationship_started_at = COALESCE(partner_relationship_started_at, created_at)
WHERE acquisition_path IS DISTINCT FROM 'partner_assisted';

CREATE INDEX IF NOT EXISTS profiles_partner_affiliate_idx
  ON public.profiles (assigned_partner_affiliate_id, acquisition_path);

CREATE INDEX IF NOT EXISTS subscriptions_partner_affiliate_idx
  ON public.subscriptions (assigned_partner_affiliate_id, acquisition_path);

CREATE INDEX IF NOT EXISTS crm_leads_partner_affiliate_idx
  ON public.crm_leads (assigned_partner_affiliate_id, acquisition_path);

CREATE INDEX IF NOT EXISTS affiliate_leads_acquisition_status_idx
  ON public.affiliate_leads (affiliate_id, acquisition_path, status);

CREATE INDEX IF NOT EXISTS affiliate_referrals_acquisition_status_idx
  ON public.affiliate_referrals (affiliate_id, acquisition_path, referral_status);

CREATE INDEX IF NOT EXISTS payment_records_partner_component_idx
  ON public.payment_records (assigned_partner_affiliate_id, revenue_component, payment_status);

NOTIFY pgrst, 'reload schema';
