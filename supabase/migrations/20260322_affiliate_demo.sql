-- Add is_demo flag to affiliates
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS affiliates_is_demo_idx ON public.affiliates(is_demo);
