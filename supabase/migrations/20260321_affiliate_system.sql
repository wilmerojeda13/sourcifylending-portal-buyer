-- ================================================================
-- AFFILIATE SYSTEM MIGRATION
-- ================================================================

-- 1. AFFILIATES TABLE
CREATE TABLE IF NOT EXISTS public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  tier TEXT NOT NULL DEFAULT 'standard',
  has_free_program_b_access BOOLEAN NOT NULL DEFAULT false,
  qualification_start_date TIMESTAMPTZ,
  free_access_unlocked_at TIMESTAMPTZ,
  notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliates_user_id_idx ON public.affiliates(user_id);
CREATE INDEX IF NOT EXISTS affiliates_referral_code_idx ON public.affiliates(referral_code);
CREATE INDEX IF NOT EXISTS affiliates_email_idx ON public.affiliates(email);
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Affiliates read own record" ON public.affiliates;
CREATE POLICY "Affiliates read own record" ON public.affiliates FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Affiliates update own record" ON public.affiliates;
CREATE POLICY "Affiliates update own record" ON public.affiliates FOR UPDATE USING (auth.uid() = user_id);

-- 2. AFFILIATE CLICKS
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  landing_page TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_clicks_affiliate_id_idx ON public.affiliate_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_clicks_created_at_idx ON public.affiliate_clicks(created_at);
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Affiliates read own clicks" ON public.affiliate_clicks;
CREATE POLICY "Affiliates read own clicks" ON public.affiliate_clicks FOR SELECT USING (
  affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
);

-- 3. AFFILIATE REFERRALS
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  lead_name TEXT,
  lead_email TEXT NOT NULL,
  program_type TEXT CHECK (program_type IN ('program_a', 'program_b', 'program_c')),
  referral_status TEXT NOT NULL DEFAULT 'clicked' CHECK (
    referral_status IN ('clicked', 'lead_created', 'signed_up', 'active', 'past_due', 'canceled', 'refunded', 'chargeback')
  ),
  stripe_customer_id TEXT,
  subscription_active BOOLEAN DEFAULT false,
  last_payment_at TIMESTAMPTZ,
  is_self_referral BOOLEAN DEFAULT false,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_referrals_affiliate_id_idx ON public.affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_referrals_user_id_idx ON public.affiliate_referrals(user_id);
CREATE INDEX IF NOT EXISTS affiliate_referrals_lead_email_idx ON public.affiliate_referrals(lead_email);
CREATE INDEX IF NOT EXISTS affiliate_referrals_status_idx ON public.affiliate_referrals(referral_status);
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Affiliates read own referrals" ON public.affiliate_referrals;
CREATE POLICY "Affiliates read own referrals" ON public.affiliate_referrals FOR SELECT USING (
  affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
);

-- 4. AFFILIATE COMMISSIONS
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES public.affiliate_referrals(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  program_type TEXT NOT NULL CHECK (program_type IN ('program_a', 'program_b', 'program_c')),
  commission_type TEXT NOT NULL CHECK (commission_type IN ('setup', 'recurring')),
  gross_amount INTEGER NOT NULL, -- in cents
  commission_percent NUMERIC(5,2) NOT NULL,
  commission_amount INTEGER NOT NULL, -- in cents
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'reversed')),
  available_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_commissions_affiliate_id_idx ON public.affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_commissions_referral_id_idx ON public.affiliate_commissions(referral_id);
CREATE INDEX IF NOT EXISTS affiliate_commissions_status_idx ON public.affiliate_commissions(status);
CREATE INDEX IF NOT EXISTS affiliate_commissions_stripe_payment_intent_id_idx ON public.affiliate_commissions(stripe_payment_intent_id);
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Affiliates read own commissions" ON public.affiliate_commissions;
CREATE POLICY "Affiliates read own commissions" ON public.affiliate_commissions FOR SELECT USING (
  affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
);

