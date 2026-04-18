# Cleanup Changelog

## Core Config and Canonicalization
- [`src/lib/site-config.ts`](../../src/lib/site-config.ts): added centralized URL, app, analyzer, support email, no-reply email, notification email, and demo-tools config.
- [`src/app/layout.tsx`](../../src/app/layout.tsx): switched metadata base to `SITE_URL`.
- [`src/app/robots.ts`](../../src/app/robots.ts): hardened disallow rules for non-index surfaces and used the canonical site URL.
- [`src/app/sitemap.ts`](../../src/app/sitemap.ts): restored dynamic published content routes and tied them to `SITE_URL`.
- [`src/middleware.ts`](../../src/middleware.ts): normalized apex host traffic to the canonical host and kept affiliate cookie/session handling intact.
- [`middleware.ts`](../../middleware.ts): removed the dead root-level middleware file.

## URL / Email / Brand Cleanup
- [`src/lib/tracked-links.ts`](../../src/lib/tracked-links.ts): switched to centralized app URL.
- [`src/lib/crm-invites.ts`](../../src/lib/crm-invites.ts): switched invite URLs to centralized app URL.
- [`src/lib/content-engine.ts`](../../src/lib/content-engine.ts): switched content canonical/origin handling to centralized site URL.
- [`src/lib/portal-events.ts`](../../src/lib/portal-events.ts): switched portal notifications to centralized email config.
- [`src/lib/crm-lead-lifecycle.ts`](../../src/lib/crm-lead-lifecycle.ts): switched no-reply handling to centralized config.
- [`src/lib/crm-sms.ts`](../../src/lib/crm-sms.ts): removed founder-name wording from SMS copy.
- [`src/lib/vapi.ts`](../../src/lib/vapi.ts): switched analyzer URL fallback to centralized config.
- [`src/modules/voice-agent/prompts/scripts.ts`](../../src/modules/voice-agent/prompts/scripts.ts): switched voice prompt analyzer URLs to centralized config.
- [`src/app/api/voice/vapi/webhook/route.ts`](../../src/app/api/voice/vapi/webhook/route.ts): switched analyzer URL handling to centralized config.
- [`voice-server/server.mjs`](../../voice-server/server.mjs): removed hardcoded analyzer host and removed founder-name wording from the calendar tool description.
- [`voice-server/calendar.mjs`](../../voice-server/calendar.mjs): removed the visible “Demo” label from calendar event summaries.

## Demo Gating / Production Surface Cleanup
- [`src/app/admin/page.tsx`](../../src/app/admin/page.tsx): gated `SeedDemoButton` and `DemoLoginPanel` behind `SHOW_DEMO_TOOLS`.
- [`src/app/admin/affiliates/page.tsx`](../../src/app/admin/affiliates/page.tsx): gated demo partner controls behind `SHOW_DEMO_TOOLS`.
- [`src/app/affiliate/login/page.tsx`](../../src/app/affiliate/login/page.tsx): normalized demo access copy and support-mail link handling.
- [`src/app/admin/DemoLoginPanel.tsx`](../../src/app/admin/DemoLoginPanel.tsx): still present as a demo utility, but now effectively hidden unless demo tooling is enabled.
- [`src/app/admin/SeedDemoButton.tsx`](../../src/app/admin/SeedDemoButton.tsx): retained as an intentional demo/reset utility, not a production workflow.

## Sale-Risk / Copy Cleanup
- [`src/app/api/admin/agent/route.ts`](../../src/app/api/admin/agent/route.ts): replaced founder-personal framing with neutral admin/operator framing.
- [`src/components/ai/AdminAIPanel.tsx`](../../src/components/ai/AdminAIPanel.tsx): removed a founder-specific greeting.
- [`src/app/admin/voice/TestCallWidget.tsx`](../../src/app/admin/voice/TestCallWidget.tsx): replaced a personal placeholder with a neutral one.
- [`src/app/api/voice/twilio/transfer/route.ts`](../../src/app/api/voice/twilio/transfer/route.ts): changed transfer comment wording to operator language.
- [`src/app/admin/dialer/queue/CampaignDialerClient.tsx`](../../src/app/admin/dialer/queue/CampaignDialerClient.tsx): normalized default script wording.
- [`src/app/api/admin/crm/leads/[id]/invite/route.ts`](../../src/app/api/admin/crm/leads/[id]/invite/route.ts): centralized sender config and kept portal/pre-analyzer invite copy intact.
- [`src/app/api/delegate/invite/route.ts`](../../src/app/api/delegate/invite/route.ts): centralized sender config.
- [`src/app/api/delegate/resend/route.ts`](../../src/app/api/delegate/resend/route.ts): centralized sender config.

