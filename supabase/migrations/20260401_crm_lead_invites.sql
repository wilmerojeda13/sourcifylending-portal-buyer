CREATE TABLE IF NOT EXISTS public.crm_lead_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  email text NOT NULL,
  invite_type text NOT NULL CHECK (invite_type IN ('portal', 'pre_analyzer')),
  resend_email_id text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'account_created', 'analyzer_started', 'analyzer_submitted')),
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  account_created_at timestamptz,
  analyzer_started_at timestamptz,
  analyzer_submitted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_lead_invites_lead_id_idx
  ON public.crm_lead_invites (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_invites_email_idx
  ON public.crm_lead_invites (lower(email));

CREATE INDEX IF NOT EXISTS crm_lead_invites_resend_email_id_idx
  ON public.crm_lead_invites (resend_email_id);

CREATE INDEX IF NOT EXISTS crm_lead_invites_status_idx
  ON public.crm_lead_invites (status, invite_type);

ALTER TABLE public.crm_lead_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm_lead_invites" ON public.crm_lead_invites;
CREATE POLICY "Admins manage crm_lead_invites"
  ON public.crm_lead_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = true
    )
  );

NOTIFY pgrst, 'reload schema';
