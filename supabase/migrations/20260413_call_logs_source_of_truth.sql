-- Source of truth for dialer analytics.
-- Every dial should emit exactly one row here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  raw_lead_id uuid NULL,
  campaign_lead_id uuid NULL,
  campaign_id uuid NULL,
  rep_user_id uuid NULL,
  source_system text NOT NULL DEFAULT 'dialer',
  "timestamp" timestamptz NOT NULL DEFAULT timezone('America/New_York', now()),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  disposition text NOT NULL,
  lead_source text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('America/New_York', now())
);

CREATE INDEX IF NOT EXISTS call_logs_timestamp_idx
  ON public.call_logs ("timestamp" DESC);

CREATE INDEX IF NOT EXISTS call_logs_source_system_timestamp_idx
  ON public.call_logs (source_system, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS call_logs_campaign_id_timestamp_idx
  ON public.call_logs (campaign_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS call_logs_rep_user_id_timestamp_idx
  ON public.call_logs (rep_user_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS call_logs_lead_id_timestamp_idx
  ON public.call_logs (lead_id, "timestamp" DESC);

CREATE OR REPLACE FUNCTION public.call_logs_tz_keepalive()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('TimeZone', 'America/New_York', true);
END;
$$;

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/New_York');
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Unable to set database timezone to America/New_York: %', SQLERRM;
END $$;

-- Backfill all dialer calls that haven't been recorded yet (regardless of final status).
-- Backfill one row per lead per campaign with their last call data.
-- This ensures call_logs becomes the source of truth for dialer analytics.
INSERT INTO public.call_logs (
  id,
  lead_id,
  raw_lead_id,
  campaign_lead_id,
  campaign_id,
  source_system,
  "timestamp",
  duration_seconds,
  disposition,
  lead_source,
  created_at
)
SELECT
  ('x' || substr(md5(
    coalesce(lead.id::text, '') || ':' ||
    coalesce(lead.raw_lead_id::text, '') || ':' ||
    coalesce(lead.last_called_at::text, '') || ':' ||
    coalesce(lead.last_call_outcome, lead.status, 'attempted')
  ), 1, 32))::uuid AS id,
  coalesce(lead.raw_lead_id, lead.id) AS lead_id,
  lead.raw_lead_id,
  lead.id AS campaign_lead_id,
  lead.campaign_id,
  'dialer' AS source_system,
  lead.last_called_at AS "timestamp",
  0 AS duration_seconds,
  CASE lower(coalesce(lead.last_call_outcome, lead.status, 'attempted'))
    WHEN 'do not call' THEN 'dnc'
    WHEN 'dnc / remove' THEN 'dnc'
    WHEN 'left voicemail' THEN 'voicemail'
    WHEN 'call back' THEN 'callback'
    WHEN 'call back later' THEN 'callback'
    WHEN 'appointment set' THEN 'appointment_set'
    WHEN 'booked call' THEN 'booked_call'
    WHEN 'not interested' THEN 'not_interested'
    WHEN 'bad number' THEN 'bad_number'
    ELSE replace(lower(coalesce(lead.last_call_outcome, lead.status, 'attempted')), ' ', '_')
  END AS disposition,
  raw_leads.source AS lead_source,
  coalesce(lead.last_called_at, timezone('America/New_York', now())) AS created_at
FROM public.dialer_campaign_leads lead
LEFT JOIN public.dialer_raw_leads raw_leads
  ON raw_leads.id = lead.raw_lead_id
WHERE lead.last_called_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.call_logs existing
    WHERE existing.source_system = 'dialer'
      AND existing.campaign_lead_id = lead.id
      AND existing."timestamp" = lead.last_called_at
  )
ON CONFLICT (id) DO NOTHING;

-- Backfill persisted CRM call rows for raw-lead and CRM dispositions.
INSERT INTO public.call_logs (
  id,
  lead_id,
  raw_lead_id,
  source_system,
  "timestamp",
  duration_seconds,
  disposition,
  lead_source,
  created_at
)
SELECT
  call.id,
  coalesce(call.metadata->>'raw_lead_id', call.lead_id::text)::uuid AS lead_id,
  (call.metadata->>'raw_lead_id')::uuid,
  'crm' AS source_system,
  coalesce(call.call_ended_at, call.call_started_at, call.created_at, timezone('America/New_York', now())) AS "timestamp",
  GREATEST(
    0,
    coalesce(call.duration_seconds, 0)
  ) AS duration_seconds,
  CASE lower(coalesce(call.call_outcome, call.call_status, 'attempted'))
    WHEN 'do not call' THEN 'dnc'
    WHEN 'dnc / remove' THEN 'dnc'
    WHEN 'left voicemail' THEN 'voicemail'
    WHEN 'call back' THEN 'callback'
    WHEN 'call back later' THEN 'callback'
    WHEN 'appointment set' THEN 'appointment_set'
    WHEN 'booked call' THEN 'booked_call'
    WHEN 'not interested' THEN 'not_interested'
    WHEN 'bad number' THEN 'bad_number'
    WHEN 'closed won' THEN 'closed_won'
    WHEN 'closed lost' THEN 'closed_lost'
    ELSE replace(lower(coalesce(call.call_outcome, call.call_status, 'attempted')), ' ', '_')
  END AS disposition,
  NULL::text AS lead_source,
  coalesce(call.created_at, timezone('America/New_York', now())) AS created_at
FROM public.crm_calls call
WHERE coalesce(call.call_outcome, call.call_status) IS NOT NULL
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
