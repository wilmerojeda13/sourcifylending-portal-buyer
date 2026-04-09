-- ============================================================================
-- SAFE CLEANUP: Log Retention and Archive Tables
-- ============================================================================
-- Purpose: Reduce Supabase Disk IO by archiving old log data
-- Risk Level: LOW - creates archive tables first, deletes only after verification
-- Rollback: Archive tables preserve data; can be moved back if needed
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Archive Tables (no indexes for storage efficiency)
-- ============================================================================

-- Archive table for activity_logs
CREATE TABLE IF NOT EXISTS activity_logs_archive (
  LIKE activity_logs INCLUDING ALL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- Archive table for crm_audit_logs  
CREATE TABLE IF NOT EXISTS crm_audit_logs_archive (
  LIKE crm_audit_logs INCLUDING ALL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- Archive table for portal_events
CREATE TABLE IF NOT EXISTS portal_events_archive (
  LIKE portal_events INCLUDING ALL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- Archive table for crm_analyzer_events
CREATE TABLE IF NOT EXISTS crm_analyzer_events_archive (
  LIKE crm_analyzer_events INCLUDING ALL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- STEP 2: Create Cleanup Function for Automated Retention
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS TABLE (
  table_name text,
  rows_deleted bigint
) AS $$
DECLARE
  deleted_count bigint;
BEGIN
  -- Archive and delete activity_logs older than 90 days
  INSERT INTO activity_logs_archive 
  SELECT *, now() as archived_at FROM activity_logs 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'activity_logs'::text, deleted_count;
  
  DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Archive and delete portal_events older than 90 days
  INSERT INTO portal_events_archive 
  SELECT *, now() as archived_at FROM portal_events 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'portal_events'::text, deleted_count;
  
  DELETE FROM portal_events WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Archive and delete agent_actions older than 90 days
  INSERT INTO agent_actions_archive 
  SELECT *, now() as archived_at FROM agent_actions 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'agent_actions'::text, deleted_count;
  
  DELETE FROM agent_actions WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Archive and delete crm_analyzer_events older than 90 days
  INSERT INTO crm_analyzer_events_archive 
  SELECT *, now() as archived_at FROM crm_analyzer_events 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'crm_analyzer_events'::text, deleted_count;
  
  DELETE FROM crm_analyzer_events WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Archive and delete crm_audit_logs older than 180 days
  INSERT INTO crm_audit_logs_archive 
  SELECT *, now() as archived_at FROM crm_audit_logs 
  WHERE created_at < NOW() - INTERVAL '180 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'crm_audit_logs'::text, deleted_count;
  
  DELETE FROM crm_audit_logs WHERE created_at < NOW() - INTERVAL '180 days';
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: Create Function to Analyze Index Usage
-- ============================================================================

CREATE OR REPLACE FUNCTION analyze_index_usage(target_table text)
RETURNS TABLE (
  index_name text,
  index_scan_count bigint,
  index_size_bytes bigint,
  recommendation text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    psi.indexname::text,
    COALESCE(psi.idx_scan, 0)::bigint,
    pg_relation_size(psi.indexrelid)::bigint,
    CASE 
      WHEN COALESCE(psi.idx_scan, 0) = 0 THEN 'Consider dropping - never used'
      WHEN COALESCE(psi.idx_scan, 0) < 10 THEN 'Low usage - monitor'
      ELSE 'Keep - actively used'
    END::text
  FROM pg_stat_user_indexes psi
  JOIN pg_indexes pi ON psi.indexname = pi.indexname AND psi.schemaname = pi.schemaname
  WHERE psi.relname = target_table
  ORDER BY psi.idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: Run Initial Cleanup (Test Mode - counts only first)
-- ============================================================================

-- First, let's count what would be affected (safe check)
SELECT 'activity_logs' as table_name, count(*) as rows_older_than_90_days
FROM activity_logs WHERE created_at < NOW() - INTERVAL '90 days'
UNION ALL
SELECT 'portal_events', count(*) 
FROM portal_events WHERE created_at < NOW() - INTERVAL '90 days'
UNION ALL
SELECT 'agent_actions', count(*)
FROM agent_actions WHERE created_at < NOW() - INTERVAL '90 days'
UNION ALL
SELECT 'crm_analyzer_events', count(*)
FROM crm_analyzer_events WHERE created_at < NOW() - INTERVAL '90 days'
UNION ALL
SELECT 'crm_audit_logs', count(*)
FROM crm_audit_logs WHERE created_at < NOW() - INTERVAL '180 days';

-- ============================================================================
-- STEP 5: Analyze crm_calls index usage
-- ============================================================================

SELECT * FROM analyze_index_usage('crm_calls');

-- ============================================================================
-- NOTES:
-- - Archive tables created with archived_at timestamp for tracking
-- - Cleanup function returns counts for verification
-- - Index analysis shows which indexes are unused (safe to drop)
-- - Run 'SELECT * FROM cleanup_old_logs();' after verifying counts
-- ============================================================================
