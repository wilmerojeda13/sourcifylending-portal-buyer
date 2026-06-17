-- Restore the auth.users -> profiles auto-create trigger and backfill any
-- existing auth users that are missing a public.profiles row.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', coalesce(new.raw_user_meta_data->>'name', '')),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (
  id,
  email,
  full_name,
  feature_tier,
  billing_status,
  member_status,
  acquisition_path,
  progress_percentage,
  nsf_flag,
  portal_blocked,
  is_demo,
  created_at,
  updated_at
)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'full_name', coalesce(u.raw_user_meta_data->>'name', '')),
  'free',
  'inactive',
  'prospect',
  'self_serve',
  0,
  false,
  false,
  false,
  now(),
  now()
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

insert into public.profile_business_memberships (
  user_id,
  business_profile_id,
  role,
  status,
  is_default
)
select p.id, p.id, 'owner', 'active', true
from public.profiles p
where not exists (
  select 1
  from public.profile_business_memberships pbm
  where pbm.user_id = p.id
    and pbm.business_profile_id = p.id
);

update public.profiles
set active_business_profile_id = id
where active_business_profile_id is null;
