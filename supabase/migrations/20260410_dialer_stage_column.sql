-- Add raw dialer stage model to dialer_raw_leads
-- Stages: new, contacted, interested, callback, follow_up, qualified, promoted, dnc, closed_lost

ALTER TABLE public.dialer_raw_leads
  ADD COLUMN IF NOT EXISTS stage           text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS last_call_outcome text,
  ADD COLUMN IF NOT EXISTS last_call_at    timestamptz,
  ADD COLUMN IF NOT EXISTS callback_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_at    timestamptz;

-- Constraint on valid stages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dialer_raw_leads_stage_check'
    AND table_name = 'dialer_raw_leads'
  ) THEN
    ALTER TABLE public.dialer_raw_leads
      ADD CONSTRAINT dialer_raw_leads_stage_check
      CHECK (stage IN ('new','contacted','interested','callback','follow_up','qualified','promoted','dnc','closed_lost'));
  END IF;
END $$;

-- Index for stage filtering
CREATE INDEX IF NOT EXISTS dialer_raw_leads_stage_idx
  ON public.dialer_raw_leads(stage)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS dialer_raw_leads_callback_idx
  ON public.dialer_raw_leads(callback_due_at)
  WHERE callback_due_at IS NOT NULL AND is_archived = false;

-- Backfill: already-promoted leads → promoted stage
UPDATE public.dialer_raw_leads
  SET stage = 'promoted'
  WHERE promoted_to_crm_lead_id IS NOT NULL AND stage = 'new';

-- Backfill: DNC leads → dnc stage
UPDATE public.dialer_raw_leads
  SET stage = 'dnc'
  WHERE do_not_call = true AND stage = 'new';

-- Backfill: archived leads → closed_lost stage  
UPDATE public.dialer_raw_leads
  SET stage = 'closed_lost'
  WHERE is_archived = true AND stage = 'new';
