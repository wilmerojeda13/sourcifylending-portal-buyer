# Supabase Cleanup Verification Checklist

Run these checks after applying the changes to verify impact.

---

## ✅ Phase 3 Changes Applied

### Code Changes (Already Active):
- [x] TestCallWidget polling: 2s → 5s
- [x] syncDialerSessionState debouncing added

### Migrations (Apply with `supabase db push`):
- [ ] 20260409_001_log_retention_cleanup.sql
- [ ] 20260409_002_index_optimization_analysis.sql

---

## 🔍 VERIFICATION STEPS

### Step 1: Verify Migration Applied
```sql
-- Check migration is in the database
SELECT * FROM supabase_migrations.schema_migrations 
WHERE version LIKE '20260409%';
```

### Step 2: Check Archive Tables Exist
```sql
-- Verify archive tables created
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE '%_archive';

-- Expected: activity_logs_archive, crm_audit_logs_archive, 
--           portal_events_archive, crm_analyzer_events_archive
```

### Step 3: Run Initial Count Check
```sql
-- See current log table sizes before cleanup
SELECT 'activity_logs' as table_name, 
       count(*) as total_rows,
       count(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days') as rows_older_than_90d,
       pg_size_pretty(pg_total_relation_size('activity_logs')) as size
UNION ALL
SELECT 'portal_events', count(*),
       count(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days'),
       pg_size_pretty(pg_total_relation_size('portal_events'))
UNION ALL
SELECT 'crm_analyzer_events', count(*),
       count(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days'),
       pg_size_pretty(pg_total_relation_size('crm_analyzer_events'))
UNION ALL
SELECT 'crm_audit_logs', count(*),
       count(*) FILTER (WHERE created_at < NOW() - INTERVAL '180 days'),
       pg_size_pretty(pg_total_relation_size('crm_audit_logs'));
```

### Step 4: Test Cleanup Function (Preview Mode)
```sql
-- Check what would be deleted (returns counts only)
SELECT * FROM cleanup_old_logs();
```

**Before running actual cleanup, verify:**
- Archive tables exist and are empty
- Counts look reasonable
- You're in a low-traffic period (optional)

### Step 5: Run Actual Cleanup
```sql
-- Execute the cleanup (irreversible, but data is archived)
SELECT * FROM cleanup_old_logs();
```

### Step 6: Verify Cleanup Results
```sql
-- Check counts after cleanup
SELECT 'activity_logs' as table_name, count(*) as remaining_rows
UNION ALL
SELECT 'activity_logs_archive', count(*) 
UNION ALL
SELECT 'portal_events', count(*)
UNION ALL
SELECT 'portal_events_archive', count(*)
UNION ALL
SELECT 'crm_audit_logs', count(*)
UNION ALL
SELECT 'crm_audit_logs_archive', count(*);

-- Check space reclaimed
SELECT pg_size_pretty(pg_total_relation_size('activity_logs')) as current_size;
```

### Step 7: Check Index Usage
```sql
-- Identify unused indexes on high-churn tables
SELECT * FROM analyze_index_usage('crm_calls');
SELECT * FROM analyze_index_usage('crm_tasks');
SELECT * FROM analyze_index_usage('crm_leads');
```

**Safe to DROP only if `times_used` = 0 and you've verified no queries need it.**

### Step 8: Run VACUUM (Optional but Recommended)
```sql
-- Reclaim dead tuple space (run during low traffic)
-- Note: This may take time on large tables
VACUUM ANALYZE crm_calls;
VACUUM ANALYZE crm_dialer_attempts;
VACUUM ANALYZE activity_logs;
```

---

## 📊 BEFORE / AFTER COMPARISON

### Capture "Before" State (Run before cleanup):
```sql
SELECT * FROM log_table_sizes();
```

Save the output for comparison.

### Capture "After" State (Run after cleanup + VACUUM):
```sql
SELECT * FROM log_table_sizes();
```

### Expected Improvements:
- Log tables: 50-70% size reduction (depending on age of data)
- Dead tuples: Reduced significantly after VACUUM
- Index bloat: Reduced after dropping unused indexes

---

## 🚀 MONITORING AFTER DEPLOYMENT

### Weekly Check:
```sql
-- Monitor table growth
SELECT * FROM log_table_sizes();

-- Check if new dead tuples accumulating
SELECT tablename, n_dead_tup, last_autovacuum 
FROM pg_stat_user_tables 
WHERE tablename LIKE 'crm_%'
ORDER BY n_dead_tup DESC;
```

### Monthly Maintenance:
```sql
-- Run retention cleanup (schedule this as a cron job)
SELECT * FROM cleanup_old_logs();

-- Check archive table sizes
SELECT 'Archive totals' as category,
       (SELECT count(*) FROM activity_logs_archive) +
       (SELECT count(*) FROM portal_events_archive) +
       (SELECT count(*) FROM crm_audit_logs_archive) as total_archived_rows;
```

---

## ⚠️ ROLLBACK PROCEDURES

### If you need to restore archived data:
```sql
-- Move data back from archive (example: activity_logs)
INSERT INTO activity_logs 
SELECT id, user_id, event_type, event_data, ip_address, user_agent, created_at
FROM activity_logs_archive 
WHERE archived_at > NOW() - INTERVAL '1 day';  -- Recent archive only

-- Delete from archive after restore
DELETE FROM activity_logs_archive 
WHERE id IN (SELECT id FROM activity_logs WHERE created_at > NOW() - INTERVAL '1 day');
```

### If you need to recreate a dropped index:
```sql
-- Example: Recreate crm_calls_twilio_status_idx if needed
CREATE INDEX crm_calls_twilio_status_idx 
ON public.crm_calls (twilio_status, created_at DESC);
```

---

## ✅ FINAL CHECKLIST

- [ ] Migrations applied successfully
- [ ] Archive tables created and verified
- [ ] Initial counts captured (before state)
- [ ] Cleanup function tested (preview mode)
- [ ] Actual cleanup executed
- [ ] After counts captured
- [ ] Space reclaimed verified
- [ ] Index usage analyzed
- [ ] Unused indexes dropped (if any)
- [ ] VACUUM run on high-churn tables
- [ ] Monitoring queries scheduled

---

## 📈 SUCCESS METRICS

### Target Outcomes:
- [ ] 20-40% reduction in Disk IO
- [ ] 15-30% reduction in storage usage
- [ ] Faster queries on high-churn tables
- [ ] Reduced dead tuple bloat

### Verification:
Compare Supabase dashboard metrics before and after:
- Database size
- Disk IO operations
- Query performance

---

**Verification Complete:** Ready for production deployment
