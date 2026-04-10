-- ============================================================
-- Dialer Campaign Model
-- ============================================================

-- 1. Add timezone/callability intelligence columns to raw leads
ALTER TABLE public.dialer_raw_leads
  ADD COLUMN IF NOT EXISTS likely_timezone        text,
  ADD COLUMN IF NOT EXISTS timezone_confidence    text CHECK (timezone_confidence IN ('high','medium','low','unknown')),
  ADD COLUMN IF NOT EXISTS timezone_source        text,
  ADD COLUMN IF NOT EXISTS call_window_status     text CHECK (call_window_status IN ('callable_now','blocked_by_timezone','unknown_timezone')),
  ADD COLUMN IF NOT EXISTS blocked_until_label    text;

-- 2. Campaign master table
CREATE TABLE IF NOT EXISTS public.dialer_campaigns (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','paused','completed','archived')),
  lead_count  int         NOT NULL DEFAULT 0,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dialer_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage dialer_campaigns" ON public.dialer_campaigns;
CREATE POLICY "Admins manage dialer_campaigns"
  ON public.dialer_campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 3. Campaign <-> raw lead join with per-campaign workflow status
CREATE TABLE IF NOT EXISTS public.dialer_campaign_leads (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       uuid        NOT NULL REFERENCES public.dialer_campaigns(id)  ON DELETE CASCADE,
  raw_lead_id       uuid        NOT NULL REFERENCES public.dialer_raw_leads(id)  ON DELETE CASCADE,
  status            text        NOT NULL DEFAULT 'new'
                                CHECK (status IN (
                                  'new','attempted','contacted','interested',
                                  'callback','follow_up','qualified',
                                  'promoted','dnc','closed_lost'
                                )),
  last_call_outcome text,
  last_called_at    timestamptz,
  callback_due_at   timestamptz,
  follow_up_at      timestamptz,
  notes             text,
  sort_order        int         NOT NULL DEFAULT 0,
  added_at          timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, raw_lead_id)
);

ALTER TABLE public.dialer_campaign_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage dialer_campaign_leads" ON public.dialer_campaign_leads;
CREATE POLICY "Admins manage dialer_campaign_leads"
  ON public.dialer_campaign_leads FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 4. Indexes
CREATE INDEX IF NOT EXISTS dialer_campaigns_status_idx
  ON public.dialer_campaigns(status);

CREATE INDEX IF NOT EXISTS dialer_campaign_leads_campaign_idx
  ON public.dialer_campaign_leads(campaign_id);

CREATE INDEX IF NOT EXISTS dialer_campaign_leads_status_idx
  ON public.dialer_campaign_leads(campaign_id, status);

CREATE INDEX IF NOT EXISTS dialer_campaign_leads_callback_idx
  ON public.dialer_campaign_leads(callback_due_at)
  WHERE callback_due_at IS NOT NULL;

-- 5. Function: keep dialer_campaigns.lead_count in sync
CREATE OR REPLACE FUNCTION sync_campaign_lead_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.dialer_campaigns
      SET lead_count = lead_count + 1, updated_at = now()
      WHERE id = NEW.campaign_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.dialer_campaigns
      SET lead_count = GREATEST(lead_count - 1, 0), updated_at = now()
      WHERE id = OLD.campaign_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_campaign_lead_count ON public.dialer_campaign_leads;
CREATE TRIGGER trg_sync_campaign_lead_count
  AFTER INSERT OR DELETE ON public.dialer_campaign_leads
  FOR EACH ROW EXECUTE FUNCTION sync_campaign_lead_count();

NOTIFY pgrst, 'reload schema';
