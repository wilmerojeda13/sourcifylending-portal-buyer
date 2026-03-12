-- Add is_demo flag to profiles
-- Demo accounts are seeded for testing and sales demos

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false NOT NULL;

-- Index for filtering demo accounts in admin
CREATE INDEX IF NOT EXISTS profiles_is_demo_idx ON profiles(is_demo);
