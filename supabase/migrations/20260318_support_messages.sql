-- Support Messages table
create table if not exists public.support_messages (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  user_email    text not null,
  subject       text not null,
  message       text not null,
  status        text not null default 'open',  -- open | replied | closed
  admin_reply   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes
create index if not exists support_messages_user_id_idx on public.support_messages(user_id);
create index if not exists support_messages_status_idx  on public.support_messages(status);
create index if not exists support_messages_created_idx on public.support_messages(created_at desc);

-- RLS
alter table public.support_messages enable row level security;

-- Clients can only see and insert their own messages
create policy "support_messages_select_own"
  on public.support_messages for select
  using (auth.uid() = user_id);

create policy "support_messages_insert_own"
  on public.support_messages for insert
  with check (auth.uid() = user_id);

-- Clients cannot update/delete their own messages (admin-only via service role)
