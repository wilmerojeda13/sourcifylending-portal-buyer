alter table public.profile_business_memberships
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.profile_business_memberships
set user_id = auth_user_id
where user_id is null
  and auth_user_id is not null;

alter table public.profile_business_memberships
  alter column user_id set not null;

drop policy if exists "Users read own business memberships" on public.profile_business_memberships;
drop policy if exists "Users update own business memberships" on public.profile_business_memberships;
drop policy if exists "Admins manage business memberships" on public.profile_business_memberships;

create policy "Users read own business memberships"
  on public.profile_business_memberships
  for select
  using (auth.uid() = user_id);

create policy "Users update own business memberships"
  on public.profile_business_memberships
  for update
  using (auth.uid() = user_id);

create policy "Admins manage business memberships"
  on public.profile_business_memberships
  for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

alter table public.profile_business_memberships
  drop constraint if exists profile_business_memberships_auth_business_unique;

create unique index if not exists profile_business_memberships_user_business_unique
  on public.profile_business_memberships (user_id, business_profile_id);

drop index if exists profile_business_memberships_auth_idx;
create index if not exists profile_business_memberships_user_idx
  on public.profile_business_memberships (user_id, status, is_default);

alter table public.profile_business_memberships
  drop column if exists auth_user_id cascade;

notify pgrst, 'reload schema';
