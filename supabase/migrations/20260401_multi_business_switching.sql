-- ================================================================
-- MULTI-BUSINESS MEMBER PORTAL ACCESS
-- Allows one auth user to access multiple existing business/member
-- accounts and remember an active business context.
-- ================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_business_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.profile_business_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_business_memberships_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'delegate')),
  CONSTRAINT profile_business_memberships_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT profile_business_memberships_auth_business_unique
    UNIQUE (auth_user_id, business_profile_id)
);

CREATE INDEX IF NOT EXISTS profile_business_memberships_auth_idx
  ON public.profile_business_memberships (auth_user_id, status, is_default);

CREATE INDEX IF NOT EXISTS profile_business_memberships_business_idx
  ON public.profile_business_memberships (business_profile_id, status);

INSERT INTO public.profile_business_memberships (auth_user_id, business_profile_id, role, status, is_default)
SELECT id, id, 'owner', 'active', true
FROM public.profiles
ON CONFLICT (auth_user_id, business_profile_id) DO NOTHING;

UPDATE public.profiles
SET active_business_profile_id = id
WHERE active_business_profile_id IS NULL;

ALTER TABLE public.profile_business_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own business memberships" ON public.profile_business_memberships;
CREATE POLICY "Users read own business memberships"
  ON public.profile_business_memberships
  FOR SELECT
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Users update own business memberships" ON public.profile_business_memberships;
CREATE POLICY "Users update own business memberships"
  ON public.profile_business_memberships
  FOR UPDATE
  USING (auth.uid() = auth_user_id);

NOTIFY pgrst, 'reload schema';
