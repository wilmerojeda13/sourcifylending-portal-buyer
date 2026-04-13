-- Email campaign foundation for V1 safe sending and suppression handling.

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  html_body text,
  text_body text,
  from_email text not null,
  from_name text,
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'failed')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  opened_count integer not null default 0,
  clicked_count integer not null default 0,
  bounced_count integer not null default 0,
  complained_count integer not null default 0,
  unsubscribed_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_campaigns_status_idx
  on public.email_campaigns (status);

create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid references public.crm_leads(id) on delete set null,
  email text not null,
  first_name text,
  last_name text,
  send_status text not null default 'pending'
    check (send_status in (
      'pending',
      'sending',
      'sent',
      'failed',
      'blocked_unsubscribed',
      'blocked_suppressed'
    )),
  provider_message_id text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create index if not exists email_campaign_recipients_campaign_id_idx
  on public.email_campaign_recipients (campaign_id);

create index if not exists email_campaign_recipients_email_idx
  on public.email_campaign_recipients (email);

create table if not exists public.email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text,
  source text,
  created_at timestamptz not null default now(),
  unique (email)
);

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  suppression_type text not null
    check (suppression_type in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  source text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  recipient_id uuid references public.email_campaign_recipients(id) on delete set null,
  email text not null,
  event_type text not null
    check (event_type in (
      'sent',
      'delivered',
      'opened',
      'clicked',
      'bounced',
      'complained',
      'unsubscribed',
      'suppressed',
      'failed'
    )),
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists email_events_campaign_id_idx
  on public.email_events (campaign_id);

create index if not exists email_events_email_idx
  on public.email_events (email);

create table if not exists public.email_send_settings (
  id uuid primary key default gen_random_uuid(),
  daily_send_cap integer not null default 500 check (daily_send_cap >= 1),
  per_campaign_send_cap integer not null default 100 check (per_campaign_send_cap >= 1),
  sending_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_email_campaigns_updated_at on public.email_campaigns;
create trigger trg_email_campaigns_updated_at
  before update on public.email_campaigns
  for each row execute function public.update_updated_at();

drop trigger if exists trg_email_campaign_recipients_updated_at on public.email_campaign_recipients;
create trigger trg_email_campaign_recipients_updated_at
  before update on public.email_campaign_recipients
  for each row execute function public.update_updated_at();

drop trigger if exists trg_email_suppressions_updated_at on public.email_suppressions;
create trigger trg_email_suppressions_updated_at
  before update on public.email_suppressions
  for each row execute function public.update_updated_at();

drop trigger if exists trg_email_send_settings_updated_at on public.email_send_settings;
create trigger trg_email_send_settings_updated_at
  before update on public.email_send_settings
  for each row execute function public.update_updated_at();

NOTIFY pgrst, 'reload schema';
