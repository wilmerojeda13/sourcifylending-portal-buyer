-- Add unique constraint on (name, program, stage) for account_opportunities
-- This enables safe upsert/deduplication when seeding default opportunities

ALTER TABLE account_opportunities
  ADD CONSTRAINT account_opportunities_name_program_stage_unique
  UNIQUE (name, program, stage);
