# Email Campaigns V1 Deployment Runbook

This runbook covers the V1 Email Campaigns module only. It assumes the app is deployed as a Next.js project on Vercel and uses Supabase for data and AWS SES/SNS for campaign mail.

## Deployment Model

- App hosting: Vercel
- Database/auth: Supabase
- Email transport: AWS SES
- Event webhook: AWS SNS -> `POST /api/webhooks/ses-campaign`

## Required Env Vars

Set these in the Vercel project for the production environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SES_CAMPAIGN_TOPIC_ARN`

Recommended SES defaults:

- `AWS_SES_CONFIGURATION_SET`
- `AWS_SES_FROM_EMAIL`
- `AWS_SES_FROM_NAME`

Notes:

- `AWS_SES_CAMPAIGN_TOPIC_ARN` is required for the SES webhook to accept traffic.
- `AWS_SES_FROM_EMAIL` and `AWS_SES_FROM_NAME` are optional defaults, but campaign send inputs should still set a valid from address.
- The campaign send gate fails closed if `email_send_settings` is missing or `sending_enabled = false`.

## Supabase Migration Steps

Apply the campaign migrations before enabling production sends:

1. Confirm the repo is linked to the correct Supabase project.
2. Run:
   ```bash
   supabase db push
   ```
3. Verify the campaign tables, constraints, and indexes are present.
4. Verify the singleton row exists:
   - `email_send_settings.settings_key = 'default'`
   - `sending_enabled = false` until launch

If you need to inspect the result manually:

```sql
select * from public.email_send_settings;
select count(*) from public.email_campaigns;
select count(*) from public.email_campaign_recipients;
```

## AWS Setup

### SES

1. Verify the sending identity or subdomain in SES.
2. Enable DKIM for the identity.
3. Confirm SES production access is enabled.
   - If the account is still in sandbox mode, only verified recipients can receive mail.
4. Set the campaign configuration set name in `AWS_SES_CONFIGURATION_SET` if you want SES event tracking.

### SNS

1. Create an SNS topic for campaign SES events.
2. Subscribe the topic to the webhook endpoint:
   - `https://<your-production-domain>/api/webhooks/ses-campaign`
3. Allow the app to auto-confirm the SNS subscription.
4. Set `AWS_SES_CAMPAIGN_TOPIC_ARN` to the exact topic ARN.
5. Ensure SES event publishing points to the SNS topic or configuration set event destination.

## Deploy Steps

1. Apply Supabase migrations with `supabase db push`.
2. Set or confirm all production env vars in Vercel.
3. Deploy the app through the normal Vercel flow:
   - push to the production branch, or
   - run `vercel deploy --prod` if you are using CLI deploys
4. Confirm the production deployment finishes cleanly.
5. Open the admin CRM Email Campaigns page and verify it loads.

Current repo note:

- A full app build is currently blocked by an unrelated missing module in `src/app/admin/dialer/analytics/page.tsx` (`./analytics-data`).
- Do not treat that as an Email Campaigns issue; it is a separate repo blocker that must be cleared before a full green build.

## Smoke Test Steps

After deploy:

1. Open `/admin/crm/email-campaigns`.
2. Create a draft campaign.
3. Edit the draft and verify the fields save.
4. Attach one or two manual recipients.
5. Send a test email to a known inbox.
6. Start a campaign send for a small recipient set.
7. Process one small batch.
8. Confirm campaign counters update.
9. Confirm unsubscribes and suppressions show on the campaign detail page.
10. Publish a test SES event through SNS and confirm the webhook updates the campaign data.

## Staged Rollout

1. Stage first:
   - point SES/SNS to staging
   - keep `sending_enabled = false`
   - verify create/edit/test-send/batch flow
2. Limited production rollout:
   - set `sending_enabled = true`
   - send one small internal campaign first
   - watch Vercel logs and Supabase rows
3. Scale up only after the first campaign completes cleanly.

## Rollback / Kill Switch

Fastest kill switch:

1. Update the singleton row in `email_send_settings`.
2. Set `sending_enabled = false`.
3. Pause any active campaigns by setting their status to `paused` if needed.

If needed, also:

- stop calling `startEmailCampaignSend`
- stop batch processing jobs or manual batch runs
- leave the webhook in place so SES events can still be observed

## Production Launch Checklist

- `supabase db push` completed successfully
- `email_send_settings` singleton row exists
- Vercel production env vars are set
- SES identity/DKIM/production access are verified
- SNS topic and subscription are configured
- `AWS_SES_CAMPAIGN_TOPIC_ARN` matches the SNS topic
- `sending_enabled` remains `false` until the launch window
- smoke tests passed in staging or preview
- production launch campaign is ready for a small first send
