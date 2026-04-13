-- Track how many times each lead has been dialed

-- Per-campaign call count (incremented every disposition, any outcome)
ALTER TABLE public.dialer_campaign_leads
  ADD COLUMN IF NOT EXISTS call_count INTEGER NOT NULL DEFAULT 0;

-- Global call count across all campaigns on the raw lead record
ALTER TABLE public.dialer_raw_leads
  ADD COLUMN IF NOT EXISTS call_count INTEGER NOT NULL DEFAULT 0;

-- Atomic increment function — avoids JS read-then-write race conditions
CREATE OR REPLACE FUNCTION public.increment_call_counts(
  p_campaign_lead_id uuid,
  p_raw_lead_id      uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.dialer_campaign_leads
    SET call_count = call_count + 1
    WHERE id = p_campaign_lead_id;

  UPDATE public.dialer_raw_leads
    SET call_count = call_count + 1
    WHERE id = p_raw_lead_id;
$$;

-- Index helps analytics / ordering by call_count
CREATE INDEX IF NOT EXISTS dialer_campaign_leads_call_count_idx
  ON public.dialer_campaign_leads(campaign_id, call_count);

NOTIFY pgrst, 'reload schema';
