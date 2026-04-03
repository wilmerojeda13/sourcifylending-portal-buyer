CREATE TABLE IF NOT EXISTS public.crm_lead_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  message_body text NOT NULL,
  twilio_message_sid text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'clicked', 'account_created', 'failed')),
  delivery_status text,
  clicked boolean NOT NULL DEFAULT false,
  campaign_id uuid,
  sent_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  destination_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  clicked_at timestamptz,
  account_created_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_lead_sms_lead_idx
  ON public.crm_lead_sms (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_sms_status_idx
  ON public.crm_lead_sms (status, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_sms_sent_at_idx
  ON public.crm_lead_sms (sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_sms_twilio_sid_idx
  ON public.crm_lead_sms (twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

ALTER TABLE public.crm_lead_sms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm_lead_sms" ON public.crm_lead_sms;
CREATE POLICY "Admins manage crm_lead_sms"
  ON public.crm_lead_sms FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = true
    )
  );

NOTIFY pgrst, 'reload schema';
