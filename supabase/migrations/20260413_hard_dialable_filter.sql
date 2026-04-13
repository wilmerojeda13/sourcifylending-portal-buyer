-- ============================================================
-- HARD DIALABLE FILTER: Database-level enforcement
-- Ensures the dialer NEVER returns leads that have been called
-- or have status other than 'new'. This is a defensive fix
-- to prevent rehashing at the database level.
-- ============================================================

-- Add index for fast lookup of truly dialable leads
CREATE INDEX IF NOT EXISTS dialer_campaign_leads_dialable_idx
  ON public.dialer_campaign_leads(campaign_id, status, last_called_at)
  WHERE status = 'new' AND last_called_at IS NULL;

-- Ensure DNC leads are globally excluded via a security view
-- This view is used by the API as an additional safety layer
CREATE OR REPLACE VIEW public.v_dialable_campaign_leads AS
SELECT 
  cl.*,
  rl.do_not_call,
  rl.is_archived,
  rl.phone,
  rl.phone_e164
FROM public.dialer_campaign_leads cl
INNER JOIN public.dialer_raw_leads rl ON rl.id = cl.raw_lead_id
WHERE cl.status = 'new'
  AND cl.last_called_at IS NULL
  AND rl.do_not_call = false
  AND rl.is_archived = false;

-- Add comment explaining the strict filter
COMMENT ON VIEW public.v_dialable_campaign_leads IS 
'Strictly dialable leads only: status=new, last_called_at IS NULL, not DNC, not archived';

NOTIFY pgrst, 'reload schema';
