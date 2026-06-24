-- Failed-payment recovery for Stripe subscriptions.
-- Adds a durable grace-period state and preserves payment failure details for admin review.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS failed_payment_reason text,
  ADD COLUMN IF NOT EXISTS failed_payment_code text,
  ADD COLUMN IF NOT EXISTS failed_payment_decline_code text,
  ADD COLUMN IF NOT EXISTS last_failed_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_payment_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failed_invoice_id text,
  ADD COLUMN IF NOT EXISTS last_failed_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS last_failed_charge_id text,
  ADD COLUMN IF NOT EXISTS payment_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_payment_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_billing_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_billing_status_check
  CHECK (billing_status IN ('active', 'inactive', 'canceled', 'past_due', 'past_due_locked', 'suspended', 'trialing'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'inactive', 'canceled', 'past_due', 'past_due_locked', 'suspended', 'trialing'));

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_status_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_status_check
  CHECK (status IN ('active', 'inactive', 'canceled', 'past_due', 'past_due_locked', 'suspended'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_recovery_status
  ON public.subscriptions (status, next_payment_attempt_at);

CREATE INDEX IF NOT EXISTS idx_subscriptions_last_failed_invoice_id
  ON public.subscriptions (last_failed_invoice_id)
  WHERE last_failed_invoice_id IS NOT NULL;
