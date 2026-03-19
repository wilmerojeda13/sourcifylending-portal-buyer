-- Role field on profiles
alter table public.profiles
  add column if not exists role text not null default 'client'
  check (role in ('super_admin','admin','support','client'));

-- Support assignments
create table if not exists public.support_assignments (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  assigned_to_name text,
  support_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_user_id)
);
alter table public.support_assignments enable row level security;
create policy "Admins manage support assignments"
  on public.support_assignments for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
