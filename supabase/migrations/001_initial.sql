-- ============================================================
-- SourcifyLending Portal — Initial Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name                       TEXT NOT NULL DEFAULT '',
  email                           TEXT NOT NULL DEFAULT '',
  business_name                   TEXT,
  business_age                    TEXT,
  entity_type                     TEXT,
  industry                        TEXT,
  monthly_revenue_range           TEXT,
  monthly_deposit_range           TEXT,
  nsf_flag                        BOOLEAN NOT NULL DEFAULT false,
  credit_score_range              TEXT,
  utilization_range               TEXT,
  inquiry_range                   TEXT,
  business_credit_reporting_status TEXT,
  assigned_program                TEXT CHECK (assigned_program IN ('program_a', 'program_b', 'program_c')),
  readiness_status                TEXT CHECK (readiness_status IN ('Ready', 'Conditionally Ready', 'Not Ready')),
  current_stage                   TEXT,
  next_task_id                    TEXT,
  progress_percentage             INTEGER NOT NULL DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  subscription_status             TEXT NOT NULL DEFAULT 'inactive'
                                    CHECK (subscription_status IN ('active', 'inactive', 'canceled', 'past_due', 'trialing')),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── subscriptions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id    TEXT UNIQUE,
  stripe_customer_id        TEXT,
  status                    TEXT NOT NULL DEFAULT 'inactive'
                              CHECK (status IN ('active', 'inactive', 'canceled', 'past_due', 'trialing')),
  program                   TEXT CHECK (program IN ('program_a', 'program_b', 'program_c')),
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ─── analyzer_results ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analyzer_results (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Input snapshot
  business_name                   TEXT,
  business_age                    TEXT,
  entity_type                     TEXT,
  industry                        TEXT,
  monthly_revenue_range           TEXT,
  monthly_deposit_range           TEXT,
  nsf_last_90_days                BOOLEAN,
  credit_score_range              TEXT,
  utilization_range               TEXT,
  inquiry_count_last_90_days      TEXT,
  business_credit_reporting_status TEXT,
  primary_goal                    TEXT,
  -- Output
  readiness_status    TEXT CHECK (readiness_status IN ('Ready', 'Conditionally Ready', 'Not Ready')),
  assigned_program    TEXT CHECK (assigned_program IN ('program_a', 'program_b', 'program_c')),
  risk_flags          JSONB NOT NULL DEFAULT '[]',
  summary             TEXT,
  recommendation      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  task_id             TEXT PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program             TEXT NOT NULL CHECK (program IN ('program_a', 'program_b', 'program_c')),
  stage               TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'locked'
                        CHECK (status IN ('pending', 'completed', 'locked', 'overdue')),
  due_date            TIMESTAMPTZ,
  requires_document   BOOLEAN NOT NULL DEFAULT false,
  completed_at        TIMESTAMPTZ,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id    ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(user_id, status);

-- ─── documents ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  document_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_type       TEXT NOT NULL
                        CHECK (document_type IN (
                          'personal_credit_report',
                          'business_formation',
                          'ein_letter',
                          'bank_statement',
                          'vendor_confirmation',
                          'other'
                        )),
  file_url            TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  file_size           BIGINT NOT NULL DEFAULT 0,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status       TEXT NOT NULL DEFAULT 'pending'
                        CHECK (review_status IN ('pending', 'reviewed', 'approved', 'rejected')),
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

-- ─── reports ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  report_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_type         TEXT NOT NULL
                        CHECK (report_type IN (
                          'credit_readiness_summary',
                          'funding_readiness_analysis',
                          'tradeline_progress_report',
                          'monthly_monitoring_report',
                          'next_step_summary'
                        )),
  title               TEXT NOT NULL,
  content             TEXT NOT NULL,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);

-- ─── notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                TEXT NOT NULL
                        CHECK (type IN ('reminder', 'task_due', 'report_ready', 'ai_update', 'system')),
  title               TEXT NOT NULL,
  message             TEXT NOT NULL,
  read                BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications(user_id, read) WHERE read = false;

-- ============================================================
-- Row-Level Security
-- ============================================================

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subscriptions_insert_own" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- analyzer_results
ALTER TABLE analyzer_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analyzer_results_select_own" ON analyzer_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "analyzer_results_insert_any"  ON analyzer_results FOR INSERT WITH CHECK (true);

-- tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select_own" ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tasks_update_own" ON tasks FOR UPDATE USING (auth.uid() = user_id);

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_select_own" ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "documents_insert_own" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents_delete_own" ON documents FOR DELETE USING (auth.uid() = user_id);

-- reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_select_own" ON reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "reports_insert_own" ON reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- Functions & Triggers
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Storage bucket (run via Supabase dashboard or CLI)
-- ============================================================
-- The following is a reminder — storage buckets are created via
-- the Supabase Storage API, not SQL migrations. Create a private
-- bucket named "documents" with a 10 MB file size limit and
-- allow types: application/pdf, image/png, image/jpeg, image/webp.
--
-- supabase storage create documents --public=false
