-- Ensure updated_at column exists on funding_approvals.
-- The original migration defined it, but some environments may have
-- an older schema where it was missing. This is idempotent and safe to re-run.

ALTER TABLE public.funding_approvals
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Auto-update updated_at on row changes (idempotent via CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.set_funding_approvals_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funding_approvals_updated_at ON public.funding_approvals;
CREATE TRIGGER funding_approvals_updated_at
  BEFORE UPDATE ON public.funding_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_funding_approvals_updated_at();
