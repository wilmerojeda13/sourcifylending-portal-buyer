ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS likely_timezone text,
  ADD COLUMN IF NOT EXISTS timezone_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS timezone_source text,
  ADD COLUMN IF NOT EXISTS last_timezone_checked_at timestamptz;

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_timezone_confidence_check;

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_timezone_confidence_check
  CHECK (timezone_confidence in ('high', 'medium', 'low', 'unknown'));

CREATE INDEX IF NOT EXISTS crm_leads_phone_e164_idx
  ON public.crm_leads (phone_e164);

CREATE INDEX IF NOT EXISTS crm_leads_likely_timezone_idx
  ON public.crm_leads (likely_timezone);

CREATE TABLE IF NOT EXISTS public.crm_call_compliance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  phone_e164 text,
  likely_timezone text,
  local_time_at_recipient text,
  rule_applied text NOT NULL,
  blocked_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_call_compliance_logs_lead_idx
  ON public.crm_call_compliance_logs (lead_id, created_at desc);

ALTER TABLE public.crm_call_compliance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm_call_compliance_logs" ON public.crm_call_compliance_logs;
CREATE POLICY "Admins manage crm_call_compliance_logs"
  ON public.crm_call_compliance_logs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

NOTIFY pgrst, 'reload schema';
