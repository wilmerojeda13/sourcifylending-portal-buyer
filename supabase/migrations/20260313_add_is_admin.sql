-- Add is_admin flag to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false NOT NULL;

-- Grant superadmin to the primary operator account (if profile already exists)
UPDATE profiles
SET is_admin = true
WHERE email = 'support@sourcifylending.com';

-- Also auto-grant admin on future sign-ups for this account
-- (handles the case where the migration runs before the user signs up)
CREATE OR REPLACE FUNCTION auto_grant_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email = 'support@sourcifylending.com' THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_grant_admin ON profiles;
CREATE TRIGGER trg_auto_grant_admin
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_grant_admin();