-- 5. AFFILIATE SETTINGS (per program)
CREATE TABLE IF NOT EXISTS public.affiliate_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_type TEXT NOT NULL UNIQUE CHECK (program_type IN ('program_a', 'program_b', 'program_c')),
  setup_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  recurring_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  setup_hold_days INTEGER NOT NULL DEFAULT 7,
  recurring_hold_days INTEGER NOT NULL DEFAULT 7,
  minimum_payout_threshold INTEGER NOT NULL DEFAULT 10000, -- cents ($100)
  setup_commissions_enabled BOOLEAN NOT NULL DEFAULT true,
  recurring_commissions_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliate_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Affiliates read settings" ON public.affiliate_settings;
CREATE POLICY "Affiliates read settings" ON public.affiliate_settings FOR SELECT TO authenticated USING (true);

-- Seed default settings
INSERT INTO public.affiliate_settings (program_type, setup_commission_percent, recurring_commission_percent)
VALUES
  ('program_a', 30.00, 20.00),
  ('program_b', 30.00, 20.00),
  ('program_c', 0.00, 20.00)
ON CONFLICT (program_type) DO NOTHING;

-- For program_c: setup is disabled since there may be no setup fee
UPDATE public.affiliate_settings SET setup_commissions_enabled = false WHERE program_type = 'program_c';

