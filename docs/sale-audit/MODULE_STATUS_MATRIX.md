# Module Status Matrix

| Module | Confirmed in code? | Confirmed integrated? | Status | Main dependencies | Main sale-risk |
|---|---:|---:|---|---|---|
| Public website | Yes | Yes | Production-grade | App Router pages, content engine, metadata, sitemap, robots | Marketing copy is advisory/funding adjacent and still brand-specific |
| Analyzer | Yes | Yes | Production-grade | Supabase, Turnstile, content/SEO links, analyzer API | Public-facing compliance copy and lead capture logic need external verification |
| Client portal / dashboard | Yes | Yes | Production-grade | Supabase auth, profiles, tasks, documents, reports, notifications | Relies on profile/account-state schema and invites |
| Documents / reports / funding results / progress | Yes | Yes | Partial | `documents`, `reports`, `tasks`, `portal_events`, AI analysis | Some UI paths are schema-dependent and can fail if migrations are missing |
| AI fulfillment agent | Yes | Yes | Production-grade | Anthropic, Supabase, portal context, agent routes | Provider-coupled; behavior depends on API key and model availability |
| Admin hub | Yes | Yes | Production-grade | Supabase service role, admin routes, activity, members, operations | Demo utilities existed in the admin surface and had to be gated |
| CRM | Yes | Yes | Production-grade | `profiles`, `leads`, `tasks`, `activity_logs`, `crm_*` routes, Google Calendar, Twilio, Resend | Large feature surface with overlapping dialer/voice logic and demo sales language |
| Dialer | Yes | Yes | Fragile | Twilio, Vapi, CRM dialer routes, call logs, session/token/TwiML flows | High provider coupling and multiple legacy code paths |
| AI voice modules | Yes | Yes | Fragile | Twilio, Vapi, Gemini Live server, Google Calendar, Supabase | Standalone `voice-server` is external to Next.js and must be deployed separately |
| Affiliate / partner system | Yes | Yes | Production-grade | `affiliates`, `affiliate_*` tables, payout routes, training/resources | Demo partner data still exists and can distort diligence if shown |
| Content / SEO engine | Yes | Yes | Partial | `seo_content_*` tables, canonical paths, IndexNow hooks, AI drafting | Schema-dependent and content volume can create thin-page/indexation risk |
| Auth / onboarding / claim flows | Yes | Yes | Production-grade | Supabase auth, invite routes, callback route, onboarding emails | Invite/claim flows depend on correct site URLs and email delivery |
| Billing / Stripe | Yes | Yes | Production-grade | Stripe SDK, checkout/portal/webhook routes, billing pages | Requires live Stripe secrets, price IDs, and webhook config |
| Support / notifications | Yes | Yes | Production-grade | Resend, support messages, portal events, notification prefs | Requires valid email provider config and admin mailbox ownership |
| Compliance / chargeback defense | Yes | Partial | Partial | `agreements`, `activity_logs`, `subscriptions`, `documents`, `reports` | Audit tables and supporting schema must exist in target DB |
| Offline CRM / legacy dialer | Yes | Partial | Fragile | `offline-crm` routes, dialer backfills, Twilio/CRM helpers | Reads like legacy cutover code and should be treated carefully |
| Demo / seed utilities | Yes | No | Mock-only | `seed-demo`, `demo-login`, seed SQL, demo account fixtures | Should not be presented as production functionality |

