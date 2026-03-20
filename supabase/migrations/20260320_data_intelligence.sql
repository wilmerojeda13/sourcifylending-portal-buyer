-- ============================================================
-- Data Intelligence & Learning System
-- ============================================================

-- 1. Portal Events — every user action
CREATE TABLE IF NOT EXISTS public.portal_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program         text CHECK (program IN ('program_a', 'program_b', 'program_c')),
  stage           text,
  opportunity_id  uuid REFERENCES public.account_opportunities(id) ON DELETE SET NULL,
  action_type     text NOT NULL,
  result          text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_events_user_id_idx ON public.portal_events(user_id);
CREATE INDEX IF NOT EXISTS portal_events_action_type_idx ON public.portal_events(action_type);
CREATE INDEX IF NOT EXISTS portal_events_opportunity_id_idx ON public.portal_events(opportunity_id);
CREATE INDEX IF NOT EXISTS portal_events_created_at_idx ON public.portal_events(created_at);

ALTER TABLE public.portal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own events" ON public.portal_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own events" ON public.portal_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access to events" ON public.portal_events USING (true) WITH CHECK (true);

-- 2. Opportunity Outcomes — user-reported approval results
CREATE TABLE IF NOT EXISTS public.opportunity_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id  uuid REFERENCES public.account_opportunities(id) ON DELETE SET NULL,
  opportunity_name text NOT NULL,
  program         text,
  stage           text,
  outcome         text NOT NULL CHECK (outcome IN ('approved', 'denied', 'pending', 'not_applied')),
  credit_score_range text,
  business_age    text,
  notes           text,
  data_source     text NOT NULL DEFAULT 'user_reported' CHECK (data_source IN ('user_reported', 'verified')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_outcomes_opportunity_id_idx ON public.opportunity_outcomes(opportunity_id);
CREATE INDEX IF NOT EXISTS opportunity_outcomes_outcome_idx ON public.opportunity_outcomes(outcome);

ALTER TABLE public.opportunity_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own outcomes" ON public.opportunity_outcomes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own outcomes" ON public.opportunity_outcomes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access to outcomes" ON public.opportunity_outcomes USING (true) WITH CHECK (true);

-- 3. Opportunity Performance — aggregated stats (updated by scheduled job)
CREATE TABLE IF NOT EXISTS public.opportunity_performance (
  opportunity_id   uuid PRIMARY KEY REFERENCES public.account_opportunities(id) ON DELETE CASCADE,
  opportunity_name text NOT NULL,
  total_views      int NOT NULL DEFAULT 0,
  total_clicks     int NOT NULL DEFAULT 0,
  total_reported   int NOT NULL DEFAULT 0,
  total_approved   int NOT NULL DEFAULT 0,
  total_denied     int NOT NULL DEFAULT 0,
  total_pending    int NOT NULL DEFAULT 0,
  approval_rate    numeric(5,2),
  performance_tag  text DEFAULT 'unknown' CHECK (performance_tag IN ('high', 'average', 'low', 'unknown')),
  last_computed_at timestamptz DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read performance" ON public.opportunity_performance FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);
CREATE POLICY "Service role full access to performance" ON public.opportunity_performance USING (true) WITH CHECK (true);