-- 6. AFFILIATE FLAGS / REVIEWS
CREATE TABLE IF NOT EXISTS public.affiliate_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES public.affiliate_referrals(id) ON DELETE SET NULL,
  flag_type TEXT NOT NULL CHECK (
    flag_type IN ('self_referral', 'same_payment_method', 'ip_clustering', 'suspicious_signup', 'duplicate_email', 'other')
  ),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_flags_affiliate_id_idx ON public.affiliate_flags(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_flags_status_idx ON public.affiliate_flags(status);
ALTER TABLE public.affiliate_flags ENABLE ROW LEVEL SECURITY;

-- 7. AFFILIATE RESOURCE CONTENT
CREATE TABLE IF NOT EXISTS public.affiliate_resource_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (
    category IN ('marketing', 'program_summary', 'sales_language', 'compliance', 'how_it_works', 'general')
  ),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliate_resource_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Affiliates read published resources" ON public.affiliate_resource_content;
CREATE POLICY "Affiliates read published resources" ON public.affiliate_resource_content
  FOR SELECT TO authenticated USING (status = 'published');

-- Seed default resource content
INSERT INTO public.affiliate_resource_content (title, slug, content, category, sort_order) VALUES
(
  'How It Works — Sales Overview',
  'how-it-works',
  E'# How SourcifyLending Works\n\nSourcifyLending is an AI-powered business credit building and funding advisory platform. Here''s how to explain it to prospects:\n\n## The Core Value\nWe help business owners build real business credit that separates from their personal credit, and position them to access 0% intro APR business funding.\n\n## Program A — 0% Business Credit Funding\nWe help clients access 0% intro APR business credit cards with $50K–$150K+ in combined limits. This is interest-free business capital, not a loan.\n\n**Key talking points:**\n- No interest for 12–21 months\n- Uses business credit profile\n- Does not report to personal credit bureaus\n- Clients use it for payroll, inventory, or operations\n\n## Program B — Business Credit Builder\nWe build an 80+ Paydex score with Dun & Bradstreet and Experian Business through net-30 vendor accounts and credit tradelines.\n\n**Key talking points:**\n- Takes 90–180 days to build a fundable credit profile\n- Access to business loans without personal guarantee later\n- Includes EIN setup guidance and business profile credibility\n\n## Program C — Capital Monitoring\nCredit monitoring, dispute management, and ongoing capital readiness tracking.\n\n## Your Role as an Affiliate\nYou refer interested business owners. We handle the sales call, enrollment, onboarding, compliance, and fulfillment. You earn commissions on every payment they make.',
  'how_it_works',
  10
),
(
  'Approved Marketing Copy',
  'approved-copy',
  E'# Approved Marketing Language\n\nUse ONLY these approved phrases and frameworks when promoting SourcifyLending.\n\n## Approved Headlines\n- "Build business credit that separates from your personal"  \n- "Access 0% interest business funding — no personal guarantee"\n- "Get your business financially ready for real funding"\n- "Stop funding your business with personal credit"\n\n## Approved Program Descriptions\n\n**Program A:**\n"Access 0% intro APR business credit cards with combined limits of $50,000–$150,000+. Our team positions your business profile to qualify and applies a strategic approval sequence."\n\n**Program B:**\n"We build your business credit profile from the ground up using Dun & Bradstreet, Experian Business, and Equifax Business. Most clients have an 80+ Paydex score within 90–180 days."\n\n## What NOT to Say\n- Do NOT promise specific approval amounts\n- Do NOT guarantee funding or credit limits\n- Do NOT promise specific timelines\n- Do NOT say "guaranteed approval"\n- Do NOT make income claims',
  'marketing',
  20
),
(
  'Compliance Rules — Read Before You Promote',
  'compliance-rules',
  E'# Compliance Rules for Affiliates\n\n**These rules are mandatory. Violations may result in suspension or termination of your affiliate account.**\n\n## You MUST NOT:\n- Promise or guarantee approvals, funding amounts, or credit limits\n- Promise specific timelines for results\n- Misrepresent SourcifyLending''s programs, pricing, or services\n- Claim SourcifyLending is a lender (we are an advisory service)\n- Use high-pressure tactics, false urgency, or misleading claims\n- Impersonate SourcifyLending staff\n- Make income claims or share your commission earnings as a pitch\n\n## You MUST:\n- Use only approved marketing language\n- Direct all product questions to the SourcifyLending sales team\n- Clearly disclose that you are an affiliate referral partner if asked\n- Ensure prospects understand they are speaking with a referral partner, not SourcifyLending staff\n\n## Enforcement\nSourcifyLending reserves the right to suspend or permanently terminate affiliate access for violations, including forfeiture of pending commissions for serious violations.\n\nIf you are unsure whether something is compliant, contact us before publishing.',
  'compliance',
  30
),
(
  'Program Pricing Summary',
  'program-pricing',
  E'# Program Pricing (Current)\n\n## Program A — 0% Business Funding Advisory\n- Setup Fee: $1,500 (one-time)\n- Monthly Fee: $399/month\n- Your Commission: 30% of setup + 20% of monthly recurring\n\n## Program B — Business Credit Builder\n- Setup Fee: $997 (one-time)\n- Monthly Fee: $199/month\n- Your Commission: 30% of setup + 20% of monthly recurring\n\n## Program C — Capital Monitoring\n- Monthly Fee: $97/month (no setup fee)\n- Your Commission: 20% of monthly recurring\n\n## Commission Example\nIf you refer a client to Program A:\n- Setup commission: $1,500 × 30% = **$450**\n- Monthly recurring: $399 × 20% = **$79.80/month**\n- After 12 months: $450 + ($79.80 × 12) = **$1,407.60 total**\n\n*Note: Commissions are earned on collected revenue only. Setup commissions are subject to a 7-day hold. Recurring commissions are subject to a 7-day hold.*',
  'program_summary',
  40
)
ON CONFLICT (slug) DO NOTHING;

-- 8. AUTO-UPDATE TRIGGERS
CREATE OR REPLACE FUNCTION public.set_updated_at_affiliate()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_affiliates_updated_at ON public.affiliates;
CREATE TRIGGER trg_affiliates_updated_at BEFORE UPDATE ON public.affiliates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_affiliate();

DROP TRIGGER IF EXISTS trg_affiliate_referrals_updated_at ON public.affiliate_referrals;
CREATE TRIGGER trg_affiliate_referrals_updated_at BEFORE UPDATE ON public.affiliate_referrals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_affiliate();

DROP TRIGGER IF EXISTS trg_affiliate_commissions_updated_at ON public.affiliate_commissions;
CREATE TRIGGER trg_affiliate_commissions_updated_at BEFORE UPDATE ON public.affiliate_commissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_affiliate();

DROP TRIGGER IF EXISTS trg_affiliate_settings_updated_at ON public.affiliate_settings;
CREATE TRIGGER trg_affiliate_settings_updated_at BEFORE UPDATE ON public.affiliate_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_affiliate();
