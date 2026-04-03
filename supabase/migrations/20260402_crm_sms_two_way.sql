ALTER TABLE public.crm_lead_sms
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS unread boolean,
  ADD COLUMN IF NOT EXISTS parent_sms_id uuid REFERENCES public.crm_lead_sms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

UPDATE public.crm_lead_sms
SET direction = 'outbound'
WHERE direction IS NULL;

UPDATE public.crm_lead_sms
SET unread = false
WHERE unread IS NULL;

ALTER TABLE public.crm_lead_sms
  ALTER COLUMN direction SET DEFAULT 'outbound',
  ALTER COLUMN unread SET DEFAULT false;

ALTER TABLE public.crm_lead_sms
  DROP CONSTRAINT IF EXISTS crm_lead_sms_direction_check;

ALTER TABLE public.crm_lead_sms
  ADD CONSTRAINT crm_lead_sms_direction_check
  CHECK (direction IN ('outbound', 'inbound'));

ALTER TABLE public.crm_lead_sms
  ALTER COLUMN direction SET NOT NULL,
  ALTER COLUMN unread SET NOT NULL;

CREATE INDEX IF NOT EXISTS crm_lead_sms_lead_unread_idx
  ON public.crm_lead_sms (lead_id, unread, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_sms_direction_idx
  ON public.crm_lead_sms (direction, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_sms_parent_idx
  ON public.crm_lead_sms (parent_sms_id);

NOTIFY pgrst, 'reload schema';
