-- Add demo_secondary_program column to support the dual-program demo account.
-- When is_demo = true and this column is set, the portal shows a "Switch Program"
-- button that swaps assigned_program and demo_secondary_program.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS demo_secondary_program TEXT
    CHECK (demo_secondary_program IN ('program_a', 'program_b', 'program_c'));
