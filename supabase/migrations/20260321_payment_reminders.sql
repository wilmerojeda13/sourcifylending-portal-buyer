-- ─── Payment Reminders ──────────────────────────────────────────────────────
-- Tracks sent payment alerts to prevent duplicate notifications.
-- Each alert_key is unique per user + reminder type + time period.

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_type   TEXT        NOT NULL CHECK (reminder_type IN (
                                'balance_due', 'arrangement_due',
                                'renewal_upcoming', 'past_due'
                              )),
  -- Dedup key: e.g. "{user_id}_balance_due_2026-03" — one per type per period
  alert_key       TEXT        NOT NULL,
  amount_due      NUMERIC(12,2),
  due_date        DATE,
  details         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Timestamps for when we took each action
  email_sent_at   TIMESTAMPTZ,
  portal_shown_at TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_reminders_alert_key_idx
  ON public.payment_reminders(alert_key);

CREATE INDEX IF NOT EXISTS payment_reminders_user_id_idx
  ON public.payment_reminders(user_id);

CREATE INDEX IF NOT EXISTS payment_reminders_type_idx
  ON public.payment_reminders(reminder_type, email_sent_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_payment_reminders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_reminders_updated_at
  BEFORE UPDATE ON public.payment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_payment_reminders_updated_at();

-- RLS: clients can only read their own reminders; service role manages all
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own payment reminders"
  ON public.payment_reminders FOR SELECT
  USING (auth.uid() = user_id);

-- Admins / service role bypass RLS automatically
