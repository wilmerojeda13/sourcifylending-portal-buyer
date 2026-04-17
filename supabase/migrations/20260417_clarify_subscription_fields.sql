-- Clarify subscription state field names for better readability
-- Rename columns to clearly indicate their purpose:
-- subscription_status → billing_status (Stripe payment state)
-- plan_tier → feature_tier (feature access level)
-- account_state → member_status (prospect vs active member)

-- Rename subscription_status to billing_status
ALTER TABLE profiles
  RENAME COLUMN subscription_status TO billing_status;

-- Update the check constraint for billing_status
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_billing_status_check
  CHECK (billing_status IN ('active', 'inactive', 'canceled', 'past_due', 'trialing'));

-- Rename plan_tier to feature_tier
ALTER TABLE profiles
  RENAME COLUMN plan_tier TO feature_tier;

-- Update the check constraint for feature_tier
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_tier_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_feature_tier_check
  CHECK (feature_tier IN ('free', 'paid'));

-- Rename account_state to member_status
ALTER TABLE profiles
  RENAME COLUMN account_state TO member_status;

-- Update the check constraint for member_status
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_account_state_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_member_status_check
  CHECK (member_status IN ('prospect', 'active_member'));

-- Update subscriptions table if it has these columns
ALTER TABLE subscriptions
  RENAME COLUMN plan_tier TO feature_tier;

-- Update defaults to use new column names
ALTER TABLE profiles
  ALTER COLUMN billing_status SET DEFAULT 'inactive';

ALTER TABLE profiles
  ALTER COLUMN feature_tier SET DEFAULT 'free';

ALTER TABLE profiles
  ALTER COLUMN member_status SET DEFAULT 'prospect';

-- Create a view for backwards compatibility during transition
-- (Applications can use this view temporarily while being updated)
CREATE OR REPLACE VIEW profile_compat AS
  SELECT
    id,
    user_id,
    full_name,
    email,
    phone,
    business_name,
    business_age,
    entity_type,
    industry,
    -- New names (actual columns)
    billing_status,
    feature_tier,
    member_status,
    -- Compatibility aliases (old names)
    billing_status AS subscription_status,
    feature_tier AS plan_tier,
    member_status AS account_state,
    -- Other columns
    assigned_program,
    current_stage,
    progress_percentage,
    readiness_status,
    portal_blocked,
    is_admin,
    created_at,
    updated_at
  FROM profiles;
