-- ─── RLS Security Fixes ───────────────────────────────────────────────────────
-- Resolves Supabase security advisor alert: rls_disabled_in_public
-- Four tables in the public schema had RLS disabled or missing.

-- ── 1. underwriting_reviews ───────────────────────────────────────────────────
-- Users can read their own review history; all writes go through service role.
ALTER TABLE underwriting_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own underwriting reviews"
  ON underwriting_reviews FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. ai_credit_packs ────────────────────────────────────────────────────────
-- Public product catalog — any authenticated user can read available packs.
-- All admin operations use the service role (bypasses RLS).
ALTER TABLE ai_credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view credit packs"
  ON ai_credit_packs FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ── 3. user_purchased_ai_credits ──────────────────────────────────────────────
-- Users can read their own credit buckets only.
ALTER TABLE user_purchased_ai_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own purchased credits"
  ON user_purchased_ai_credits FOR SELECT
  USING (auth.uid() = user_id);

-- ── 4. ai_credit_purchase_transactions ───────────────────────────────────────
-- Users can read their own transaction history only.
ALTER TABLE ai_credit_purchase_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own credit transactions"
  ON ai_credit_purchase_transactions FOR SELECT
  USING (auth.uid() = user_id);
