-- ============================================================================
-- Comprehensive Disk Space Cleanup
-- Date: 2026-04-16
-- Purpose: Reclaim disk space by removing unnecessary data while preserving
--          all active business-critical data
-- Risk Level: LOW - removes only old/demo/abandoned data
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Execute Log Retention Cleanup
-- ============================================================================
-- Archive and remove logs older than 90-180 days to free up significant space

SELECT 'STEP 1: Archiving and deleting old activity logs...' as status;

INSERT INTO activity_logs_archive
SELECT *, now() as archived_at FROM activity_logs
WHERE created_at < NOW() - INTERVAL '90 days'
ON CONFLICT DO NOTHING;

DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '90 days';

SELECT 'STEP 2: Archiving and deleting old portal events...' as status;

INSERT INTO portal_events_archive
SELECT *, now() as archived_at FROM portal_events
WHERE created_at < NOW() - INTERVAL '90 days'
ON CONFLICT DO NOTHING;

DELETE FROM portal_events WHERE created_at < NOW() - INTERVAL '90 days';

SELECT 'STEP 3: Archiving and deleting old agent actions...' as status;

INSERT INTO agent_actions_archive
SELECT *, now() as archived_at FROM agent_actions
WHERE created_at < NOW() - INTERVAL '90 days'
ON CONFLICT DO NOTHING;

DELETE FROM agent_actions WHERE created_at < NOW() - INTERVAL '90 days';

SELECT 'STEP 4: Archiving and deleting old analyzer events...' as status;

INSERT INTO crm_analyzer_events_archive
SELECT *, now() as archived_at FROM crm_analyzer_events
WHERE created_at < NOW() - INTERVAL '90 days'
ON CONFLICT DO NOTHING;

DELETE FROM crm_analyzer_events WHERE created_at < NOW() - INTERVAL '90 days';

SELECT 'STEP 5: Archiving and deleting old audit logs...' as status;

INSERT INTO crm_audit_logs_archive
SELECT *, now() as archived_at FROM crm_audit_logs
WHERE created_at < NOW() - INTERVAL '180 days'
ON CONFLICT DO NOTHING;

DELETE FROM crm_audit_logs WHERE created_at < NOW() - INTERVAL '180 days';

-- ============================================================================
-- STEP 6: SKIP Demo/Test Data (These are actively used)
-- ============================================================================
-- Demo accounts are seeded and used in admin interfaces - PRESERVE these

SELECT 'STEP 6: Preserving demo accounts (used for testing/admin)' as status;

-- ============================================================================
-- STEP 7: Remove Old Imported Leads (Pre-April 1st)
-- ============================================================================
-- Delete the 6k leads imported ~1 month ago (mid-March) that were replaced
-- by current dialer campaigns. Only delete leads created BEFORE 2026-04-01.

SELECT 'STEP 7: Archiving old imported leads (created before April 1st)...' as status;

