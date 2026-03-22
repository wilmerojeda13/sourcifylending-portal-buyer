-- ================================================================
-- AFFILIATE PAYOUTS — Stripe Connect payout system
-- ================================================================

-- 1. Add Stripe Connect fields to affiliates
ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS stripe_account_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_status   TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (stripe_connect_status IN ('not_connected', 'pending', 'active', 'restricted'));

-- 2. Add payout reference to commissions
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS payout_id UUID;

-- 3. Affiliate payouts table
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        UUID        NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  stripe_account_id   TEXT        NOT NULL,
  stripe_transfer_id  TEXT,
  amount_cents        INT         NOT NULL,
  currency            TEXT        NOT NULL DEFAULT 'usd',
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  commission_ids      UUID[]      NOT NULL DEFAULT '{}',
  failure_reason      TEXT,
  notes               TEXT,
  triggered_by        TEXT        NOT NULL DEFAULT 'cron'
                                  CHECK (triggered_by IN ('cron', 'admin', 'system')),
  triggered_by_user   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_payouts_affiliate_idx
  ON public.affiliate_payouts (affiliate_id, status);

CREATE INDEX IF NOT EXISTS affiliate_payouts_status_created_idx
  ON public.affiliate_payouts (status, created_at DESC);

-- 4. RLS
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliate_payouts_own_read" ON public.affiliate_payouts
  FOR SELECT
  USING (
    affiliate_id IN (
      SELECT id FROM public.affiliates WHERE user_id = auth.uid()
    )
  );
