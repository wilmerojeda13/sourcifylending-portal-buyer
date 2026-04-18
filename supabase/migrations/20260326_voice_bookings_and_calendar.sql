-- voice_bookings table for calendar appointments booked during calls
CREATE TABLE IF NOT EXISTS voice_bookings (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id                 UUID,
  lead_id                 UUID,
  calendar_event_id       TEXT,
  calendar_id             TEXT,
  appointment_datetime    TIMESTAMPTZ,
  duration_minutes        INTEGER DEFAULT 30,
  timezone                TEXT DEFAULT 'America/New_York',
  lead_email              TEXT,
  lead_first_name         TEXT,
  lead_last_name          TEXT,
  business_name           TEXT,
  phone                   TEXT,
  meet_link               TEXT,
  booking_status          TEXT DEFAULT 'booked',
  confirmation_email_sent BOOLEAN DEFAULT FALSE,
  confirmation_sms_sent   BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Add booking and qualification fields to voice_calls
ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS demo_booked          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calendar_event_id    TEXT,
  ADD COLUMN IF NOT EXISTS analyzer_link_sent   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lead_classification  TEXT,
  ADD COLUMN IF NOT EXISTS generated_opener     TEXT,
  ADD COLUMN IF NOT EXISTS qualification_notes  TEXT;

-- Add lead fields for personalization
ALTER TABLE voice_leads
  ADD COLUMN IF NOT EXISTS email                TEXT,
  ADD COLUMN IF NOT EXISTS owner_first_name     TEXT,
  ADD COLUMN IF NOT EXISTS owner_last_name      TEXT,
  ADD COLUMN IF NOT EXISTS prior_inquiry_flag   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prior_facebook_flag  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prior_portal_flag    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prior_analyzer_flag  BOOLEAN DEFAULT FALSE;

-- Add Google Calendar and booking settings to voice_agent_settings
ALTER TABLE voice_agent_settings
  ADD COLUMN IF NOT EXISTS google_calendar_id         TEXT,
  ADD COLUMN IF NOT EXISTS google_client_id           TEXT,
  ADD COLUMN IF NOT EXISTS google_client_secret       TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token       TEXT,
  ADD COLUMN IF NOT EXISTS booking_duration_minutes   INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS booking_buffer_minutes     INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS booking_hours_start        TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS booking_hours_end          TEXT DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS booking_weekdays           INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN IF NOT EXISTS booking_timezone           TEXT DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS booking_days_ahead         INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS create_meet_link           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transfer_contact_email     TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_email_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmation_sms_enabled   BOOLEAN DEFAULT FALSE;
