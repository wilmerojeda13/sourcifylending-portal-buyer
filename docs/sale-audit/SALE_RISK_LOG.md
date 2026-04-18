# Sale Risk Log

## Fixed
- Founder-name leak in tracked source: removed from `src`, `supabase`, and `voice-server`.
- Hardcoded canonical host drift: centralized in `src/lib/site-config.ts`, `src/app/layout.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`, and `src/middleware.ts`.
- Demo tooling exposure: gated behind `SHOW_DEMO_TOOLS`.
- Voice-server analyzer host hardcode: removed and replaced with env-driven fallback.

## Partially Fixed
- Demo and seed assets still exist and are intentionally retained for now.
- Historical migrations still contain product-specific seed data and operational assumptions.
- Content engine and compliance surfaces still depend on the target database schema being present.
- Dialer/voice stack is still highly coupled to Twilio, Vapi, Gemini, Google Calendar, and separate service runtime.
- Public marketing language still leans into funding/advisory positioning and should be reviewed before buyer handoff.

## Unresolved
- External account handoff: Supabase, Stripe, Twilio, Resend, Anthropic, Google, Vapi, Notion, and any SES wiring.
- DNS / canonical domain / Search Console verification.
- Production database parity for all admin and content tables.
- Decide whether demo tooling should remain in the asset after sale.
- Decide whether the historical support mailbox in the admin migration is the correct permanent admin contact.
- Decide whether the standalone `voice-server` is part of the handoff package or an external companion service.

