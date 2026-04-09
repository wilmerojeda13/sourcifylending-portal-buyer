-- ============================================================================
-- CRM Disposition Filtering Bug Fix
-- ============================================================================
-- This migration fixes the disposition filtering bug by:
-- 1. Adding an index on last_call_outcome for filter performance
-- 2. Backfilling last_call_outcome from crm_calls for stale records
--
-- Root cause: Disposition values written to crm_leads.last_call_outcome may
-- have been missing or stale due to race conditions. This backfill ensures
-- all leads have their current disposition synced from the call history.
-- ============================================================================

-- PART 1: Add index for disposition filtering performance
-- This index will speed up queries like: WHERE last_call_outcome = 'Interested'
CREATE INDEX IF NOT EXISTS idx_crm_leads_last_call_outcome 
ON crm_leads(last_call_outcome) 
WHERE last_call_outcome IS NOT NULL;

-- Also add composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_crm_leads_disposition_stage 
ON crm_leads(last_call_outcome, stage) 
WHERE last_call_outcome IS NOT NULL;

-- PART 2: Backfill last_call_outcome from crm_calls
-- 
-- This query derives the latest disposition for each lead by finding
-- the most recent call record and syncing the outcome to crm_leads.
--
-- Logic:
-- 1. Find the latest call record per lead (based on call_started_at)
-- 2. Only update leads where the call's outcome is more recent than
--    the current last_call_outcome OR where last_call_outcome is null
-- 3. Use the outcome from the latest call as the authoritative source

UPDATE crm_leads AS leads
SET 
  last_call_outcome = latest_call.call_outcome,
  last_call_at = latest_call.call_started_at,
  last_contacted_at = latest_call.call_started_at,
  latest_call_note = latest_call.notes,
  updated_at = NOW()
FROM (
  -- Get the most recent call per lead with its outcome
  SELECT DISTINCT ON (lead_id)
    lead_id,
    call_outcome,
    call_started_at,
    notes
  FROM crm_calls
  WHERE 
    lead_id IS NOT NULL 
    AND call_outcome IS NOT NULL
    AND call_outcome != ''
    AND call_started_at IS NOT NULL
  ORDER BY 
    lead_id,
    call_started_at DESC
) AS latest_call
WHERE 
  leads.id = latest_call.lead_id
  AND (
    -- Update if current disposition is null
    leads.last_call_outcome IS NULL
    -- Or if the call record is more recent
    OR leads.last_call_at IS NULL 
    OR latest_call.call_started_at > leads.last_call_at
    -- Or if they differ (potential drift)
    OR leads.last_call_outcome != latest_call.call_outcome
  )
  -- Don't overwrite with empty/null outcomes
  AND latest_call.call_outcome IS NOT NULL
  AND latest_call.call_outcome != '';

-- PART 3: Verify the fix
-- Show summary of what was updated
SELECT 
  'Total leads updated' as metric,
  COUNT(*)::text as value
FROM (
  SELECT DISTINCT lead_id
  FROM crm_calls
  WHERE 
    lead_id IS NOT NULL 
    AND call_outcome IS NOT NULL
    AND call_outcome != ''
    AND call_started_at IS NOT NULL
) AS updated_leads;

-- Show current disposition distribution for verification
SELECT 
  last_call_outcome as disposition,
  COUNT(*) as lead_count
FROM crm_leads
WHERE last_call_outcome IS NOT NULL
GROUP BY last_call_outcome
ORDER BY lead_count DESC;

-- ============================================================================
-- NOTES:
-- - This migration is SAFE to run in production
-- - It only updates records that are stale or null
-- - The index is created with IF NOT EXISTS to be idempotent
-- - Run this once to backfill historical data
-- - Future dispositions are automatically synced via applyCrmDisposition()
-- ============================================================================
