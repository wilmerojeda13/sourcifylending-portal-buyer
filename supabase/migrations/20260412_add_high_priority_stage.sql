-- Add 'high_priority' stage to dialer_raw_leads for automated agent workflow
-- This allows the lead processor to flag professional email domains

-- Drop existing constraint and recreate with high_priority
ALTER TABLE public.dialer_raw_leads
  DROP CONSTRAINT IF EXISTS dialer_raw_leads_stage_check;

-- Add updated constraint including high_priority
ALTER TABLE public.dialer_raw_leads
  ADD CONSTRAINT dialer_raw_leads_stage_check
  CHECK (stage IN ('new','contacted','interested','callback','follow_up','qualified','promoted','dnc','closed_lost','high_priority'));

-- Update index to include high_priority for performance
DROP INDEX IF EXISTS dialer_raw_leads_stage_idx;
CREATE INDEX dialer_raw_leads_stage_idx
  ON public.dialer_raw_leads(stage)
  WHERE is_archived = false;

-- Add specific index for high_priority leads (frequently queried by agent)
CREATE INDEX IF NOT EXISTS dialer_raw_leads_high_priority_idx
  ON public.dialer_raw_leads(stage, created_at)
  WHERE stage = 'high_priority' AND is_archived = false;
