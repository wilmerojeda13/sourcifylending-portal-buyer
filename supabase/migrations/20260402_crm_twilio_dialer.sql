ALTER TABLE public.crm_calls
  ADD COLUMN IF NOT EXISTS call_provider text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS twilio_status text,
  ADD COLUMN IF NOT EXISTS twilio_call_sid text,
  ADD COLUMN IF NOT EXISTS twilio_agent_call_sid text,
  ADD COLUMN IF NOT EXISTS from_number text,
  ADD COLUMN IF NOT EXISTS to_number_e164 text,
  ADD COLUMN IF NOT EXISTS rep_phone_number text,
  ADD COLUMN IF NOT EXISTS answered_by text,
  ADD COLUMN IF NOT EXISTS amd_status text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.crm_calls
  DROP CONSTRAINT IF EXISTS crm_calls_outcome_check;

ALTER TABLE public.crm_calls
  ADD CONSTRAINT crm_calls_outcome_check
  CHECK (
    call_outcome IN (
      'No Answer',
      'Voicemail',
      'Left Voicemail',
      'Busy',
      'Bad Number',
      'Not Interested',
      'Do Not Call',
      'Call Back',
      'Call Back Later',
      'Follow Up',
      'Interested',
      'Appointment Set',
      'Booked Call',
      'Closed Won',
      'Closed Lost'
    )
  );

CREATE INDEX IF NOT EXISTS crm_calls_provider_idx
  ON public.crm_calls (call_provider, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_calls_twilio_status_idx
  ON public.crm_calls (twilio_status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS crm_calls_twilio_call_sid_idx
  ON public.crm_calls (twilio_call_sid)
  WHERE twilio_call_sid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_calls_twilio_agent_call_sid_idx
  ON public.crm_calls (twilio_agent_call_sid)
  WHERE twilio_agent_call_sid IS NOT NULL;

NOTIFY pgrst, 'reload schema';
