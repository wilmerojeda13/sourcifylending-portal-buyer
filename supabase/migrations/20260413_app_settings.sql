-- Create app_settings table for globally editable key/value store
create table if not exists app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- RLS: only admins can read/write
alter table app_settings enable row level security;

create policy "Admins can read app_settings"
  on app_settings for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

create policy "Admins can upsert app_settings"
  on app_settings for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Seed the initial sales script
insert into app_settings (key, value) values (
  'sales_script',
  E'Hey, is this {first_name}? Great. My name is [your name] with SourcifyLending.com. The reason I''m calling is because it looks like your business had inquired for funding in the past. Just wanted to see if you already found the funding you were seeking, or did you ever find a solution?\n\nTHE PIVOT: Well, the reason I''m reaching out is because on average, I help my clients get anywhere from $50,000 to $100,000 in 0% interest business funding—or business credit cards from places like Chase or Bank of America. Just wanted to see if you had a quick minute to run it by you and see if we''re a good fit?\n\nTHE STRATEGY:\nStep 1: You set up a free account and run the Business Analyzer to scan for any ''blind spots'' the banks look for.\nStep 2: We underwrite everything in-house without doing any hard credit inquiries, so your score is protected.\nStep 3: We determine if you''re ready to get the funding now, or if we need to address any red flags on the credit side first.\n\nDoes that sound like a better direction for you?'
) on conflict (key) do nothing;
