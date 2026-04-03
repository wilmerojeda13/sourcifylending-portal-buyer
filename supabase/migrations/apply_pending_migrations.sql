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
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS lead_temperature text NOT NULL DEFAULT 'cold',
  ADD COLUMN IF NOT EXISTS strategy_call_booked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_to_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS close_probability integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS last_call_outcome text,
  ADD COLUMN IF NOT EXISTS last_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS callback_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_call_note text,
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid references auth.users(id) on delete set null,
  ADD COLUMN IF NOT EXISTS assigned_to_name text;

CREATE TABLE IF NOT EXISTS public.crm_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  agent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_name text,
  lead_name text NOT NULL,
  company_name text,
  phone_number text NOT NULL,
  call_started_at timestamptz NOT NULL DEFAULT now(),
  call_ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  call_status text NOT NULL DEFAULT 'completed',
  call_outcome text NOT NULL DEFAULT 'Follow Up',
  notes text,
  next_follow_up_at timestamptz,
  lead_temperature text NOT NULL DEFAULT 'cold',
  strategy_call_booked boolean NOT NULL DEFAULT false,
  converted_to_client boolean NOT NULL DEFAULT false,
  booked_event_id text,
  booked_event_source text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  related_call_id uuid REFERENCES public.crm_calls(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'To Do',
  due_at timestamptz,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name text,
  pipeline_stage text,
  notes text,
  completed_at timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_calls' AND policyname = 'Admins manage crm_calls'
  ) THEN
    CREATE POLICY "Admins manage crm_calls"
      ON public.crm_calls FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_tasks' AND policyname = 'Admins manage crm_tasks'
  ) THEN
    CREATE POLICY "Admins manage crm_tasks"
      ON public.crm_tasks FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
