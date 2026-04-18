# Buyer Diligence Notes

## Looks Production-Grade
- Public website and portal structure are real, not placeholder-only.
- Billing, auth, affiliate, CRM, and support are all wired into the app and the database layer.
- The platform has a coherent canonical site strategy after cleanup.
- The repo now hides demo tooling behind a feature flag instead of showing it as a normal admin workflow.

## Still Partial
- Content engine and compliance/admin audit surfaces depend on schema and migrations being present in the target environment.
- The voice stack is functionally real but operationally fragile because it spans Next.js, Twilio, Vapi, Google Calendar, and a separate Node service.
- Some reports and admin workflows still assume live data and provider credentials.

## Still Needs Human Review
- Whether the historical support mailbox in the admin migration is the correct permanent owner.
- Whether demo seed/reset tooling should remain in the commercial handoff or be removed before sale.
- Whether all public funding-language claims are acceptable under the buyer’s intended positioning.

## What I Would Show a Buyer
- The build output.
- The route inventory.
- The schema migrations.
- The canonical host and robots/sitemap logic.
- The live billing/auth/CRM/affiliate integration points.

