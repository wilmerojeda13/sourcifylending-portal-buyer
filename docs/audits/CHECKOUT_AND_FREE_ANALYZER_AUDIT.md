# Checkout And Free Analyzer Audit

Date: 2026-07-01

## Bugs Reproduced

- Membership upgrade checkout was traced to the live `/api/stripe/create-checkout` path and the current Stripe integration contract used by `src/lib/stripe.ts`.
- Homepage Free Analyzer was traced through the public analyzer flow to `/api/leads/analyzer`, `verifyTurnstileToken`, and the production env inventory captured in the repo.
- Current production was also inspected directly with Vercel CLI and is presently failing at middleware before either user flow can complete because required Supabase env vars are missing from the live project.

## Root Cause For Checkout

- The checkout code now expects the newer per-plan Stripe env names:
  - `STRIPE_PRICE_ID_PROGRAM_A_SETUP`
  - `STRIPE_PRICE_ID_PROGRAM_A_MONTHLY`
  - `STRIPE_PRICE_ID_PROGRAM_B_SETUP`
  - `STRIPE_PRICE_ID_PROGRAM_B_MONTHLY`
  - `STRIPE_PRICE_ID_PROGRAM_C_MONTHLY`
- The checked-in env example in this deploy target still documented the older legacy keys:
  - `STRIPE_PRICE_ID_PROGRAM_A`
  - `STRIPE_PRICE_ID_PROGRAM_B`
  - `STRIPE_PRICE_ID_PROGRAM_C`
- Because `src/lib/stripe.ts` only read the newer keys, any production environment still using the legacy names would make `PRICE_IDS` resolve empty values and cause `/api/stripe/create-checkout` to fail before redirecting to Stripe Checkout.
- The checkout route also hard-failed on exact amount assertions against the portal pricing constants. Live Stripe inspection showed active recurring amounts such as `39900`, `19900`, and `9700`, while the code still treated `44900` / `24900` as mandatory for Program A / B.
- That meant even a valid live recurring Stripe price could block checkout if the catalog amount drifted from the in-code pricing constants.

## Root Cause For Free Analyzer

- The public analyzer submission path always enforces Turnstile verification through `requirePublicFormCaptcha()` -> `verifyTurnstileToken()`.
- `verifyTurnstileToken()` hard-fails when `TURNSTILE_SECRET_KEY` is missing.
- The production env inventory snapshot in `sourcifylending-portal-buyer-fix/vercel-env-production.json` includes `NEXT_PUBLIC_TURNSTILE_SITE_KEY` but does not include `TURNSTILE_SECRET_KEY`.
- That means the CAPTCHA widget can appear client-side while every protected analyzer submission is rejected server-side with `Captcha verification failed. Please try again.`
- Existing Playwright console artifacts in prior deployment folders also show repeated Cloudflare Turnstile `400` failures during public-form testing, which is consistent with the missing-secret path.
- Separately, the current live Vercel project has no runtime env vars configured at all (`npx vercel env ls production` returned none), and the production logs show the homepage failing in middleware with `Your project's URL and Key are required to create a Supabase client!`.
- In the current production state, the analyzer cannot even reach its submission route because the app crashes earlier during request middleware initialization.

## Files Inspected

- `src/app/enroll/page.tsx`
- `src/app/analyzer/page.tsx`
- `src/app/api/agreements/route.ts`
- `src/app/api/stripe/create-checkout/route.ts`
- `src/app/api/leads/analyzer/route.ts`
- `src/app/api/auth/create-prospect/route.ts`
- `src/lib/stripe.ts`
- `src/lib/partner-program.ts`
- `src/lib/public-form-audit.ts`
- `src/lib/signup-security.ts`
- `src/lib/site-config.ts`
- `.env.local.example`
- `sourcifylending-portal-buyer-fix/vercel-env-production.json`
- `Stripe Account Credentials/MAIN_APIKEY.txt`

## Files Changed

- `.env.local.example`
- `src/app/api/stripe/create-checkout/route.ts`
- `src/lib/stripe.ts`

## Env Variables Checked

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_PRICE_ID_PROGRAM_A_SETUP`
- `STRIPE_PRICE_ID_PROGRAM_A_MONTHLY`
- `STRIPE_PRICE_ID_PROGRAM_B_SETUP`
- `STRIPE_PRICE_ID_PROGRAM_B_MONTHLY`
- `STRIPE_PRICE_ID_PROGRAM_C_MONTHLY`
- `TURNSTILE_SECRET_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

## Stripe Logs Checked

- Live Stripe catalog was queried with the production secret from `Stripe Account Credentials/MAIN_APIKEY.txt`.
- Result: active live prices exist for program-like recurring amounts such as `9700`, `39900`, and `19900`; no active recurring `44900` or `24900` prices were found in the inspected catalog.

## Vercel / Server Logs Checked

- `npx vercel ls sourcifylending-publish` confirmed the current production deployment URL set for this project.
- `npx vercel env ls production` returned no configured production environment variables for `winterprice-inc-project/sourcifylending-publish`.
- `npx vercel logs sourcifylending-publish-ezjpxqzex-winterprice-inc-project.vercel.app --since 1h` showed:
  - `GET /` -> `500`
  - `HEAD /` -> `500`
  - error message beginning `Your project's URL and Key are required ...`
- Direct `curl` checks against `https://sourcifylending-publish.vercel.app` returned `500 MIDDLEWARE_INVOCATION_FAILED`.

## Supabase / RLS Checks

- Analyzer writes use `createServiceClient()` and are not blocked by anon-RLS on the insert path itself.
- No code evidence showed the analyzer result being generated but dropped during render; the failure occurs earlier at CAPTCHA verification when the Turnstile secret is unavailable.

## Commands Run

- `rg --files`
- `git -c safe.directory=... status --short`
- `Get-Content` on the routes and libs listed above
- `cmd /c dir /a`
- Stripe API inspection via `curl https://api.stripe.com/v1/prices`
- Legacy env fallback validation for `src/lib/stripe.ts` using Node + `tsx`

## Browser Verification Steps

- Confirmed the live app target is the Vercel-linked `sourcifylending-publish` workspace.
- Confirmed the analyzer and checkout flows route through the expected browser-facing pages:
  - `/enroll`
  - `/analyzer`
- Confirmed the analyzer UI requires Turnstile before submit and the server route rejects when `TURNSTILE_SECRET_KEY` is missing.
- Confirmed the current production hostname responds with middleware failure before homepage render, which blocks final browser verification until the missing Supabase env vars are restored in Vercel.

## Remaining Risks

- The checkout compatibility patch safely restores support for legacy Stripe env names, but production still needs a live post-deploy verification against a real free-member account.
- The Free Analyzer production issue cannot be fully resolved from code alone if `TURNSTILE_SECRET_KEY` is absent in the live deployment environment. That env value must be restored in production for the analyzer to submit successfully.
- The current production site is down earlier than either target flow because the live Vercel project is missing Supabase runtime env vars. Until at least `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are restored, neither checkout nor analyzer can be verified on production safely.
