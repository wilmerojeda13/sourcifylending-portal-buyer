# Manual Follow-Up Required

## External Accounts / Credentials
- Verify production `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_NO_REPLY_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `ANALYZER_URL`, and `NEXT_PUBLIC_SHOW_DEMO_TOOLS`.
- Verify Supabase project URL, anon key, service-role key, and all RLS/migration state in the target database.
- Verify Stripe secret key, webhook secret, price IDs, and customer portal configuration.
- Verify Twilio account SID, auth token, caller ID, TwiML app SID, API key SID, and API key secret.
- Verify Resend API key and sending domain.
- Verify Anthropic API key and model selection.
- Verify Google Calendar client ID, client secret, refresh token, calendar ID, and timezone.
- Verify Vapi API key, assistant ID, phone number ID, and webhook secret.
- Verify any AWS SES topic ARN or other mail webhook wiring if it is used in production.
- Verify Notion API access if the lead/analyzer sync routes are expected to run live.

## DNS / Search / Deployment
- Confirm the canonical production host and make sure DNS points to the intended deployment.
- Verify Search Console property ownership and submit the live sitemap.
- Confirm the robots file is fetched from the production host and that blocked utility routes are not being indexed.
- If IndexNow is enabled, verify the key and host in production.

## Database / Migration Decisions
- Decide whether `support@sourcifylending.com` is the correct permanent admin mailbox for the `is_admin` migration.
- Confirm that the content engine, compliance audit, and any voice booking tables are actually present in the production schema.
- Confirm that the historical seed/demo SQL files are intentionally retained and not accidentally executed in production.

## Product / Ops Decisions
- Decide whether the demo login, demo seed, and demo reset utilities should remain in the sold asset.
- Decide whether any public funding/approval language needs to be rewritten before buyer handoff.
- Decide whether the separate `voice-server` should be deployed as part of the platform handoff or documented as an external service.
- If the full workspace is being delivered, scrub local-only artifacts such as `.claude/`, `.playwright-cli/`, backup exports, and developer logs before handoff.

## Validation Caveat
- If you want a standalone TypeScript-only check, `tsconfig.json` currently includes `.next/types/**/*.ts`, so a clean `tsc --noEmit` workflow may require build output or a config adjustment.
