-- Local CRM appointments table for booked demos and manual calendar syncs.
CREATE TABLE IF NOT EXISTS public.appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  appointment_at      timestamptz NOT NULL,
  duration_minutes    integer NOT NULL DEFAULT 30,
  timezone            text NOT NULL DEFAULT 'America/New_York',
  title               text NOT NULL,
  description         text,
  notes               text,
  status              text NOT NULL DEFAULT 'scheduled',
  google_calendar_url text,
  created_by_user_id  uuid,
  created_by_name     text,
  lead_name           text,
  company_name        text,
  phone_number        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_lead_id_idx
  ON public.appointments (lead_id);

CREATE INDEX IF NOT EXISTS appointments_appointment_at_idx
  ON public.appointments (appointment_at DESC);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage appointments" ON public.appointments;
CREATE POLICY "Admins manage appointments"
ON public.appointments FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
