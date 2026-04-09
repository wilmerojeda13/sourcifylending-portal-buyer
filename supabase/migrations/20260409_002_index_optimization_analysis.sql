-- ============================================================================
-- INDEX OPTIMIZATION ANALYSIS AND SAFE CLEANUP
-- ============================================================================
-- Purpose: Analyze index usage and identify candidates for removal
-- Risk Level: LOW - Analysis only; actual removal requires manual verification
-- Run this to identify unused indexes before dropping them
-- ============================================================================

-- Analyze index usage on high-churn tables
-- Run this after a few days of production traffic for accurate results

-- View current index statistics for crm_calls (high-churn table)
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as rows_read,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  CASE 
    WHEN idx_scan = 0 THEN '⚠️ CANDIDATE: Never used - safe to drop'
    WHEN idx_scan < 10 THEN '⚠️ CANDIDATE: Low usage - consider dropping'
    WHEN idx_scan < 100 THEN '⚡ Monitor: Moderate usage'
    ELSE '✅ Keep: Actively used'
  END as recommendation
FROM pg_stat_user_indexes
WHERE tablename IN ('crm_calls', 'crm_tasks', 'crm_leads', 'crm_dialer_sessions', 
                    'activity_logs', 'portal_events', 'crm_analyzer_events')
ORDER BY tablename, idx_scan ASC;

-- Show table bloat estimates (dead tuples)
SELECT 
  schemaname,
  tablename,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  ROUND(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 2) as dead_row_pct,
  last_vacuum,
  last_autovacuum,
  CASE 
    WHEN n_dead_tup > 10000 AND ROUND(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 2) > 20 
    THEN '🔴 HIGH BLOAT: Run VACUUM ANALYZE'
    WHEN n_dead_tup > 1000 
    THEN '🟡 MODERATE: Monitor autovacuum'
    ELSE '🟢 Healthy'
  END as bloat_status
FROM pg_stat_user_tables
WHERE tablename IN ('crm_calls', 'crm_tasks', 'crm_leads', 'crm_dialer_sessions',
                    'crm_dialer_attempts', 'activity_logs', 'portal_events',
                    'crm_analyzer_events', 'crm_audit_logs', 'voice_calls')
ORDER BY n_dead_tup DESC;

-- Safe index removal candidates (based on expected patterns)
-- These indexes are often unused and safe to remove after verification:

-- Note: Run the query above first to verify actual usage before dropping

-- Potential candidates for removal on crm_calls:
-- 1. crm_calls_twilio_status_idx - High churn, rarely queried by status alone
-- 2. crm_calls_outcome_idx - Check if actually used for filtering

-- Potential candidates for removal on crm_tasks:
-- 1. crm_tasks_priority_idx - Check if priority filtering is used

-- DO NOT DROP (Critical indexes):
-- - Primary key indexes (implicitly created)
-- - Foreign key indexes (crm_calls_lead_idx, crm_tasks_lead_idx, etc.)
-- - Unique constraint indexes
-- - Indexes actively used (high idx_scan count)

-- ============================================================================
-- SAFE INDEX REMOVAL (only after verifying usage above)
-- Uncomment and run individual DROP statements after confirming idx_scan = 0
-- ============================================================================

-- Example safe drops (ONLY if verified unused):
-- DROP INDEX IF EXISTS crm_calls_twilio_status_idx;  -- Only if idx_scan = 0
-- DROP INDEX IF EXISTS crm_calls_outcome_idx;         -- Only if idx_scan = 0

-- ============================================================================
-- AUTOMATIC MAINTENANCE RECOMMENDATIONS
-- ============================================================================

-- Force vacuum on high-churn tables to reclaim dead tuple space
-- Run during low-traffic periods

-- VACUUM ANALYZE crm_calls;
-- VACUUM ANALYZE crm_dialer_attempts;
-- VACUUM ANALYZE crm_dialer_sessions;
-- VACUUM ANALYZE activity_logs;
-- VACUUM ANALYZE portal_events;

-- ============================================================================
-- MONITORING QUERY: Track table growth over time
-- ============================================================================

-- Create a simple table growth snapshot function
CREATE OR REPLACE FUNCTION log_table_sizes()
RETURNS TABLE (
  table_name text,
  row_count bigint,
  table_size text,
  index_size text,
  dead_tuples bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.tablename::text,
    t.n_live_tup::bigint,
    pg_size_pretty(pg_total_relation_size(t.schemaname || '.' || t.tablename))::text,
    pg_size_pretty(pg_indexes_size(t.schemaname || '.' || t.tablename))::text,
    t.n_dead_tup::bigint
  FROM pg_stat_user_tables t
  WHERE t.tablename LIKE 'crm_%' 
     OR t.tablename LIKE 'voice_%'
     OR t.tablename IN ('activity_logs', 'portal_events', 'agent_actions')
  ORDER BY pg_total_relation_size(t.schemaname || '.' || t.tablename) DESC;
END;
$$ LANGUAGE plpgsql;

-- Run this to capture current state before/after cleanup:
-- SELECT * FROM log_table_sizes();
