-- ============================================================
-- Dialer/CRM Cutover Migration
-- Minimal schema for one-way promotion from dialer to CRM
-- ============================================================

-- 1. Dialer-owned raw lead storage (no CRM fields)
CREATE TABLE IF NOT EXISTS public.dialer_raw_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core contact data only
  first_name text NOT NULL,
  last_name text,
  phone text NOT NULL,
  phone_e164 text,
  email text,
  business_name text,
  notes text,
  
  -- Source tracking
  source text NOT NULL DEFAULT 'dialer_import',
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Dialer state only
  do_not_call boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  
  -- One-way promotion tracking
  promoted_to_crm_at timestamptz,
  promoted_to_crm_lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  promotion_trigger text, -- 'interested', 'appointment_set', 'manual'
  
  -- Raw data preservation
  original_import_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dialer_raw_leads ENABLE ROW LEVEL SECURITY;

-- Admin-only policy
DROP POLICY IF EXISTS "Admins manage dialer_raw_leads" ON public.dialer_raw_leads;
CREATE POLICY "Admins manage dialer_raw_leads"
  ON public.dialer_raw_leads FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 2. Audit log for promotions
CREATE TABLE IF NOT EXISTS public.dialer_promotion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_lead_id uuid NOT NULL REFERENCES public.dialer_raw_leads(id) ON DELETE CASCADE,
  crm_lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  promotion_trigger text NOT NULL,
  promoted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  promoted_at timestamptz NOT NULL DEFAULT now(),
  merged_with_existing_crm_lead boolean NOT NULL DEFAULT false,
  duplication_check_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_lead_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  crm_lead_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.dialer_promotion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view dialer_promotion_log" ON public.dialer_promotion_log;
CREATE POLICY "Admins view dialer_promotion_log"
  ON public.dialer_promotion_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 3. Indexes for dialer queries
CREATE INDEX IF NOT EXISTS dialer_raw_leads_callable_idx 
  ON public.dialer_raw_leads(created_at) 
  WHERE promoted_to_crm_lead_id IS NULL AND do_not_call = false AND is_archived = false;

CREATE INDEX IF NOT EXISTS dialer_raw_leads_phone_idx 
  ON public.dialer_raw_leads(phone_e164) 
  WHERE phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS dialer_raw_leads_promoted_idx 
  ON public.dialer_raw_leads(promoted_to_crm_lead_id) 
  WHERE promoted_to_crm_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dialer_promotion_log_raw_lead_idx 
  ON public.dialer_promotion_log(raw_lead_id);

CREATE INDEX IF NOT EXISTS dialer_promotion_log_crm_lead_idx 
  ON public.dialer_promotion_log(crm_lead_id);

-- 4. Duplicate prevention: unique phone constraint on CRM leads
-- Note: This may fail if duplicates already exist; run cleanup first if needed
DO $$
BEGIN
  -- Only add if no duplicates exist
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_leads 
    WHERE phone_e164 IS NOT NULL 
    GROUP BY phone_e164 
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_phone_e164_unique_idx 
      ON public.crm_leads(phone_e164) 
      WHERE phone_e164 IS NOT NULL;
  END IF;
END $$;

-- 5. Function for atomic promotion (prevents race conditions)
CREATE OR REPLACE FUNCTION promote_raw_lead_to_crm(
  p_raw_lead_id uuid,
  p_trigger text,
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_phone_e164 text,
  p_email text,
  p_business_name text,
  p_notes text,
  p_source text
) RETURNS TABLE(crm_lead_id uuid, merged boolean, already_promoted boolean) AS $$
DECLARE
  v_crm_lead_id uuid;
  v_merged boolean := false;
  v_already_promoted boolean := false;
  v_existing_promoted_id uuid;
  v_raw_snapshot jsonb;
  v_crm_snapshot jsonb;
BEGIN
  -- Check if already promoted (idempotent)
  SELECT promoted_to_crm_lead_id INTO v_existing_promoted_id
  FROM public.dialer_raw_leads
  WHERE id = p_raw_lead_id;
  
  IF v_existing_promoted_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_promoted_id, false, true;
    RETURN;
  END IF;
  
  -- Check for existing CRM lead by phone
  SELECT id INTO v_crm_lead_id
  FROM public.crm_leads
  WHERE phone_e164 = p_phone_e164 AND phone_e164 IS NOT NULL
  LIMIT 1;
  
  IF v_crm_lead_id IS NOT NULL THEN
    -- Merge: update existing CRM lead
    UPDATE public.crm_leads
    SET 
      first_name = COALESCE(NULLIF(TRIM(p_first_name), ''), first_name),
      last_name = COALESCE(NULLIF(TRIM(p_last_name), ''), last_name),
      email = COALESCE(NULLIF(TRIM(p_email), ''), email),
      business_name = COALESCE(NULLIF(TRIM(p_business_name), ''), business_name),
      notes = CASE 
        WHEN notes IS NULL THEN p_notes
        WHEN p_notes IS NOT NULL THEN notes || E'\n\n[From Dialer]\n' || p_notes
        ELSE notes
      END,
      source = CASE 
        WHEN source IS NULL OR source = 'manual' THEN COALESCE(p_source, 'dialer_promoted')
        ELSE source
      END,
      stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END,
      updated_at = now()
    WHERE id = v_crm_lead_id;
    
    v_merged := true;
  ELSE
    -- Create new CRM lead
    INSERT INTO public.crm_leads (
      first_name, last_name, phone, phone_e164, email, 
      business_name, notes, source, stage
    ) VALUES (
      p_first_name, p_last_name, p_phone, p_phone_e164, p_email,
      p_business_name, p_notes, COALESCE(p_source, 'dialer_promoted'), 'new'
    )
    RETURNING id INTO v_crm_lead_id;
  END IF;
  
  -- Mark raw lead as promoted
  UPDATE public.dialer_raw_leads
  SET 
    promoted_to_crm_at = now(),
    promoted_to_crm_lead_id = v_crm_lead_id,
    promotion_trigger = p_trigger,
    updated_at = now()
  WHERE id = p_raw_lead_id;
  
  -- Build snapshots for audit
  SELECT jsonb_build_object(
    'id', id, 'first_name', first_name, 'last_name', last_name,
    'phone', phone, 'phone_e164', phone_e164, 'email', email,
    'business_name', business_name, 'notes', notes, 'source', source
  ) INTO v_raw_snapshot
  FROM public.dialer_raw_leads WHERE id = p_raw_lead_id;
  
  SELECT jsonb_build_object(
    'id', id, 'first_name', first_name, 'last_name', last_name,
    'phone', phone, 'phone_e164', phone_e164, 'email', email,
    'business_name', business_name, 'stage', stage
  ) INTO v_crm_snapshot
  FROM public.crm_leads WHERE id = v_crm_lead_id;
  
  -- Insert audit log
  INSERT INTO public.dialer_promotion_log (
    raw_lead_id, crm_lead_id, promotion_trigger, promoted_by_user_id,
    merged_with_existing_crm_lead, raw_lead_snapshot, crm_lead_snapshot
  ) VALUES (
    p_raw_lead_id, v_crm_lead_id, p_trigger, p_user_id,
    v_merged, v_raw_snapshot, v_crm_snapshot
  );
  
  RETURN QUERY SELECT v_crm_lead_id, v_merged, false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
