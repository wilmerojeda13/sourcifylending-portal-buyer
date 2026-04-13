-- =============================================================
-- SCRUB STALE CAMPAIGN LEADS
-- A lead with status='new' but last_called_at IS NOT NULL is a
-- data inconsistency — it has been dialed but was never moved
-- out of the fresh queue. This migration fixes all existing cases
-- and moves called-but-stale leads to 'attempted' status so they
-- are permanently excluded from the fresh dialable queue.
-- =============================================================

-- Fix inconsistent status: called but still marked 'new'
UPDATE public.dialer_campaign_leads
SET    status     = 'attempted',
       updated_at = NOW()
WHERE  status = 'new'
  AND  (last_called_at IS NOT NULL OR last_call_outcome IS NOT NULL);

-- Also ensure 'contacted', 'interested' leads that were called
-- don't appear in a fresh-only query (they already have correct statuses,
-- but ensure last_called_at is populated so the IS NULL filter works)
-- Note: these are already excluded by status, no update needed.

NOTIFY pgrst, 'reload schema';
