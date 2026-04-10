-- View: dialer_campaign_status_counts
-- Aggregates lead counts per (campaign, status) at the DB level.
-- This avoids fetching rows through PostgREST (which is capped at max-rows=1000)
-- and instead returns one lightweight summary row per campaign+status pair.
CREATE OR REPLACE VIEW dialer_campaign_status_counts
WITH (security_invoker = true)
AS
SELECT
  campaign_id,
  status,
  COUNT(*)::int AS count
FROM dialer_campaign_leads
GROUP BY campaign_id, status;
