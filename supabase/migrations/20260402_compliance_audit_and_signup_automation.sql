create table if not exists public.public_form_consent_records (
  id uuid primary key default gen_random_uuid(),
  form_name text not null,
  page_url text not null,
  submitted_at timestamptz not null,
  consent_text_version text not null,
  disclosure_text text,
  consent_given boolean not null default false,
  email text,
  full_name text,
  business_name text,
  phone text,
  ip_address text,
  user_agent text,
  related_lead_id uuid,
  related_user_id uuid references auth.users(id) on delete set null,
  related_profile_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_form_consent_records_form_idx
  on public.public_form_consent_records (form_name, submitted_at desc);

create index if not exists public_form_consent_records_email_idx
  on public.public_form_consent_records (lower(email));

create table if not exists public.public_form_security_events (
  id uuid primary key default gen_random_uuid(),
  form_name text not null,
  email text,
  full_name text,
  business_name text,
  ip_address text,
  user_agent text,
  event_type text not null check (
    event_type in (
      'attempt',
      'blocked_rate_limit',
      'blocked_validation',
      'blocked_disposable',
      'blocked_captcha',
      'accepted'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists public_form_security_events_form_idx
  on public.public_form_security_events (form_name, created_at desc);

create index if not exists public_form_security_events_email_idx
  on public.public_form_security_events (lower(email), created_at desc);

create index if not exists public_form_security_events_ip_idx
  on public.public_form_security_events (ip_address, created_at desc);

create table if not exists public.signup_automation_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  stage text not null check (
    stage in (
      'profile_upsert',
      'crm_lead_create',
      'oauth_crm_lead_create',
      'oauth_profile_upsert'
    )
  ),
  source text not null check (
    source in (
      'email_password',
      'google_oauth',
      'create_prospect'
    )
  ),
  error_message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signup_automation_failures_email_idx
  on public.signup_automation_failures (lower(email), created_at desc);

create index if not exists signup_automation_failures_stage_idx
  on public.signup_automation_failures (stage, created_at desc);

alter table public.public_form_consent_records enable row level security;
alter table public.public_form_security_events enable row level security;
alter table public.signup_automation_failures enable row level security;

drop policy if exists "Admins manage public_form_consent_records" on public.public_form_consent_records;
create policy "Admins manage public_form_consent_records"
  on public.public_form_consent_records
  for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

drop policy if exists "Admins manage public_form_security_events" on public.public_form_security_events;
create policy "Admins manage public_form_security_events"
  on public.public_form_security_events
  for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

drop policy if exists "Admins manage signup_automation_failures" on public.signup_automation_failures;
create policy "Admins manage signup_automation_failures"
  on public.signup_automation_failures
  for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

notify pgrst, 'reload schema';
