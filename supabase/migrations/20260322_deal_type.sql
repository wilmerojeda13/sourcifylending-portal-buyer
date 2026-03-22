-- ================================================================
-- DEAL TYPE MIGRATION
-- Adds two-tier commission structure: referral_only (10%) vs affiliate_closed (30%)
-- ================================================================

-- 1. Add deal_type columns to affiliate_referrals
ALTER TABLE public.affiliate_referrals
  ADD COLUMN IF NOT EXISTS deal_type TEXT NOT NULL DEFAULT 'referral_only'
    CHECK (deal_type IN ('referral_only', 'affiliate_closed')),
  ADD COLUMN IF NOT EXISTS deal_type_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deal_type_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_type_selected_by TEXT,       -- 'affiliate' | 'admin'
  ADD COLUMN IF NOT EXISTS deal_type_approved BOOLEAN,       -- NULL = not reviewed, TRUE = approved, FALSE = rejected
  ADD COLUMN IF NOT EXISTS deal_type_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_type_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Add deal_type to affiliate_commissions (records rate type used at commission time)
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS deal_type TEXT NOT NULL DEFAULT 'referral_only'
    CHECK (deal_type IN ('referral_only', 'affiliate_closed'));

-- 3. Global affiliate settings (single-row table)
CREATE TABLE IF NOT EXISTS public.affiliate_global_settings (
  id INT PRIMARY KEY DEFAULT 1,
  require_approval_for_affiliate_closed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.affiliate_global_settings (id, require_approval_for_affiliate_closed)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.affiliate_global_settings ENABLE ROW LEVEL SECURITY;

-- 4. Indexes for deal_type lookups
CREATE INDEX IF NOT EXISTS affiliate_referrals_deal_type_idx ON public.affiliate_referrals(deal_type);
CREATE INDEX IF NOT EXISTS affiliate_referrals_deal_type_approved_idx ON public.affiliate_referrals(deal_type_approved) WHERE deal_type = 'affiliate_closed';
