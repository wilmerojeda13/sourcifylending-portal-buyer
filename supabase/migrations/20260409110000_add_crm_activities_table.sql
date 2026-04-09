-- ============================================================================
-- CRM Activities Table Migration
-- ============================================================================
-- This migration creates the crm_activities table which is referenced
-- throughout the CRM for lead activity history.
--
-- Root cause: The disposition save was failing because crm_activities table
-- did not exist, causing appendCrmActivity() to throw and the entire
-- disposition save to fail.
-- ============================================================================

-- Create crm_activities table for lead activity history
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying activities by lead
CREATE INDEX IF NOT EXISTS crm_activities_lead_id_idx
  ON public.crm_activities (lead_id, created_at DESC);

-- Index for activity type filtering
CREATE INDEX IF NOT EXISTS crm_activities_type_idx
  ON public.crm_activities (type, created_at DESC);

-- Index for created_by filtering
CREATE INDEX IF NOT EXISTS crm_activities_created_by_idx
  ON public.crm_activities (created_by, created_at DESC);

-- Enable RLS
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

-- Create policy: admins can do all operations via service role (bypasses RLS)
DROP POLICY IF EXISTS "Admins manage crm_activities" ON public.crm_activities;
CREATE POLICY "Admins manage crm_activities"
  ON public.crm_activities FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verification query
SELECT 'crm_activities table created successfully' as status;
