-- ─────────────────────────────────────────────────────────────────────────────
-- Program B Tables: Business Credit Profile + Credibility Checklist + Monitoring
-- ─────────────────────────────────────────────────────────────────────────────

-- Business Credit Bureau Registration Profile
create table if not exists public.business_credit_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- D&B
  duns_number text,
  duns_status text not null default 'not_started' check (duns_status in ('not_started','pending','registered','verified')),
  duns_date date,

  -- Experian Business
  experian_status text not null default 'not_started' check (experian_status in ('not_started','pending','registered','verified')),
  experian_date date,
  experian_score int,

  -- Equifax Business
  equifax_status text not null default 'not_started' check (equifax_status in ('not_started','pending','registered','verified')),
  equifax_date date,
  equifax_score int,

  -- Nav Business Credit
  nav_status text not null default 'not_started' check (nav_status in ('not_started','pending','registered','verified')),
  nav_date date,

  -- PAYDEX
  paydex_score int,
  paydex_date date,

  -- Intelliscore Plus (Experian)
  intelliscore int,
  intelliscore_date date,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id)
);

alter table public.business_credit_profile enable row level security;
create policy "Users manage own business credit profile"
  on public.business_credit_profile for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- Business Credibility Checklist (one row per checklist item per user)
create table if not exists public.business_credibility_checklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  is_complete boolean not null default false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id, item_key)
);

alter table public.business_credibility_checklist enable row level security;
create policy "Users manage own credibility checklist"
  on public.business_credibility_checklist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- Business Credit Score History
create table if not exists public.business_credit_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bureau text not null check (bureau in ('dnb','experian','equifax','nav')),
  score_type text not null, -- paydex, intelliscore, delinquency, etc.
  score_value int not null,
  score_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.business_credit_scores enable row level security;
create policy "Users manage own business scores"
  on public.business_credit_scores for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- Business Tradelines
create table if not exists public.business_tradelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creditor_name text not null,
  account_type text not null, -- vendor, credit_card, line_of_credit, etc.
  credit_limit numeric,
  balance numeric,
  payment_status text not null default 'current' check (payment_status in ('current','late_30','late_60','late_90','charge_off','paid')),
  date_opened date,
  reporting_bureaus text[] default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_tradelines enable row level security;
create policy "Users manage own business tradelines"
  on public.business_tradelines for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
