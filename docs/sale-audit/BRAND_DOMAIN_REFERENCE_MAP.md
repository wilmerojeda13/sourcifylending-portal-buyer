# Brand / Domain Reference Map

## What Was Cleared
- The founder-name leak `Abel` was removed from source. A repo-wide search across `src`, `supabase`, and `voice-server` now returns no `\bAbel\b` hits.
- The hardcoded analyzer host `https://app.sourcifylending.com/analyzer` was removed from the standalone voice server and replaced with env-driven fallback logic.
- Host/canonical handling is now centralized through `src/lib/site-config.ts` instead of being scattered across routes and helpers.

## Intentional Brand References That Remain
- `SourcifyLending` as the product name in public site copy, portal copy, emails, voice prompts, and admin labels.
- `sourcifylending.com` defaults in `src/lib/site-config.ts` for `SITE_URL`, `APP_URL`, `SUPPORT_EMAIL`, and `NO_REPLY_EMAIL`.
- `support@sourcifylending.com` in the historical admin migration that grants admin access by email.

## Historical / Demo References Still Present
- Demo accounts and seed records still exist in:
  - [`src/app/admin/DemoLoginPanel.tsx`](../../src/app/admin/DemoLoginPanel.tsx)
  - [`src/app/api/admin/demo-login/route.ts`](../../src/app/api/admin/demo-login/route.ts)
  - [`src/app/api/admin/seed-demo/route.ts`](../../src/app/api/admin/seed-demo/route.ts)
  - [`src/app/api/admin/affiliates/seed-demo/route.ts`](../../src/app/api/admin/affiliates/seed-demo/route.ts)
  - [`supabase/seed.sql`](../../supabase/seed.sql)
  - [`supabase/seeds/demo_dual_account.sql`](../../supabase/seeds/demo_dual_account.sql)
- Demo language still exists in some CRM and affiliate workflows because those paths are intended as sample workflows, but they should not be shown as live production proof without context.

## Legacy Domains / Obsolete Host Assumptions
- The old `app.sourcifylending.com/analyzer` assumption was a real issue and is now removed from the voice server.
- Canonical host handling now flows from `SITE_URL` and middleware redirects, so apex host traffic can be normalized instead of silently drifting.

## Remaining Human Decision
- Decide whether `support@sourcifylending.com` is the correct permanent admin mailbox for the `is_admin` migration, or whether that should be re-keyed to a different operational email before handoff.

