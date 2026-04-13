-- Follow-up hardening for email campaigns V1.
-- Keeps the original migration intact in case it has already been applied.

do $$
declare
  c record;
begin
  if to_regclass('public.email_campaigns') is not null then
    for c in
      select conname
      from pg_constraint
      where conrelid = 'public.email_campaigns'::regclass
        and contype = 'c'
    loop
      execute format('alter table public.email_campaigns drop constraint %I', c.conname);
    end loop;

    execute $sql$
      alter table public.email_campaigns
      add constraint email_campaigns_status_check
      check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'paused'))
    $sql$;
  end if;

  if to_regclass('public.email_campaign_recipients') is not null then
    for c in
      select conname
      from pg_constraint
      where conrelid = 'public.email_campaign_recipients'::regclass
        and contype = 'c'
    loop
      execute format('alter table public.email_campaign_recipients drop constraint %I', c.conname);
    end loop;

    execute $sql$
      alter table public.email_campaign_recipients
      add constraint email_campaign_recipients_send_status_check
      check (
        send_status in (
          'pending',
          'queued',
          'sending',
          'sent',
          'delivered',
          'bounced',
          'complained',
          'failed',
          'unsubscribed',
          'blocked_unsubscribed',
          'blocked_suppressed'
        )
      )
    $sql$;
  end if;
end$$;

create unique index if not exists email_campaign_recipients_campaign_email_lower_unique_idx
  on public.email_campaign_recipients (campaign_id, lower(email));

create index if not exists email_campaign_recipients_email_lower_idx
  on public.email_campaign_recipients (lower(email));

create unique index if not exists email_unsubscribes_email_lower_unique_idx
  on public.email_unsubscribes (lower(email));

create unique index if not exists email_suppressions_email_type_lower_unique_idx
  on public.email_suppressions (lower(email), suppression_type);

create index if not exists email_events_provider_message_id_idx
  on public.email_events (provider_message_id)
  where provider_message_id is not null;

create index if not exists email_campaign_recipients_provider_message_id_idx
  on public.email_campaign_recipients (provider_message_id)
  where provider_message_id is not null;

create index if not exists email_events_email_lower_idx
  on public.email_events (lower(email));

alter table public.email_send_settings
  add column if not exists settings_key text not null default 'default';

alter table public.email_send_settings
  drop constraint if exists email_send_settings_singleton_key_check;

alter table public.email_send_settings
  add constraint email_send_settings_singleton_key_check
  check (settings_key = 'default');

create unique index if not exists email_send_settings_settings_key_idx
  on public.email_send_settings (settings_key);

insert into public.email_send_settings (settings_key, daily_send_cap, per_campaign_send_cap, sending_enabled)
values ('default', 500, 100, false)
on conflict do nothing;

notify pgrst, 'reload schema';
