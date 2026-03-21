-- ─────────────────────────────────────────────────────────────────────────────
-- Program-Aware Document Intelligence Migration
-- Adds new document types, program tracking, credit/monitoring insight storage,
-- and an admin audit log for every AI document analysis.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expand document_type CHECK constraint ──────────────────────────────────
DO $$ BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN (
    'personal_credit_report',
    'credit_score_report',
    'inquiry_summary',
    'business_formation',
    'articles_of_organization',
    'ein_letter',
    'bank_statement',
    'vendor_confirmation',
    'vendor_account_screenshot',
    'bureau_profile_screenshot',
    'driver_license',
    'utility_bill',
    'voided_check',
    'business_license',
    'duns_confirmation',
    'monitoring_report',
    'other'
  ));

-- ── 2. Add program tracking to documents ──────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN program TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 3. Add ai_program_updates JSONB — stores exactly what changed per upload ──
DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN ai_program_updates JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 4. Program A: Credit optimization insights on profiles ────────────────────
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN credit_optimization_insights JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 5. Program C: Monitoring insights on profiles ─────────────────────────────
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN monitoring_insights JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 6. Document audit log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID NOT NULL,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program               TEXT,
  detected_type         TEXT,
  extracted_fields      JSONB,
  validation_result     TEXT,
  tasks_updated         TEXT[],
  profile_fields_updated TEXT[],
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs; users can only see their own
CREATE POLICY "Users read own audit log"
  ON public.document_audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts (API writes the log with service client)
CREATE POLICY "Service role insert document audit log"
  ON public.document_audit_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_doc_audit_user_id ON public.document_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_audit_created_at ON public.document_audit_log(created_at DESC);
