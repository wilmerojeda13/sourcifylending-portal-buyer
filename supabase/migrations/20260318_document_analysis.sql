-- Migration: Document Analysis fields + expanded document types
-- Date: 2026-03-18

-- 1. Drop old CHECK constraint on document_type (safe — no-op if it doesn't exist)
DO $$ BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- 2. Add new CHECK constraint with all document types including new ones
ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN (
    'personal_credit_report',
    'business_formation',
    'ein_letter',
    'bank_statement',
    'vendor_confirmation',
    'other',
    'articles_of_organization',
    'driver_license',
    'utility_bill',
    'voided_check',
    'business_license',
    'duns_confirmation'
  ));

-- 3. Add AI analysis columns (all IF NOT EXISTS via DO blocks)
DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN ai_analysis_status TEXT DEFAULT 'pending'
    CHECK (ai_analysis_status IN ('pending','analyzing','completed','failed','skipped'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN ai_analysis JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN ai_analyzed_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
