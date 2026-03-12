-- Add is_admin flag to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false NOT NULL;

-- Grant superadmin to abelf305@gmail.com (if profile already exists)
UPDATE profiles
SET is_admin = true
WHERE email = 'abelf305@gmail.com';

-- Also auto-grant admin on future sign-ups for this email
-- (handles the case where the migration runs before the user signs up)
CREATE OR REPLACE FUNCTION auto_grant_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email = 'abelf305@gmail.com' THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_grant_admin ON profiles;
CREATE TRIGGER trg_auto_grant_admin
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_grant_admin();
