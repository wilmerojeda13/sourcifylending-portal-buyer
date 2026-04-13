-- ============================================================
-- Fix dialer-to-CRM promotion source handling
-- Prevent dialer promotion from writing non-CRM source values
-- into crm_leads and tripping crm_leads_source_check.
-- ============================================================

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
  v_existing_promoted_id uuid;
  v_raw_snapshot jsonb;
  v_crm_snapshot jsonb;
  v_source text := CASE
    WHEN lower(trim(COALESCE(p_source, ''))) IN (
      'manual',
      'analyzer',
      'affiliate',
      'facebook',
      'purchased',
      'referral',
      'inbound',
      'other'
    )
      THEN lower(trim(p_source))
    ELSE 'manual'
  END;
BEGIN
  SELECT promoted_to_crm_lead_id INTO v_existing_promoted_id
  FROM public.dialer_raw_leads
  WHERE id = p_raw_lead_id;

  IF v_existing_promoted_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_promoted_id, false, true;
    RETURN;
  END IF;

  SELECT id INTO v_crm_lead_id
  FROM public.crm_leads
  WHERE phone_e164 = p_phone_e164 AND phone_e164 IS NOT NULL
  LIMIT 1;

  IF v_crm_lead_id IS NOT NULL THEN
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
        WHEN source IS NULL OR source = 'manual' THEN v_source
        ELSE source
      END,
      stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END,
      updated_at = now()
    WHERE id = v_crm_lead_id;

    v_merged := true;
  ELSE
    INSERT INTO public.crm_leads (
      first_name, last_name, phone, phone_e164, email,
      business_name, notes, source, stage
    ) VALUES (
      p_first_name, p_last_name, p_phone, p_phone_e164, p_email,
      p_business_name, p_notes, v_source, 'new'
    )
    RETURNING id INTO v_crm_lead_id;
  END IF;

  UPDATE public.dialer_raw_leads
  SET
    promoted_to_crm_at = now(),
    promoted_to_crm_lead_id = v_crm_lead_id,
    promotion_trigger = p_trigger,
    updated_at = now()
  WHERE id = p_raw_lead_id;

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

NOTIFY pgrst, 'reload schema';
