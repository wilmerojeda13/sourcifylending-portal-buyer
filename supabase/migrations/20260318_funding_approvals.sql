-- Funding Approvals table
create table if not exists public.funding_approvals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  program_type    text check (program_type in ('Program A', 'Program B', 'Program C', 'Other')),
  approval_type   text not null,  -- '0% APR Card', 'Business Credit Card', 'Vendor Account', etc.
  issuer_name     text not null,
  account_name    text,
  approved_amount numeric(12,2),   -- loan/funding amount
  approved_limit  numeric(12,2),   -- credit limit
  approval_date   date not null,
  status          text not null default 'Approved'
                    check (status in ('Approved', 'Pending', 'Declined', 'Closed')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists funding_approvals_user_id_idx on public.funding_approvals(user_id);
create index if not exists funding_approvals_status_idx  on public.funding_approvals(status);
create index if not exists funding_approvals_date_idx    on public.funding_approvals(approval_date desc);

alter table public.funding_approvals enable row level security;

create policy "funding_approvals_select_own"
  on public.funding_approvals for select using (auth.uid() = user_id);

create policy "funding_approvals_insert_own"
  on public.funding_approvals for insert with check (auth.uid() = user_id);

create policy "funding_approvals_update_own"
  on public.funding_approvals for update using (auth.uid() = user_id);

create policy "funding_approvals_delete_own"
  on public.funding_approvals for delete using (auth.uid() = user_id);
