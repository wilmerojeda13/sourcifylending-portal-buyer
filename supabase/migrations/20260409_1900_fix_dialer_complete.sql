-- ============================================================
-- Dialer Complete Fix
-- Adds all columns referenced by the dialer but missing from
-- earlier migrations. Safe to re-run (all use IF NOT EXISTS).
-- ============================================================

-- ── 1. crm_leads: columns written by applyCrmDisposition ─────────────────────
-- appointment_at  : written for Appointment Set / Booked Call outcomes
-- do_not_call     : set to true for DNC / Not Interested / Bad Number
-- follow_up_at    : set for Follow Up and retry outcomes
-- last_contacted_at: always written by applyCrmDisposition

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS appointment_at     timestamptz,
  ADD COLUMN IF NOT EXISTS do_not_call        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_contacted_at  timestamptz;

CREATE INDEX IF NOT EXISTS crm_leads_do_not_call_idx
  ON public.crm_leads (do_not_call)
  WHERE do_not_call = true;

CREATE INDEX IF NOT EXISTS crm_leads_follow_up_at_idx
  ON public.crm_leads (follow_up_at)
  WHERE follow_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_leads_appointment_at_idx
  ON public.crm_leads (appointment_at)
  WHERE appointment_at IS NOT NULL;

-- ── 2. crm_calls: Twilio/provider columns + outcome constraint ────────────────
-- call_provider   : NOT NULL DEFAULT 'manual' (added by 20260402_crm_twilio_dialer
--                   but may be missing on environments where that migration didn't run)
-- metadata        : jsonb bag for dialer metadata
-- dialer_attempt_id: FK reference used by the calls POST route

ALTER TABLE public.crm_calls
  ADD COLUMN IF NOT EXISTS call_provider      text         NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS metadata           jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dialer_attempt_id  uuid;

-- Backfill any rows that might have a null call_provider (shouldn't happen, but safe)
UPDATE public.crm_calls SET call_provider = 'manual' WHERE call_provider IS NULL;

-- Fix the outcome constraint: the original migration only had 10 outcomes.
-- 20260402_crm_twilio_dialer already fixes this, but we redo it here for
-- environments where that migration was not applied.
ALTER TABLE public.crm_calls
  DROP CONSTRAINT IF EXISTS crm_calls_outcome_check;

ALTER TABLE public.crm_calls
  ADD CONSTRAINT crm_calls_outcome_check
  CHECK (call_outcome IN (
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

-- ── 3. crm_dialer_sessions: columns used by session state management ──────────
-- waiting_for_disposition : cleared by calls POST after disposition is saved
-- winning_attempt_id      : set by mark_dialer_winner_atomic
-- rep_session_mode        : 'single_line' | 'parallel'
-- target_parallel_lines   : how many outbound lines to dial simultaneously
-- active_attempt_count    : live count updated by syncDialerSessionState
-- rep_state               : session phase (e.g. 'connecting', 'ready')
-- settings                : jsonb settings bag

ALTER TABLE public.crm_dialer_sessions
  ADD COLUMN IF NOT EXISTS waiting_for_disposition  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS winning_attempt_id       uuid,
  ADD COLUMN IF NOT EXISTS rep_session_mode         text,
  ADD COLUMN IF NOT EXISTS target_parallel_lines    integer  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS active_attempt_count     integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rep_state                text,
  ADD COLUMN IF NOT EXISTS settings                 jsonb    NOT NULL DEFAULT '{}'::jsonb;

-- ── 4. Notify PostgREST to reload schema cache ────────────────────────────────
NOTIFY pgrst, 'reload schema';
