-- ============================================================
-- BACKFILL: Reconcile today's call data for accurate reporting
-- Date: April 13, 2026
-- 
-- Problem: Calls made today not reflecting in dashboard counts
-- Solution: Ensure all leads dialed today have proper status
-- ============================================================

-- Step 1: Find all leads that were called today (last_called_at on April 13, 2026)
-- and ensure their status reflects they were attempted
UPDATE public.dialer_campaign_leads
SET 
  status = CASE 
    WHEN status = 'new' THEN 'attempted'  -- If still 'new', mark as attempted
    ELSE status  -- Keep existing status if already set
  END,
  updated_at = NOW()
WHERE 
  last_called_at >= '2026-04-13 00:00:00'
  AND last_called_at < '2026-04-14 00:00:00'
  AND status = 'new';  -- Only fix leads that haven't been status-updated

-- Step 2: Verify the fix - count calls made today
-- This should now match the actual number of dispositions given today
SELECT 
  COUNT(*) as total_calls_today,
  COUNT(*) FILTER (WHERE status = 'new') as still_marked_new,
  COUNT(*) FILTER (WHERE status != 'new') as properly_statused
FROM public.dialer_campaign_leads
WHERE 
  last_called_at >= '2026-04-13 00:00:00'
  AND last_called_at < '2026-04-14 00:00:00';

NOTIFY pgrst, 'reload schema';
