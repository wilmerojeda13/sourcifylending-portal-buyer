-- ============================================================
-- Fix crm_calls call_outcome constraint to include all valid outcomes
-- This migration fixes the dialer disposition save failure for:
-- - Appointment Set
-- - Voicemail
-- - Left Voicemail  
-- - Busy
-- - Call Back
-- - Do Not Call
--
-- Root cause: The original migration (20260330_crm_sales_workspace.sql)
-- created an incomplete constraint that was missing several outcomes.
-- ============================================================

-- Drop the existing incomplete constraint
ALTER TABLE public.crm_calls
DROP CONSTRAINT IF EXISTS crm_calls_outcome_check;

-- Add the complete constraint with ALL valid call outcomes
ALTER TABLE public.crm_calls
ADD CONSTRAINT crm_calls_outcome_check
CHECK (call_outcome in (
    'No Answer',
    'Voicemail',
    'Left Voicemail',
    'Busy',
    'Bad Number',
    'Not Interested',
    'Do Not Call',
    'Call Back',
    'Call Back Later',
    'Follow Up',
    'Interested',
    'Appointment Set',
    'Booked Call',
    'Closed Won',
    'Closed Lost'
));

-- Also fix the backfill migration table if it exists (for environments that created it from backfill)
DO $$
BEGIN
    -- Check if the table exists and fix any orphaned records
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_calls') THEN
        -- Log the fix (this will appear in Supabase logs)
        RAISE NOTICE 'crm_calls_outcome_check constraint updated to include all valid outcomes';
    END IF;
END $$;
