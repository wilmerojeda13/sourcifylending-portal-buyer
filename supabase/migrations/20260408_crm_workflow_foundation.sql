ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS created_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_source_label text,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.crm_tasks
  DROP CONSTRAINT IF EXISTS crm_tasks_created_source_check;

ALTER TABLE public.crm_tasks
  ADD CONSTRAINT crm_tasks_created_source_check
  CHECK (created_source in ('manual', 'disposition', 'automation', 'system', 'calendar'));

CREATE INDEX IF NOT EXISTS crm_tasks_created_source_idx
  ON public.crm_tasks (created_source, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  color text NOT NULL DEFAULT 'slate',
  description text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT crm_tags_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_tags_slug_unique_idx
  ON public.crm_tags (slug)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_tags_name_unique_idx
  ON public.crm_tags (LOWER(name))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_tag_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES public.crm_tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_tag_links_entity_type_check
    CHECK (entity_type = 'lead')
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_tag_links_unique_idx
  ON public.crm_tag_links (tag_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS crm_tag_links_entity_idx
  ON public.crm_tag_links (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_tag_links_tag_idx
  ON public.crm_tag_links (tag_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_ids uuid[] NOT NULL DEFAULT '{}',
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_audit_logs_entity_idx
  ON public.crm_audit_logs (entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_audit_logs_action_idx
  ON public.crm_audit_logs (action_type, created_at DESC);

ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tag_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm_tags" ON public.crm_tags;
CREATE POLICY "Admins manage crm_tags"
  ON public.crm_tags FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins manage crm_tag_links" ON public.crm_tag_links;
CREATE POLICY "Admins manage crm_tag_links"
  ON public.crm_tag_links FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins manage crm_audit_logs" ON public.crm_audit_logs;
CREATE POLICY "Admins manage crm_audit_logs"
  ON public.crm_audit_logs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

NOTIFY pgrst, 'reload schema';
