-- Add demo_secondary_program column to support the dual-program demo account.
-- When is_demo = true and this column is set, the portal shows a "Switch Program"
-- button that swaps assigned_program and demo_secondary_program.

-- demo_secondary_program is intentionally restricted to program_a and program_b only.
-- Program C (Capital Monitoring) is not a valid dual-demo option.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS demo_secondary_program TEXT
    CHECK (demo_secondary_program IN ('program_a', 'program_b'));
