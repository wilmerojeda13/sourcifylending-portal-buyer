-- ============================================================
-- Admin Enhancements: portal_blocked + admin_notes
-- ============================================================

-- Add portal_blocked: hard-blocks all portal access regardless of subscription status
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS portal_blocked BOOLEAN NOT NULL DEFAULT false;

-- Add admin_notes: internal-only notes visible only in admin panel
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Index for quickly finding blocked users
CREATE INDEX IF NOT EXISTS idx_profiles_portal_blocked
  ON profiles(portal_blocked)
  WHERE portal_blocked = true;
