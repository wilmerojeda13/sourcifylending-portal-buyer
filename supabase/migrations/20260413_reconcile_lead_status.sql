-- =============================================================
-- RECONCILE DIALER LEAD STATUS
-- Ensures every dispositioned lead has the correct status and
-- last_called_at timestamp so reporting and progress counters
-- are accurate. Fixes leads where the status or timestamp was
-- never written (e.g., API failures, pre-migration calls).
-- =============================================================

-- 1. Backfill last_called_at on campaign leads that have an
--    outcome recorded but a missing timestamp
UPDATE public.dialer_campaign_leads
SET    last_called_at = updated_at,
       updated_at     = NOW()
WHERE  last_call_outcome IS NOT NULL
  AND  last_called_at IS NULL
  AND  updated_at IS NOT NULL;

-- 2. Fix status for campaign leads whose outcome and status are
--    out of sync (outcome was saved but status was never updated)
UPDATE public.dialer_campaign_leads
SET    status = CASE last_call_outcome
                  WHEN 'no_answer'      THEN 'attempted'
                  WHEN 'voicemail'      THEN 'attempted'
                  WHEN 'contacted'      THEN 'contacted'
                  WHEN 'interested'     THEN 'interested'
                  WHEN 'callback'       THEN 'callback'
                  WHEN 'follow_up'      THEN 'follow_up'
                  WHEN 'qualified'      THEN 'qualified'
                  WHEN 'not_interested' THEN 'closed_lost'
                  WHEN 'disconnected'   THEN 'dnc'
                  WHEN 'dnc'            THEN 'dnc'
                  ELSE 'attempted'
                END,
       updated_at = NOW()
WHERE  last_call_outcome IS NOT NULL
  AND  status = 'new';  -- only fix leads incorrectly still marked 'new'

-- 3. Backfill last_call_at on raw leads
UPDATE public.dialer_raw_leads
SET    last_call_at = updated_at,
       updated_at   = NOW()
WHERE  last_call_outcome IS NOT NULL
  AND  last_call_at IS NULL
  AND  updated_at IS NOT NULL;

-- 4. Ensure any lead with a non-'new' campaign status also has
--    last_called_at populated (defensive backfill)
UPDATE public.dialer_campaign_leads
SET    last_called_at = updated_at
WHERE  status NOT IN ('new', 'promoted')
  AND  last_called_at IS NULL
  AND  updated_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
