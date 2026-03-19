-- ============================================================
-- APPLY ALL PENDING MIGRATIONS
-- Run this entire script in the Supabase SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
-- All statements use IF NOT EXISTS so it is safe to re-run.
-- ============================================================

-- ─── 1. Profile columns for analyzer / prospect flow ────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_state TEXT NOT NULL DEFAULT 'active_member'
    CHECK (account_state IN ('prospect', 'active_member')),
  ADD COLUMN IF NOT EXISTS lead_id UUID,
  ADD COLUMN IF NOT EXISTS latest_analyzer_result JSONB,
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notion_page_id TEXT;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_converted
  ON leads(converted_to_user_id)
  WHERE converted_to_user_id IS NOT NULL;

-- ─── 2. Support Messages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
  admin_reply TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_user_id_idx ON public.support_messages(user_id);
CREATE INDEX IF NOT EXISTS support_messages_status_idx  ON public.support_messages(status);
CREATE INDEX IF NOT EXISTS support_messages_created_idx ON public.support_messages(created_at DESC);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_messages' AND policyname = 'support_messages_select_own'
  ) THEN
    CREATE POLICY "support_messages_select_own"
      ON public.support_messages FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_messages' AND policyname = 'support_messages_insert_own'
  ) THEN
    CREATE POLICY "support_messages_insert_own"
      ON public.support_messages FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 3. Admin / role columns + support assignments ──────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client'
    CHECK (role IN ('super_admin', 'admin', 'support', 'client'));

CREATE TABLE IF NOT EXISTS public.support_assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name     TEXT,
  support_notes        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_user_id)
);

ALTER TABLE public.support_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_assignments' AND policyname = 'Admins manage support assignments'
  ) THEN
    CREATE POLICY "Admins manage support assignments"
      ON public.support_assignments FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;
END $$;

-- ─── 4. Notify PostgREST to reload schema cache ─────────────────────────────
NOTIFY pgrst, 'reload schema';
