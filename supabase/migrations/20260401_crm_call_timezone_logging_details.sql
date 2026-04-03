ALTER TABLE public.crm_call_compliance_logs
  ADD COLUMN IF NOT EXISTS original_phone text,
  ADD COLUMN IF NOT EXISTS normalized_phone text,
  ADD COLUMN IF NOT EXISTS parse_result text,
  ADD COLUMN IF NOT EXISTS libphonenumber_result jsonb,
  ADD COLUMN IF NOT EXISTS fallback_result jsonb,
  ADD COLUMN IF NOT EXISTS final_reason text,
  ADD COLUMN IF NOT EXISTS timezone_source text;

NOTIFY pgrst, 'reload schema';
