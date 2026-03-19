-- Add phone column to profiles for settings page
alter table public.profiles
  add column if not exists phone text default '';
