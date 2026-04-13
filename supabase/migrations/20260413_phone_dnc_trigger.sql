-- =============================================================
-- GLOBAL PHONE DNC BLOCK
-- When ANY raw lead is marked do_not_call = TRUE (via any
-- disposition outcome), the trigger immediately propagates
-- the block to ALL other raw leads sharing the same phone
-- number. One bad number = never dialed again from any angle.
-- =============================================================

-- 1. Trigger function: propagate do_not_call to every lead with the same phone
CREATE OR REPLACE FUNCTION public.fn_propagate_phone_dnc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Guard: skip recursion (when this UPDATE itself fires the trigger on
  -- other rows, the inner calls return here immediately)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Only act when do_not_call flips false → true
  IF NEW.do_not_call = TRUE AND (OLD.do_not_call IS DISTINCT FROM TRUE) THEN
    UPDATE public.dialer_raw_leads
    SET    do_not_call = TRUE,
           stage       = 'dnc',
           updated_at  = NOW()
    WHERE  phone   = NEW.phone       -- match raw phone number
      AND  id     != NEW.id          -- not the row that triggered this
      AND  do_not_call = FALSE;      -- only unblocked leads need updating
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Attach trigger (drop first so re-running this migration is safe)
DROP TRIGGER IF EXISTS trg_propagate_phone_dnc ON public.dialer_raw_leads;
CREATE TRIGGER trg_propagate_phone_dnc
  AFTER UPDATE OF do_not_call ON public.dialer_raw_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_propagate_phone_dnc();

-- =============================================================
-- ONE-TIME CLEANUP
-- =============================================================

-- Step A: Ensure every lead that already has a DNC/disconnected
-- outcome has do_not_call = TRUE (catches any previously-missed rows)
UPDATE public.dialer_raw_leads
SET    do_not_call = TRUE,
       stage       = 'dnc',
       updated_at  = NOW()
WHERE  (
         last_call_outcome IN ('dnc', 'disconnected', 'do_not_call')
         OR stage = 'dnc'
       )
  AND  (do_not_call IS NULL OR do_not_call = FALSE);

-- Step B: Propagate to all leads sharing a phone with any DNC'd lead
-- (The trigger will handle future propagation; this backfills historical data)
UPDATE public.dialer_raw_leads
SET    do_not_call = TRUE,
       stage       = 'dnc',
       updated_at  = NOW()
WHERE  phone IN (
         SELECT DISTINCT phone
         FROM   public.dialer_raw_leads
         WHERE  do_not_call = TRUE
       )
  AND  (do_not_call IS NULL OR do_not_call = FALSE);

-- Step C: Remove DNC leads from ALL active campaigns
-- (The dialable query filters them out at runtime anyway, but removing
--  them keeps campaign counts accurate and the queue clean)
DELETE FROM public.dialer_campaign_leads
WHERE  raw_lead_id IN (
         SELECT id
         FROM   public.dialer_raw_leads
         WHERE  do_not_call = TRUE
       );

NOTIFY pgrst, 'reload schema';
