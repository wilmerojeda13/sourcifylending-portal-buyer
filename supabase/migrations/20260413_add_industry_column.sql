-- Add industry classification column to dialer_raw_leads
ALTER TABLE public.dialer_raw_leads
  ADD COLUMN IF NOT EXISTS industry text;

-- Index for industry-based filtering
CREATE INDEX IF NOT EXISTS dialer_raw_leads_industry_idx
  ON public.dialer_raw_leads(industry)
  WHERE industry IS NOT NULL AND is_archived = false;
