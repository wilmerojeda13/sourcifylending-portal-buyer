-- Atomic winner selection to prevent race conditions
-- Ensures only one winner per session, even with simultaneous answers
CREATE OR REPLACE FUNCTION mark_dialer_winner_atomic(
  p_session_id UUID,
  p_winning_attempt_id UUID,
  p_timestamp TIMESTAMPTZ
)
RETURNS TABLE (
  success BOOLEAN,
  winner_id UUID,
  timestamp TIMESTAMPTZ,
  error TEXT
) AS $$
DECLARE
  v_session_record RECORD;
  v_existing_winner RECORD;
  v_other_attempts RECORD[];
BEGIN
  -- Lock the session to prevent concurrent winner selection
  SELECT * INTO v_session_record 
  FROM crm_dialer_sessions 
  WHERE id = p_session_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY 
    SELECT false, NULL, NULL, 'Session not found'::TEXT;
  END IF;
  
  -- Check if there's already a winner for this session
  SELECT * INTO v_existing_winner
  FROM crm_dialer_attempts
  WHERE dialer_session_id = p_session_id 
    AND is_winner = TRUE 
    AND resolved_at IS NOT NULL
  LIMIT 1;
  
  -- If there's already a winner, cancel this attempt
  IF FOUND THEN
    UPDATE crm_dialer_attempts
    SET 
      attempt_status = 'canceled',
      resolution_type = 'canceled_for_race_condition',
      resolved_at = p_timestamp,
      updated_at = p_timestamp
    WHERE id = p_winning_attempt_id;
    
    RETURN QUERY 
    SELECT false, v_existing_winner.id, v_existing_winner.resolved_at, 'Race condition: another attempt already won'::TEXT;
  END IF;
  
  -- Mark this attempt as the winner
  UPDATE crm_dialer_attempts
  SET 
    attempt_status = 'answered_human',
    is_winner = TRUE,
    answered_by = 'human',
    amd_status = 'human',
    resolved_at = p_timestamp,
    updated_at = p_timestamp
  WHERE id = p_winning_attempt_id;
  
  -- Cancel all other active attempts in the same session
  UPDATE crm_dialer_attempts
  SET 
    attempt_status = 'canceled',
    resolution_type = 'canceled_for_live_answer',
    resolved_at = p_timestamp,
    updated_at = p_timestamp
  WHERE dialer_session_id = p_session_id
    AND id != p_winning_attempt_id
    AND is_winner = FALSE
    AND resolved_at IS NULL
    AND attempt_status IN ('dialing', 'ringing', 'answered_human', 'bridged');
  
  -- Update session to reflect winner
  UPDATE crm_dialer_sessions
  SET 
    current_lead_id = (SELECT lead_id FROM crm_dialer_attempts WHERE id = p_winning_attempt_id),
    current_crm_call_id = (SELECT crm_call_id FROM crm_dialer_attempts WHERE id = p_winning_attempt_id),
    winning_attempt_id = p_winning_attempt_id,
    answered_at = p_timestamp,
    updated_at = p_timestamp
  WHERE id = p_session_id;
  
  COMMIT;
  
  RETURN QUERY 
    SELECT true, p_winning_attempt_id, p_timestamp, NULL::TEXT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RETURN QUERY 
      SELECT false, NULL, NULL, 'Error: ' || SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;
