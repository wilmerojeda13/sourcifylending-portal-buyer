-- Add industry_tags to account_opportunities for personalized filtering
alter table public.account_opportunities
  add column if not exists industry_tags text[] not null default '{}';

comment on column public.account_opportunities.industry_tags is
  'Industries this opportunity is especially relevant for. Empty = relevant to all. Values match the industry field in profiles.';
