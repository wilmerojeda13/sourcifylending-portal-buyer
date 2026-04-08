-- CRM Unified Search Enhancement
-- Adds indexes and computed columns for improved search performance

-- Add phone_digits column for efficient phone number search
-- This stores digits-only version of phone for fast lookup
ALTER TABLE crm_leads 
ADD COLUMN IF NOT EXISTS phone_digits TEXT;

-- Add search_name column that combines first + last for full-text search
ALTER TABLE crm_leads 
ADD COLUMN IF NOT EXISTS search_name TEXT;

-- Create function to update search columns
CREATE OR REPLACE FUNCTION update_crm_lead_search_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Update phone_digits: normalize to digits only
  NEW.phone_digits = regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');
  
  -- Update search_name: lowercase, trimmed full name
  NEW.search_name = LOWER(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update search columns on insert/update
DROP TRIGGER IF EXISTS trg_crm_leads_search_columns ON crm_leads;
CREATE TRIGGER trg_crm_leads_search_columns
  BEFORE INSERT OR UPDATE OF first_name, last_name, phone ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_lead_search_columns();

-- Create indexes for unified search
-- Index on phone_digits for fast phone lookup
CREATE INDEX IF NOT EXISTS idx_crm_leads_phone_digits 
  ON crm_leads (phone_digits) 
  WHERE phone_digits IS NOT NULL AND phone_digits != '';

-- Index on search_name for fast name lookup
CREATE INDEX IF NOT EXISTS idx_crm_leads_search_name 
  ON crm_leads (search_name) 
  WHERE search_name IS NOT NULL AND search_name != '';

-- Index on email for fast email lookup
CREATE INDEX IF NOT EXISTS idx_crm_leads_email_search 
  ON crm_leads (LOWER(email)) 
  WHERE email IS NOT NULL;

-- Index on business_name for fast business lookup
CREATE INDEX IF NOT EXISTS idx_crm_leads_business_name_search 
  ON crm_leads (LOWER(business_name)) 
  WHERE business_name IS NOT NULL;

-- Composite index for common search patterns
CREATE INDEX IF NOT EXISTS idx_crm_leads_search_composite 
  ON crm_leads (is_archived, search_name, phone_digits, LOWER(email));

-- Backfill existing rows with search columns
UPDATE crm_leads SET 
  phone_digits = regexp_replace(COALESCE(phone, ''), '\D', '', 'g'),
  search_name = LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')))
WHERE phone_digits IS NULL OR search_name IS NULL;
