-- RLS hardening for all public tables that were still exposed without RLS.
-- These tables are operational/admin data only; the app accesses them via
-- server-side service-role clients, so enabling RLS without public policies
-- closes browser access without breaking trusted server flows.

ALTER TABLE IF EXISTS public.activity_logs_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crm_analyzer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crm_analyzer_events_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crm_analyzer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crm_audit_logs_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dialer_campaign_leads_cleanup_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dialer_promotion_log_cleanup_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dialer_raw_leads_cleanup_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_send_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.portal_events_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.voice_bookings ENABLE ROW LEVEL SECURITY;

