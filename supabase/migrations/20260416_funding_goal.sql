-- Add funding goal support for Program A/B clients
-- This is a nullable, backward-compatible addition

alter table public.profiles
add column if not exists funding_goal_amount numeric(12,2);

-- Index for efficient filtering when building AI context
create index if not exists profiles_funding_goal_idx on public.profiles(funding_goal_amount) where funding_goal_amount is not null;

-- RLS policy (no change needed — existing RLS on profiles applies)
