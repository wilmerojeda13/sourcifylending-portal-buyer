-- ─── AI Conversations ─────────────────────────────────────────────────────────
create table if not exists public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null default 'New Conversation',
  status          text not null default 'active' check (status in ('active', 'archived')),
  started_at      timestamptz not null default now(),
  last_message_at timestamptz,
  archived_at     timestamptz,
  summary         text,          -- AI-generated summary when archived
  token_estimate  integer default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists ai_conversations_user_id_idx    on public.ai_conversations(user_id);
create index if not exists ai_conversations_user_active_idx on public.ai_conversations(user_id, is_active);

alter table public.ai_conversations enable row level security;
create policy "ai_conversations_own" on public.ai_conversations for all using (auth.uid() = user_id);

-- ─── AI Messages ──────────────────────────────────────────────────────────────
create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  token_estimate  integer default 0,
  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx on public.ai_messages(conversation_id);
create index if not exists ai_messages_user_id_idx      on public.ai_messages(user_id);

alter table public.ai_messages enable row level security;
create policy "ai_messages_own" on public.ai_messages for all using (auth.uid() = user_id);

-- ─── AI Memory Profile ────────────────────────────────────────────────────────
-- Persistent structured memory per client — survives conversation rollovers
create table if not exists public.ai_memory_profiles (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references auth.users(id) on delete cascade,
  business_name        text,
  program_type         text,
  current_stage        text,
  goals                text,
  key_facts            text,           -- important facts about this client
  last_summary         text,           -- most recent conversation summary
  next_steps           text,           -- recommended next steps
  total_approved_funding numeric(12,2) default 0,
  active_disputes      integer default 0,
  pending_tasks        integer default 0,
  updated_at           timestamptz not null default now()
);

create index if not exists ai_memory_profiles_user_id_idx on public.ai_memory_profiles(user_id);

alter table public.ai_memory_profiles enable row level security;
create policy "ai_memory_profiles_own" on public.ai_memory_profiles for all using (auth.uid() = user_id);

-- ─── AI Memory Events ─────────────────────────────────────────────────────────
-- Event log so the AI can understand what happened and when
create table if not exists public.ai_memory_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  event_type        text not null,   -- analyzer_completed, program_assigned, stage_changed, document_uploaded, task_completed, etc.
  event_title       text not null,
  event_details     text,
  related_record_id text,            -- optional FK to related record
  created_at        timestamptz not null default now()
);

create index if not exists ai_memory_events_user_id_idx on public.ai_memory_events(user_id);
create index if not exists ai_memory_events_created_idx on public.ai_memory_events(created_at desc);

alter table public.ai_memory_events enable row level security;
create policy "ai_memory_events_own" on public.ai_memory_events for all using (auth.uid() = user_id);
