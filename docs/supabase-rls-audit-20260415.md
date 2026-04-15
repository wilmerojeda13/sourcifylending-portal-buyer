# Supabase RLS Audit

Audit date: 2026-04-15

## Summary

- Public tables scanned from `supabase/migrations/*.sql`: 72
- Public tables with explicit RLS enabled before this fix: 55
- Public tables exposed with RLS disabled before this fix: 17
- Public tables fixed in this migration: 17
- Public intake tables among the exposed set: none found

## Exposed Tables

All exposed tables below are internal/admin-only operational tables. I found no browser-side direct reads/writes to these tables; the app uses server-side service-role clients for the relevant access paths.

| Table | Classification | Evidence |
| --- | --- | --- |
| `activity_logs_archive` | internal/admin-only | Archive table created by `20260409_001_log_retention_cleanup.sql`; no app references found |
| `call_logs` | internal/admin-only | Used by admin dialer analytics in `src/app/admin/dialer/analytics/analytics-data.ts` and `src/app/api/admin/dialer/analytics/route.ts` |
| `crm_analyzer_events` | internal/admin-only | Used by `src/lib/crm-analyzer-sessions.ts` and realtime admin panel `src/components/admin/crm/AnalyzerLivePanel.tsx` |
| `crm_analyzer_events_archive` | internal/admin-only | Archive table created by `20260409_001_log_retention_cleanup.sql`; no app references found |
| `crm_analyzer_sessions` | internal/admin-only | Used by `src/lib/crm-analyzer-sessions.ts` and realtime admin panel `src/components/admin/crm/AnalyzerLivePanel.tsx` |
| `crm_audit_logs_archive` | internal/admin-only | Archive table created by `20260409_001_log_retention_cleanup.sql`; no app references found |
| `dialer_campaign_leads_cleanup_backup` | internal/admin-only | Backup table created by `20260415_legacy_dialer_cleanup.sql`; no app references found |
| `dialer_promotion_log_cleanup_backup` | internal/admin-only | Backup table created by `20260415_legacy_dialer_cleanup.sql`; no app references found |
| `dialer_raw_leads_cleanup_backup` | internal/admin-only | Backup table created by `20260415_legacy_dialer_cleanup.sql`; no app references found |
| `email_campaign_recipients` | internal/admin-only | Used by server-side email campaign logic in `src/lib/email-campaign-drafts.ts`, `src/lib/email-campaign-sends.ts`, `src/lib/email-campaign-event-ingestion.ts` |
| `email_campaigns` | internal/admin-only | Used by admin email campaign route and server-side campaign logic |
| `email_events` | internal/admin-only | Used by server-side ingestion in `src/lib/email-campaign-event-ingestion.ts` |
| `email_send_settings` | internal/admin-only | Used by server-side campaign gating in `src/lib/campaign-send-gate.ts` |
| `email_suppressions` | internal/admin-only | Used by server-side campaign gating and event ingestion |
| `email_unsubscribes` | internal/admin-only | Used by server-side unsubscribe checks in `src/lib/campaign-send-gate.ts`; browser hits only the route, not the table |
| `portal_events_archive` | internal/admin-only | Archive table created by `20260409_001_log_retention_cleanup.sql`; no app references found |
| `voice_bookings` | internal/admin-only | Created for call-booking workflow, but no browser/app references found in the repo |

## Result

No public-facing RLS policies were added because none of the exposed tables are intended for direct browser access. The fix is RLS enablement only, with all access continuing through server-side service-role code.

