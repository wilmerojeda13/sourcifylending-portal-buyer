-- Add smart lead status fields to crm_leads table
-- This enables the weekly CRM scrubber system

-- Smart status fields
ALTER TABLE crm_leads 
ADD COLUMN smart_status TEXT CHECK (smart_status IN ('active', 'voicemail_heavy', 'unresponsive', 'bad_number', 'retry_later', 'dnc', 'nurture')),
ADD COLUMN smart_status_confidence INTEGER CHECK (smart_status_confidence >= 0 AND smart_status_confidence <= 100),
ADD COLUMN smart_status_reasons JSONB,
ADD COLUMN smart_status_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN smart_status_requires_review BOOLEAN DEFAULT FALSE,
ADD COLUMN lead_health_score INTEGER CHECK (lead_health_score >= 0 AND lead_health_score <= 100),
ADD COLUMN lead_health_tier INTEGER CHECK (lead_health_tier >= 1 AND lead_health_tier <= 5),
ADD COLUMN lead_health_factors JSONB,
ADD COLUMN lead_health_recommendations JSONB,
ADD COLUMN last_scrubbed_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance
CREATE INDEX idx_crm_leads_smart_status ON crm_leads(smart_status);
CREATE INDEX idx_crm_leads_smart_status_review ON crm_leads(smart_status_requires_review) WHERE smart_status_requires_review = TRUE;
CREATE INDEX idx_crm_leads_health_tier ON crm_leads(lead_health_tier);
CREATE INDEX idx_crm_leads_last_scrubbed ON crm_leads(last_scrubbed_at);

-- Create cleanup queue table for admin review
CREATE TABLE crm_lead_cleanup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  reasons JSONB NOT NULL,
  requires_review BOOLEAN DEFAULT TRUE,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  action_taken TEXT CHECK (action_taken IN ('approved', 'rejected', 'modified')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for cleanup queue
CREATE INDEX idx_crm_cleanup_queue_lead_id ON crm_lead_cleanup_queue(lead_id);
CREATE INDEX idx_crm_cleanup_queue_requires_review ON crm_lead_cleanup_queue(requires_review) WHERE requires_review = TRUE;
CREATE INDEX idx_crm_cleanup_queue_created_at ON crm_lead_cleanup_queue(created_at);

-- Create weekly cleanup reports table
CREATE TABLE crm_weekly_cleanup_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL UNIQUE,
  total_leads_processed INTEGER NOT NULL,
  status_counts JSONB NOT NULL, -- { active: X, voicemail_heavy: Y, ... }
  health_tier_distribution JSONB NOT NULL, -- { tier_1: X, tier_2: Y, ... }
  leads_flagged_for_review INTEGER NOT NULL,
  auto_approved_changes INTEGER NOT NULL,
  processing_time_ms INTEGER,
  error_count INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for reports
CREATE INDEX idx_crm_weekly_reports_date ON crm_weekly_cleanup_reports(report_date);

-- Create trigger to update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_crm_lead_cleanup_queue_updated_at BEFORE UPDATE ON crm_lead_cleanup_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_weekly_cleanup_reports_updated_at BEFORE UPDATE ON crm_weekly_cleanup_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
