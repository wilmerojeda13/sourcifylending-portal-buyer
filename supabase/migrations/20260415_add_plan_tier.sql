-- Add plan_tier column to support FREE and PAID plans
-- Separates plan tier from subscription status to allow free users to be "active"

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free'
                              CHECK (plan_tier IN ('free', 'paid'));

-- Update existing inactive users without a paid history to plan_tier='free'
-- (Users with active/trialing/canceled/past_due subscriptions are assumed to be 'paid')
UPDATE profiles
SET plan_tier = 'free'
WHERE subscription_status = 'inactive'
  AND plan_tier IS NULL;

-- Create index for plan_tier queries
CREATE INDEX IF NOT EXISTS idx_profiles_plan_tier ON profiles(plan_tier);
