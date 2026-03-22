-- ================================================================
-- EXISTING CLIENT → AFFILIATE RULES
-- ================================================================

-- 1. Mark affiliates who were already clients before becoming affiliates
ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS is_existing_client BOOLEAN NOT NULL DEFAULT false;

-- 2. Track referral attribution timestamps for retroactive enforcement
--    (referral created_at must be >= affiliate created_at to be valid)
--    No new column needed — created_at already exists on affiliate_referrals.

-- 3. Index to speed up retroactive + self-referral lookups
CREATE INDEX IF NOT EXISTS affiliates_user_id_created_idx ON public.affiliates(user_id, created_at);
CREATE INDEX IF NOT EXISTS affiliate_referrals_user_affiliate_idx ON public.affiliate_referrals(affiliate_id, user_id);
