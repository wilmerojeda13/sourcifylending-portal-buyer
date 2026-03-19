-- Credit Disputes table
create table if not exists public.credit_disputes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  bureau               text not null check (bureau in ('Experian', 'Equifax', 'TransUnion')),
  dispute_type         text not null check (dispute_type in ('Personal Information', 'Account Information', 'Collection Account', 'Hard Inquiry')),
  item_disputed        text not null,
  incorrect_information text not null,
  correct_information  text not null,
  generated_letter     text,             -- the generated dispute letter content
  date_generated       timestamptz default now(),
  date_sent            timestamptz,
  investigation_deadline timestamptz,    -- 30 days from date_sent
  status               text not null default 'Draft'
                         check (status in ('Draft', 'Generated', 'Sent', 'Under Investigation', 'Resolved', 'Deleted', 'Escalated')),
  documents            text[] default '{}',  -- storage paths
  response_notes       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists credit_disputes_user_id_idx on public.credit_disputes(user_id);
create index if not exists credit_disputes_status_idx  on public.credit_disputes(status);
create index if not exists credit_disputes_bureau_idx  on public.credit_disputes(bureau);

alter table public.credit_disputes enable row level security;

create policy "credit_disputes_select_own"
  on public.credit_disputes for select using (auth.uid() = user_id);

create policy "credit_disputes_insert_own"
  on public.credit_disputes for insert with check (auth.uid() = user_id);

create policy "credit_disputes_update_own"
  on public.credit_disputes for update using (auth.uid() = user_id);

create policy "credit_disputes_delete_own"
  on public.credit_disputes for delete using (auth.uid() = user_id);