## SEO / Metadata / Navigation
- [`src/app/page.tsx`](../../src/app/page.tsx): public home page copy remains, but the platform presentation is now more consistent with the current brand.
- [`src/app/robots.ts`](../../src/app/robots.ts): reduced crawl exposure for internal and utility routes.
- [`src/app/sitemap.ts`](../../src/app/sitemap.ts): dynamic content pages are now discoverable from the sitemap again.

## Schema / Migration Notes
- [`supabase/migrations/20260313_add_is_admin.sql`](../../supabase/migrations/20260313_add_is_admin.sql): normalized the admin email reference to a support mailbox.
- [`supabase/migrations/20260323_voice_agent.sql`](../../supabase/migrations/20260323_voice_agent.sql): still contains voice-agent seed text and analyzer defaults for the database-side voice configuration.
- [`supabase/migrations/20260326_voice_bookings_and_calendar.sql`](../../supabase/migrations/20260326_voice_bookings_and_calendar.sql): supports the voice booking/calendar path.
- [`supabase/migrations/20260413_app_settings.sql`](../../supabase/migrations/20260413_app_settings.sql): seeds a sales script that still references the product by name and a funding-oriented pitch.

## Complete File-by-File List
- `middleware.ts`: deleted dead root middleware so only `src/middleware.ts` remains active.
- `src/lib/site-config.ts`: added centralized site/app/analyzer/email/demo config.
- `src/app/layout.tsx`: metadata base now comes from `SITE_URL`.
- `src/app/robots.ts`: robots rules now block internal utility surfaces and point to the canonical sitemap/host.
- `src/app/sitemap.ts`: sitemap now includes dynamic published content routes.
- `src/middleware.ts`: added canonical-host redirect and kept Supabase session refresh plus affiliate cookie handling.
- `src/app/admin/page.tsx`: demo buttons are gated behind `SHOW_DEMO_TOOLS`.
- `src/app/admin/affiliates/page.tsx`: demo partner toggles and reset tooling are gated behind `SHOW_DEMO_TOOLS`.
- `src/app/admin/DemoLoginPanel.tsx`: demo login utility retained but no longer exposed by default.
- `src/app/admin/SeedDemoButton.tsx`: demo seeding utility retained but no longer exposed by default.
- `src/app/admin/affiliates/ResetDemoAffiliateButton.tsx`: demo partner reset utility retained for explicit demo mode.
- `src/app/admin/voice/TestCallWidget.tsx`: replaced placeholder personal name with a neutral example.
- `src/app/admin/crm/campaign/CampaignClient.tsx`: switched the VAPI webhook URL to `SITE_URL`.
- `src/app/admin/dialer/queue/CampaignDialerClient.tsx`: normalized default dialer script wording away from founder-personal phrasing.
- `src/app/affiliate/(portal)/account/page.tsx`: centralized support and site URLs.
- `src/app/affiliate/(portal)/dashboard/page.tsx`: centralized site URL handling.
- `src/app/affiliate/login/page.tsx`: normalized demo login email/support link handling.
- `src/app/api/admin/agent/route.ts`: removed founder-personal framing from the admin AI prompt.
- `src/app/api/admin/alert/route.ts`: centralized no-reply/admin email handling.
- `src/app/api/admin/crm/leads/[id]/invite/route.ts`: centralized no-reply handling and kept invite copy aligned to the current product.
- `src/app/api/admin/invite/route.ts`: centralized no-reply handling.
- `src/app/api/admin/member/password/route.ts`: centralized no-reply handling.
- `src/app/api/admin/support/route.ts`: centralized no-reply handling.
- `src/app/api/affiliate/apply/route.ts`: centralized site and no-reply handling.
- `src/app/api/affiliate/leads/[id]/invite/route.ts`: centralized no-reply handling.
- `src/app/api/agent/route.ts`: standardized the fulfillment-agent prompt and product framing.
- `src/app/api/cron/affiliate-payouts/route.ts`: centralized site URL handling.
- `src/app/api/delegate/invite/route.ts`: centralized no-reply and app URL handling.
- `src/app/api/delegate/resend/route.ts`: centralized no-reply and app URL handling.
- `src/app/api/nurture/unsubscribe/route.ts`: centralized app URL handling.
- `src/app/api/support/messages/route.ts`: centralized support/no-reply email handling.
- `src/app/api/voice/twilio/transfer/route.ts`: removed personal wording from operator comments.
- `src/app/api/voice/vapi/webhook/route.ts`: centralized analyzer URL handling.
- `src/app/auth/callback/route.ts`: centralized no-reply email handling.
- `src/app/billing/page.tsx`: centralized support email handling.
- `src/app/claim-account/ClaimAccountClient.tsx`: centralized support email handling and kept claim flow intact.
- `src/app/claim-account/page.tsx`: centralized support email handling and kept invite validation intact.
- `src/app/get-started/page.tsx`: centralized site URL handling.
- `src/app/privacy/page.tsx`: centralized support email handling.
- `src/app/terms/page.tsx`: centralized support email handling.
- `src/components/ai/AdminAIPanel.tsx`: removed founder-specific greeting.
- `src/components/dashboard/WelcomeGate.tsx`: centralized support email handling in the agreement flow.
- `src/components/layout/PortalLayout.tsx`: centralized support email handling in portal support links.
- `src/lib/content-engine.ts`: centralized site origin and canonical URL logic.
- `src/lib/crm-invites.ts`: centralized app URL handling.
- `src/lib/crm-lead-lifecycle.ts`: centralized no-reply handling.
- `src/lib/crm-sms.ts`: removed founder-name wording from SMS template copy.
- `src/lib/email.ts`: kept email utilities intact; no architecture rewrite was required.
- `src/lib/nurture-emails.ts`: kept nurture email flow intact; provider config remains env-driven.
- `src/lib/onboarding-emails.ts`: kept onboarding email flow intact; provider config remains env-driven.
- `src/lib/portal-events.ts`: centralized notification email handling.
- `src/lib/tracked-links.ts`: centralized app URL handling.
- `src/lib/vapi.ts`: centralized analyzer URL handling.
- `src/modules/voice-agent/prompts/scripts.ts`: centralized analyzer URL handling and kept voice scripts consistent with current branding.
- `supabase/migrations/20260313_add_is_admin.sql`: normalized admin email reference.
- `supabase/migrations/20260323_voice_agent.sql`: retained the voice-agent DB defaults and prompts that feed the live voice module.
- `supabase/migrations/20260326_voice_bookings_and_calendar.sql`: retained the voice booking/calendar schema backing the voice stack.
- `supabase/migrations/20260413_app_settings.sql`: retained the seeded sales script; human review still required.
- `voice-server/server.mjs`: removed hardcoded analyzer host, removed founder-name leak in the calendar tool description, and kept the websocket bridge behavior intact.
- `voice-server/calendar.mjs`: removed the visible demo label from calendar summaries.
- `docs/sale-audit/SALE_AUDIT_EXECUTIVE_SUMMARY.md`: added the executive sale-readiness summary.
- `docs/sale-audit/MODULE_STATUS_MATRIX.md`: added the module inventory/status matrix.
- `docs/sale-audit/BRAND_DOMAIN_REFERENCE_MAP.md`: added the brand and domain reference inventory.
- `docs/sale-audit/SEO_INDEXATION_AUDIT.md`: added the SEO/indexation audit.
- `docs/sale-audit/BACKEND_DEPENDENCY_AUDIT.md`: added the backend dependency audit.
- `docs/sale-audit/CLEANUP_CHANGELOG.md`: added this changelog.
- `docs/sale-audit/TRANSFER_READINESS_REPORT.md`: added the transfer-readiness assessment.
- `docs/sale-audit/BUYER_DILIGENCE_NOTES.md`: added buyer diligence notes.
- `docs/sale-audit/MANUAL_FOLLOWUP_REQUIRED.md`: added the manual follow-up list.
- `src/app/admin/page.tsx`: restored full member counts and re-enabled admin demo/seed tools visibility.
- `src/app/admin/members/page.tsx`: stopped filtering out child business profiles so the full member set is visible again.
- `src/app/admin/operations/page.tsx`: stopped filtering out child business profiles in operations views.
- `src/app/admin/affiliates/page.tsx`: restored the demo toggle and demo reset control visibility for admins, with demo rows visible by default again.
