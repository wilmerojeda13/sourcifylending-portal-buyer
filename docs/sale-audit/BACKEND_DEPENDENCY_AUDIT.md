# Backend Dependency Audit

## Runtime Dependencies
- Supabase is the core identity and data layer. It is used through `@supabase/ssr`, `@supabase/supabase-js`, client/server helpers, middleware session refresh, and many server routes.
- Stripe is the billing layer. It is used for checkout, customer portal, subscriptions, add-ons, and webhook handling.
- Twilio is the voice/SMS layer. It is used by CRM dialer routes, voice routes, SMS routes, webhook handlers, and the standalone voice server.
- Anthropic is the main text AI provider in the app server. It is used by the admin AI route, underwriting, reports, opportunities matching, and content generation helpers.
- Resend is the email layer for invites, support, nurture, onboarding, and operational notifications.
- Google Calendar is used for booking and CRM scheduling through OAuth credentials and calendar API calls.
- Vapi and Gemini Live are used for voice workflows; the voice server bridges Twilio media streams to the Gemini Live websocket flow.
- AWS SES is present for campaign/webhook integration.
- Notion is present for lead/analyzer sync and admin sync routes.

## Tables / Schema Objects Confirmed in Migrations
- Core identity and user-state tables:
  - `profiles`
  - `subscriptions`
  - `analyzer_results`
  - `tasks`
  - `documents`
  - `reports`
  - `notifications`
  - `agreements`
  - `activity_logs`
- Lead / opportunity / funding tables:
  - `leads`
  - `account_opportunities`
  - `funding_approvals`
  - `opportunity_outcomes`
  - `opportunity_performance`
  - `funding_outcomes`
- AI / content / compliance tables:
  - `ai_credit_packs`
  - `user_purchased_ai_credits`
  - `ai_credit_purchase_transactions`
  - `ai_conversations`
  - `ai_messages`
  - `ai_memory_profiles`
  - `ai_memory_events`
  - `seo_content_pages`
  - `seo_content_topic_ideas`
  - `seo_content_updates`
  - `seo_content_metrics`
  - `seo_content_events`
  - `public_form_consent_records`
  - `public_form_security_events`
  - `signup_automation_failures`
- CRM / operations / support / affiliate tables:
  - `support_messages`
  - `portal_events`
  - `support_assignments`
  - `affiliate_applications`
  - `affiliates`
  - `affiliate_clicks`
  - `affiliate_referrals`
  - `affiliate_commissions`
  - `affiliate_settings`
  - `business_credit_profile`
  - `business_credibility_checklist`
  - `business_credit_scores`
  - `business_tradelines`
  - `underwriting_reviews`

## Auth Dependencies
- Auth is Supabase-backed end to end.
- Middleware refreshes the Supabase session on each request and captures affiliate cookies.
- Invite/claim flows depend on the `profiles.invite_token` and invite state fields.

## Billing Dependencies
- Billing routes depend on Stripe secret key, webhook secret, and configured price IDs.
- The code assumes the live billing environment has valid `STRIPE_PRICE_ID_*` values and a reachable customer portal config.

## Provider Coupling and Fragility
- The dialer and voice stack are tightly coupled to Twilio, Vapi, Google Calendar, and the standalone voice server.
- The AI surfaces are provider-coupled to Anthropic, with fallback behavior when keys are missing.
- A few routes still use env-based fallbacks that assume the correct secrets are present at runtime; if they are not, the feature degrades rather than failing cleanly.

## Schema / Integration Caveats
- `src/app/admin/compliance/ComplianceAuditClient.tsx` states the compliance audit tables are not yet in Supabase in some environments.
- `src/app/admin/content/ContentEngineClient.tsx` states the content engine tables need the schema applied before the workspace can load data.
- That means the repo contains both live code and visibly partial surfaces. A buyer will want migration proof, not just UI screenshots.

