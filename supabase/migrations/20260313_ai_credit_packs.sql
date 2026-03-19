-- ─── AI Credit Packs ──────────────────────────────────────────────────────────
-- Admin-managed purchasable extra AI credit bundles for active paid members.

-- 1. Purchasable pack definitions
CREATE TABLE IF NOT EXISTS ai_credit_packs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  credits_amount  INTEGER NOT NULL CHECK (credits_amount > 0),
  price_usd       NUMERIC(10,2) NOT NULL CHECK (price_usd > 0),
  stripe_price_id TEXT,           -- optional: pre-created Stripe price; if NULL, checkout uses price_data
  is_active       BOOLEAN NOT NULL DEFAULT true,
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Per-user purchased credit buckets
-- Each purchase creates one row. Credits are deducted here when consumed.
-- Purchased credits DO NOT reset monthly — they persist while account is active.
CREATE TABLE IF NOT EXISTS user_purchased_ai_credits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_purchased    INTEGER NOT NULL DEFAULT 0,
  credits_used         INTEGER NOT NULL DEFAULT 0,
  credits_remaining    INTEGER NOT NULL DEFAULT 0,
  source_type          TEXT NOT NULL DEFAULT 'stripe_purchase',  -- stripe_purchase | admin_grant | admin_deduction | promo
  source_reference_id  TEXT,   -- stripe checkout session id or admin note
  purchase_date        TIMESTAMPTZ DEFAULT NOW(),
  expires_at           TIMESTAMPTZ,  -- NULL = no expiry while account active
  status               TEXT NOT NULL DEFAULT 'active',  -- active | consumed | expired | reversed
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchased_credits_user_status
  ON user_purchased_ai_credits(user_id, status);

-- 3. Full purchase + adjustment audit log
CREATE TABLE IF NOT EXISTS ai_credit_purchase_transactions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_credit_pack_id           UUID REFERENCES ai_credit_packs(id),
  purchased_credits_bucket_id UUID REFERENCES user_purchased_ai_credits(id),
  stripe_checkout_session_id  TEXT UNIQUE,   -- UNIQUE enforces idempotency
  stripe_payment_intent_id    TEXT,
  stripe_invoice_id           TEXT,
  amount_paid                 NUMERIC(10,2),
  credits_added               INTEGER NOT NULL DEFAULT 0,
  transaction_status          TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | failed | reversed
  adjusted_by                 UUID REFERENCES auth.users(id),   -- admin user_id for manual grants
  adjustment_reason           TEXT,
  metadata_json               JSONB,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_txn_user
  ON ai_credit_purchase_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_txn_stripe_session
  ON ai_credit_purchase_transactions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- 4. Add credit_source column to user_ai_usage_events
--    'monthly' = consumed from included monthly credits
--    'purchased' = consumed from a purchased extra-credit bucket
ALTER TABLE user_ai_usage_events
  ADD COLUMN IF NOT EXISTS credit_source TEXT NOT NULL DEFAULT 'monthly';

-- 5. Disable RLS (service-role access only; no direct client RLS needed)
ALTER TABLE ai_credit_packs                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_purchased_ai_credits        DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_credit_purchase_transactions  DISABLE ROW LEVEL SECURITY;

-- 6. Seed default credit packs
--    stripe_price_id intentionally NULL — checkout will use inline price_data.
--    Admins can set Stripe price IDs later via the admin panel.
INSERT INTO ai_credit_packs (name, description, credits_amount, price_usd, display_order, is_active)
VALUES
  ('Starter Pack',  '25 extra AI credits — great for occasional top-ups',      25,  9.00, 1, true),
  ('Value Pack',    '50 extra AI credits — best value for active members',      50, 15.00, 2, true),
  ('Power Pack',    '100 extra AI credits — ideal for power users',            100, 25.00, 3, true),
  ('Pro Pack',      '250 extra AI credits — maximum flexibility, best rate',   250, 49.00, 4, true)
ON CONFLICT DO NOTHING;
