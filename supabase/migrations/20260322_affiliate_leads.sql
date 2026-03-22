-- ================================================================
-- AFFILIATE LEADS — Prospect CRM for affiliates
-- ================================================================

CREATE TABLE IF NOT EXISTS public.affiliate_leads (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        UUID        NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  full_name           TEXT        NOT NULL,
  email               TEXT        NOT NULL,
  phone               TEXT,
  business_name       TEXT,
  notes               TEXT,
  deal_type           TEXT        NOT NULL DEFAULT 'referral_only'
                                  CHECK (deal_type IN ('referral_only', 'affiliate_closed')),
  status              TEXT        NOT NULL DEFAULT 'lead_created'
                                  CHECK (status IN ('lead_created', 'invite_sent', 'account_created', 'active', 'cancelled')),
  invite_sent_at      TIMESTAMPTZ,
  invite_sent_count   INT         NOT NULL DEFAULT 0,
  account_created_at  TIMESTAMPTZ,
  converted_at        TIMESTAMPTZ,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_id         UUID        REFERENCES public.affiliate_referrals(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One lead per email per affiliate
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_leads_affiliate_email_idx
  ON public.affiliate_leads (affiliate_id, lower(email));

-- Fast lookups when linking user_id after signup
CREATE INDEX IF NOT EXISTS affiliate_leads_user_id_idx
  ON public.affiliate_leads (user_id);

-- Fast status-based queries
CREATE INDEX IF NOT EXISTS affiliate_leads_affiliate_status_idx
  ON public.affiliate_leads (affiliate_id, status);

-- RLS
ALTER TABLE public.affiliate_leads ENABLE ROW LEVEL SECURITY;

-- Affiliates can only see and manage their own leads
CREATE POLICY "affiliate_leads_own" ON public.affiliate_leads
  FOR ALL
  USING (
    affiliate_id IN (
      SELECT id FROM public.affiliates WHERE user_id = auth.uid()
    )
  );
