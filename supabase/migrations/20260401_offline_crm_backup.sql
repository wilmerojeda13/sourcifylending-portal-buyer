alter table public.crm_leads
  add column if not exists tags text[] not null default '{}';

alter table public.crm_tasks
  add column if not exists client_mutation_id text;

alter table public.crm_calls
  add column if not exists client_mutation_id text;

create unique index if not exists crm_tasks_client_mutation_id_idx
  on public.crm_tasks (client_mutation_id)
  where client_mutation_id is not null;

create unique index if not exists crm_calls_client_mutation_id_idx
  on public.crm_calls (client_mutation_id)
  where client_mutation_id is not null;

create table if not exists public.crm_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  device_id text,
  mutation_id text not null,
  conflict_type text not null,
  local_payload jsonb,
  server_payload jsonb,
  resolved_in_favor text not null check (resolved_in_favor in ('server', 'local')),
  created_at timestamptz not null default now()
);

alter table public.crm_sync_conflicts enable row level security;

drop policy if exists "Admins manage crm_sync_conflicts" on public.crm_sync_conflicts;
create policy "Admins manage crm_sync_conflicts"
  on public.crm_sync_conflicts for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

notify pgrst, 'reload schema';
