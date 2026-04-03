create table if not exists public.seo_content_pages (
  id uuid primary key default gen_random_uuid(),
  route_group text not null check (route_group in ('services', 'industries', 'answers', 'comparisons', 'locations', 'portal-guides', 'problems')),
  content_type text not null check (content_type in ('service_page', 'industry_page', 'answer_page', 'comparison_page', 'local_page', 'portal_guide_page', 'problem_page')),
  slug text not null,
  canonical_path text not null,
  title_tag text not null,
  meta_description text not null,
  h1 text not null,
  hero_summary text not null,
  brief_summary text,
  buyer_intent text,
  target_keywords text[] not null default '{}',
  workflow_status text not null default 'draft' check (workflow_status in ('draft', 'review', 'approved', 'published', 'needs_refresh', 'archived')),
  intro_text text,
  body_sections jsonb not null default '[]'::jsonb,
  faq_items jsonb not null default '[]'::jsonb,
  cta_blocks jsonb not null default '[]'::jsonb,
  trust_points text[] not null default '{}',
  comparison_rows jsonb not null default '[]'::jsonb,
  internal_links jsonb not null default '[]'::jsonb,
  schema_type text,
  schema_json jsonb not null default '{}'::jsonb,
  author_name text,
  reviewer_notes text,
  freshness_label text,
  quality_score integer,
  quality_issues text[] not null default '{}',
  allow_auto_refresh boolean not null default false,
  source_signals jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  last_updated_at timestamptz,
  refresh_due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_group, slug),
  unique (canonical_path)
);

create index if not exists seo_content_pages_status_idx
  on public.seo_content_pages (workflow_status, updated_at desc);

create index if not exists seo_content_pages_refresh_idx
  on public.seo_content_pages (refresh_due_at, workflow_status);

create table if not exists public.seo_content_topic_ideas (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  cluster_key text not null,
  buyer_intent text not null,
  suggested_content_type text not null check (suggested_content_type in ('service_page', 'industry_page', 'answer_page', 'comparison_page', 'local_page', 'portal_guide_page', 'problem_page')),
  source_type text not null,
  source_record_id text,
  evidence_excerpt text,
  keywords text[] not null default '{}',
  priority_score integer,
  status text not null default 'new' check (status in ('new', 'clustered', 'briefed', 'drafted', 'ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cluster_key, source_type, source_record_id)
);

create index if not exists seo_content_topic_ideas_priority_idx
  on public.seo_content_topic_ideas (priority_score desc nulls last, created_at desc);

create table if not exists public.seo_content_updates (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.seo_content_pages(id) on delete cascade,
  update_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists seo_content_updates_page_idx
  on public.seo_content_updates (page_id, created_at desc);

create table if not exists public.seo_content_metrics (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.seo_content_pages(id) on delete cascade,
  metric_date date not null,
  source text not null check (source in ('gsc', 'bing_webmaster', 'bing_ai', 'internal')),
  impressions integer not null default 0,
  clicks integer not null default 0,
  average_position numeric(8,2),
  ai_citations integer not null default 0,
  indexed_status text,
  leads integer not null default 0,
  signups integer not null default 0,
  booked_calls integer not null default 0,
  paid_clients integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (page_id, metric_date, source)
);

create index if not exists seo_content_metrics_page_idx
  on public.seo_content_metrics (page_id, metric_date desc);

create table if not exists public.seo_content_events (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.seo_content_pages(id) on delete cascade,
  event_type text not null check (event_type in ('visit', 'lead', 'signup', 'booked_call', 'paid_client', 'indexnow_submission', 'ai_citation')),
  related_record_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists seo_content_events_page_idx
  on public.seo_content_events (page_id, event_type, occurred_at desc);

create unique index if not exists seo_content_events_page_event_record_unique
  on public.seo_content_events (page_id, event_type, related_record_id)
  where related_record_id is not null;

alter table public.seo_content_pages enable row level security;
alter table public.seo_content_topic_ideas enable row level security;
alter table public.seo_content_updates enable row level security;
alter table public.seo_content_metrics enable row level security;
alter table public.seo_content_events enable row level security;

drop policy if exists "Admins manage seo_content_pages" on public.seo_content_pages;
create policy "Admins manage seo_content_pages"
  on public.seo_content_pages for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

drop policy if exists "Admins manage seo_content_topic_ideas" on public.seo_content_topic_ideas;
create policy "Admins manage seo_content_topic_ideas"
  on public.seo_content_topic_ideas for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

drop policy if exists "Admins manage seo_content_updates" on public.seo_content_updates;
create policy "Admins manage seo_content_updates"
  on public.seo_content_updates for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

drop policy if exists "Admins manage seo_content_metrics" on public.seo_content_metrics;
create policy "Admins manage seo_content_metrics"
  on public.seo_content_metrics for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

drop policy if exists "Admins manage seo_content_events" on public.seo_content_events;
create policy "Admins manage seo_content_events"
  on public.seo_content_events for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

notify pgrst, 'reload schema';
