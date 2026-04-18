# Sale Audit Executive Summary

## What I Found
- The repo is not a single app. It is a bundled platform with a public site, analyzer, portal, docs/reports/funding-result flows, CRM, admin hub, dialer, voice modules, affiliate system, billing, support, content/SEO engine, and auth/onboarding flows.
- The codebase had real sale-readiness issues: founder-name leakage, demo tooling exposed in admin paths, hardcoded canonical host assumptions, stale host references, and a few schema-dependent modules that are visibly partial until the database migrations are applied.
- The platform also had a lot of external-provider coupling: Supabase, Stripe, Twilio, Vapi, Anthropic, Resend, Google Calendar, Google Gemini/GenAI, AWS SES, and Notion.

## What I Fixed
- Centralized site, app, analyzer, and email defaults in [`src/lib/site-config.ts`](../../src/lib/site-config.ts).
- Fixed canonical/SEO plumbing in [`src/app/layout.tsx`](../../src/app/layout.tsx), [`src/app/robots.ts`](../../src/app/robots.ts), [`src/app/sitemap.ts`](../../src/app/sitemap.ts), and [`src/middleware.ts`](../../src/middleware.ts).
- Removed the dead root middleware file and kept the active middleware in `src/middleware.ts`.
- Removed live founder-name leaks from source, including the voice server.
- Gated demo utilities behind `SHOW_DEMO_TOOLS` so they are not casually exposed in the admin UI.
- Normalized the standalone `voice-server` analyzer URL off the hardcoded `app.sourcifylending.com` host.

## What Still Looks Risky
- Demo and seed tooling still exists in the repo, even though it is now gated or clearly historical.
- A few historical migrations and seed files still contain embedded demo credentials and old operational assumptions.
- Some modules are schema-dependent and will not present as production-grade until the matching Supabase objects exist in the target environment.
- External platform handoff is still required for DNS, Search Console, Supabase, Stripe, Twilio, Resend, Anthropic, Google, Vapi, and any live voice/campaign accounts.
- `tsconfig.json` still includes `.next/types/**/*.ts`, so a raw `tsc --noEmit` workflow is not the cleanest standalone validation path.

## Bottom Line
- This now presents more credibly as a transferable software asset than it did before cleanup.
- The product reads as a bundled SaaS / operating platform, not a founder-tied service prototype.
- It still carries diligence risk because of demo artifacts, historical migrations, and external account dependencies, but the biggest sale-harming leaks were reduced.
