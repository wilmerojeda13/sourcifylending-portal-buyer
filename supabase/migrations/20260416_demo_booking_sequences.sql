-- ─── Demo Booking Email Sequences ───────────────────────────────────────────
-- Tracks demo bookings and reminder send state so CRM demo appointments can
-- receive a confirmation email plus timed reminders without duplicating sends.

CREATE TABLE IF NOT EXISTS public.demo_booking_sequences (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_key                TEXT        NOT NULL,
  lead_id                     UUID        NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  lead_email                  TEXT        NOT NULL,
  lead_first_name             TEXT,
  lead_last_name              TEXT,
  business_name               TEXT,
  appointment_datetime        TIMESTAMPTZ NOT NULL,
  duration_minutes            INTEGER     NOT NULL DEFAULT 30,
  timezone                    TEXT        NOT NULL DEFAULT 'America/New_York',
  calendar_url                TEXT        NOT NULL,
  notes                       TEXT,
  confirmation_email_sent_at  TIMESTAMPTZ,
  confirmation_email_id       TEXT,
  reminder_24h_sent_at        TIMESTAMPTZ,
  reminder_24h_email_id       TEXT,
  reminder_3h_sent_at         TIMESTAMPTZ,
  reminder_3h_email_id        TEXT,
  reminder_10m_sent_at        TIMESTAMPTZ,
  reminder_10m_email_id       TEXT,
  canceled_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS demo_booking_sequences_sequence_key_idx
  ON public.demo_booking_sequences(sequence_key);

CREATE INDEX IF NOT EXISTS demo_booking_sequences_lead_id_idx
  ON public.demo_booking_sequences(lead_id);

CREATE INDEX IF NOT EXISTS demo_booking_sequences_appointment_idx
  ON public.demo_booking_sequences(appointment_datetime)
  WHERE canceled_at IS NULL;

CREATE INDEX IF NOT EXISTS demo_booking_sequences_pending_idx
  ON public.demo_booking_sequences(appointment_datetime, confirmation_email_sent_at, reminder_24h_sent_at, reminder_3h_sent_at, reminder_10m_sent_at)
  WHERE canceled_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_demo_booking_sequences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_demo_booking_sequences_updated_at
  BEFORE UPDATE ON public.demo_booking_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_demo_booking_sequences_updated_at();

ALTER TABLE public.demo_booking_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage demo_booking_sequences" ON public.demo_booking_sequences;
CREATE POLICY "Admins manage demo_booking_sequences"
  ON public.demo_booking_sequences FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

NOTIFY pgrst, 'reload schema';
