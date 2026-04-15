-- ============================================================================
-- Legacy Dialer Backlog Cleanup
-- Purpose:
--   Remove the old global dialer backlog while preserving:
--   - leads attached to the active live campaigns
--   - current visible CRM leads
--   - raw leads linked to those CRM leads
--   - the live dialer -> CRM promotion path
--
-- Notes:
--   This script is written as an auditable SQL artifact for the cleanup that
--   was executed through the service-role API. It is intentionally explicit and
--   transaction-safe.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Backup tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dialer_raw_leads_cleanup_backup (
  LIKE public.dialer_raw_leads INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS public.dialer_campaign_leads_cleanup_backup (
  LIKE public.dialer_campaign_leads INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS public.dialer_promotion_log_cleanup_backup (
  LIKE public.dialer_promotion_log INCLUDING ALL
);

-- ---------------------------------------------------------------------------
-- Preserve set
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE cleanup_active_campaigns AS
SELECT id
FROM public.dialer_campaigns
WHERE status = 'active';

CREATE TEMP TABLE cleanup_preserve_raw_ids AS
SELECT DISTINCT raw_lead_id
FROM (
  SELECT cl.raw_lead_id
  FROM public.dialer_campaign_leads cl
  INNER JOIN cleanup_active_campaigns ac ON ac.id = cl.campaign_id

  UNION

  SELECT rl.id AS raw_lead_id
  FROM public.dialer_raw_leads rl
  INNER JOIN public.crm_leads crm ON crm.id = rl.promoted_to_crm_lead_id
  WHERE crm.is_archived = false
) preserve_source
WHERE raw_lead_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Dry-run counts
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.dialer_raw_leads) AS total_raw_leads,
  (SELECT count(*) FROM public.dialer_campaign_leads) AS total_campaign_lead_rows,
  (SELECT count(*) FROM public.dialer_promotion_log) AS total_promotion_log_rows,
  (SELECT count(*) FROM public.crm_leads WHERE is_archived = false) AS visible_crm_leads,
  (SELECT count(*) FROM cleanup_preserve_raw_ids) AS preserved_raw_leads,
  (SELECT count(*) FROM public.dialer_raw_leads rl
    WHERE NOT EXISTS (
      SELECT 1 FROM cleanup_preserve_raw_ids p WHERE p.raw_lead_id = rl.id
    )
  ) AS legacy_raw_leads_to_delete,
  (SELECT count(*) FROM public.dialer_campaign_leads cl
    WHERE NOT EXISTS (
      SELECT 1 FROM cleanup_active_campaigns ac WHERE ac.id = cl.campaign_id
    )
  ) AS legacy_campaign_lead_rows_to_delete,
  (SELECT count(*) FROM public.dialer_promotion_log pl
    WHERE NOT EXISTS (
      SELECT 1 FROM cleanup_preserve_raw_ids p WHERE p.raw_lead_id = pl.raw_lead_id
    )
  ) AS legacy_promotion_log_rows_to_delete;

-- ---------------------------------------------------------------------------
-- Backup rows first
-- ---------------------------------------------------------------------------
INSERT INTO public.dialer_raw_leads_cleanup_backup
SELECT rl.*
FROM public.dialer_raw_leads rl
WHERE NOT EXISTS (
  SELECT 1 FROM cleanup_preserve_raw_ids p WHERE p.raw_lead_id = rl.id
);

INSERT INTO public.dialer_campaign_leads_cleanup_backup
SELECT cl.*
FROM public.dialer_campaign_leads cl
WHERE NOT EXISTS (
  SELECT 1 FROM cleanup_active_campaigns ac WHERE ac.id = cl.campaign_id
);

INSERT INTO public.dialer_promotion_log_cleanup_backup
SELECT pl.*
FROM public.dialer_promotion_log pl
WHERE NOT EXISTS (
  SELECT 1 FROM cleanup_preserve_raw_ids p WHERE p.raw_lead_id = pl.raw_lead_id
);

-- ---------------------------------------------------------------------------
-- Deletes
-- ---------------------------------------------------------------------------
DELETE FROM public.dialer_promotion_log pl
WHERE NOT EXISTS (
  SELECT 1 FROM cleanup_preserve_raw_ids p WHERE p.raw_lead_id = pl.raw_lead_id
);

DELETE FROM public.dialer_campaign_leads cl
WHERE NOT EXISTS (
  SELECT 1 FROM cleanup_active_campaigns ac WHERE ac.id = cl.campaign_id
);

DELETE FROM public.dialer_raw_leads rl
WHERE NOT EXISTS (
  SELECT 1 FROM cleanup_preserve_raw_ids p WHERE p.raw_lead_id = rl.id
);

-- ---------------------------------------------------------------------------
-- Post-delete verification
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.dialer_raw_leads) AS remaining_raw_leads,
  (SELECT count(*) FROM public.dialer_campaign_leads) AS remaining_campaign_lead_rows,
  (SELECT count(*) FROM public.dialer_promotion_log) AS remaining_promotion_log_rows,
  (SELECT count(*) FROM public.crm_leads WHERE is_archived = false) AS visible_crm_leads_after_cleanup;

COMMIT;