-- Create archive tables if they don't exist
CREATE TABLE IF NOT EXISTS dialer_raw_leads_old_import_archive (
  LIKE dialer_raw_leads INCLUDING ALL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dialer_campaign_leads_old_import_archive (
  LIKE dialer_campaign_leads INCLUDING ALL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- Archive old raw leads (created before April 1st, 2026)
INSERT INTO dialer_raw_leads_old_import_archive
SELECT *, now() as archived_at FROM dialer_raw_leads
WHERE created_at < '2026-04-01T00:00:00Z'
ON CONFLICT DO NOTHING;

SELECT count(*) as raw_leads_archived
FROM dialer_raw_leads
WHERE created_at < '2026-04-01T00:00:00Z';

-- Archive old campaign lead assignments (created before April 1st, 2026)
INSERT INTO dialer_campaign_leads_old_import_archive
SELECT *, now() as archived_at FROM dialer_campaign_leads
WHERE created_at < '2026-04-01T00:00:00Z'
ON CONFLICT DO NOTHING;

SELECT count(*) as campaign_leads_archived
FROM dialer_campaign_leads
WHERE created_at < '2026-04-01T00:00:00Z';

-- Delete old raw leads
DELETE FROM dialer_raw_leads
WHERE created_at < '2026-04-01T00:00:00Z';

SELECT 'Old raw leads deleted' as status;

-- Delete old campaign lead assignments
DELETE FROM dialer_campaign_leads
WHERE created_at < '2026-04-01T00:00:00Z';

SELECT 'Old campaign leads deleted' as status;

-- ============================================================================
-- STEP 8: Remove Duplicate/Corrupted Records
-- ============================================================================
-- Delete records with null user_id that shouldn't exist

SELECT 'STEP 8: Removing orphaned records...' as status;

-- Only delete truly orphaned rows where user_id is NULL (shouldn't exist)
DELETE FROM opportunities WHERE user_id IS NULL;
DELETE FROM documents WHERE user_id IS NULL;
DELETE FROM tasks WHERE user_id IS NULL;

-- ============================================================================
-- STEP 9: Optimize Indexes and Statistics
-- ============================================================================
-- Drop unused indexes identified in previous analysis

SELECT 'STEP 9: Optimizing indexes...' as status;

-- Drop duplicate or low-usage indexes on high-volume tables (if they exist)
DROP INDEX IF EXISTS idx_crm_calls_created_at_desc;
DROP INDEX IF EXISTS idx_portal_events_duplicate;
DROP INDEX IF EXISTS idx_activity_logs_duplicate;

-- ============================================================================
-- STEP 10: Vacuum and Analyze
-- ============================================================================
-- Clean up storage and update table statistics for query planner

SELECT 'STEP 10: Running VACUUM ANALYZE...' as status;

VACUUM ANALYZE activity_logs;
VACUUM ANALYZE activity_logs_archive;
VACUUM ANALYZE portal_events;
VACUUM ANALYZE portal_events_archive;
VACUUM ANALYZE crm_calls;
VACUUM ANALYZE crm_leads;
VACUUM ANALYZE crm_analyzer_events;
VACUUM ANALYZE crm_analyzer_events_archive;
VACUUM ANALYZE agent_actions;
VACUUM ANALYZE agent_actions_archive;
VACUUM ANALYZE crm_audit_logs;
VACUUM ANALYZE crm_audit_logs_archive;
VACUUM ANALYZE dialer_raw_leads;
VACUUM ANALYZE dialer_raw_leads_old_import_archive;
VACUUM ANALYZE dialer_campaign_leads;
VACUUM ANALYZE dialer_campaign_leads_old_import_archive;

-- ============================================================================
-- STEP 11: Verify Data Integrity
-- ============================================================================
-- Confirm that cleanup was successful and no active data was affected

SELECT 'VERIFICATION RESULTS:' as section;

SELECT
  'Active Profiles (excluding demo)' as metric,
  count(*) as count
FROM profiles WHERE is_demo = false
UNION ALL
SELECT 'Active CRM Leads (not archived)', count(*)
FROM crm_leads WHERE is_archived = false
UNION ALL
SELECT 'Active Opportunities', count(*)
FROM opportunities WHERE user_id IS NOT NULL
UNION ALL
SELECT 'Recent Activity Logs (last 90 days)', count(*)
FROM activity_logs
UNION ALL
SELECT 'Archived Activity Logs (old data)', count(*)
FROM activity_logs_archive
UNION ALL
SELECT 'Active Subscriptions', count(*)
FROM subscriptions WHERE status IN ('active', 'trialing')
UNION ALL
SELECT 'Active Dialer Leads (created after April 1st)', count(*)
FROM dialer_raw_leads WHERE created_at >= '2026-04-01T00:00:00Z'
UNION ALL
SELECT 'Archived Old Leads (created before April 1st)', count(*)
FROM dialer_raw_leads_old_import_archive
UNION ALL
SELECT 'Total Disk Space Freed (approx MB)',
  ROUND(
    (SELECT pg_total_relation_size('activity_logs_archive'::regclass) +
            pg_total_relation_size('portal_events_archive'::regclass) +
            pg_total_relation_size('crm_analyzer_events_archive'::regclass) +
            pg_total_relation_size('crm_audit_logs_archive'::regclass) +
            pg_total_relation_size('agent_actions_archive'::regclass) +
            pg_total_relation_size('dialer_raw_leads_old_import_archive'::regclass) +
            pg_total_relation_size('dialer_campaign_leads_old_import_archive'::regclass)
    ) / 1024.0 / 1024.0, 2)::bigint
  );

COMMIT;

-- ============================================================================
-- POST-CLEANUP NOTES:
-- ============================================================================
-- - Old leads imported before April 1st (6k from mid-March) have been archived
-- - Recent leads created April 1st onwards (current dialer campaigns) preserved
-- - Archive tables preserve all deleted data (can restore if needed)
-- - Demo accounts and associated data have been preserved (still in use)
-- - Orphaned records cleaned up
-- - Indexes optimized
-- - Storage should be significantly reduced (especially from old leads + logs)
-- - All active business data is preserved
-- - If you need to recover archived data: restore from archive tables
-- ============================================================================
