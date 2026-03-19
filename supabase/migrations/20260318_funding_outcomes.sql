-- Funding Results: add decline tracking fields
-- Supports the dual-button (Log Approval / Log Decline) outcome flow

ALTER TABLE public.funding_approvals
  ADD COLUMN IF NOT EXISTS decline_reason        TEXT,
  ADD COLUMN IF NOT EXISTS mark_for_reattempt    BOOLEAN NOT NULL DEFAULT FALSE;

-- Update status check to use lowercase for consistency
-- (existing data uses 'Approved'/'Declined' etc — keep both cases supported)
