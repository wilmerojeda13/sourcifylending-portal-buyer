# OpenAI LLM Connection Audit

Date: 2026-06-23

## Bug Summary

Portal AI routes were wired to Anthropic/Claude models and `ANTHROPIC_API_KEY`. Production logs on 2026-06-23 showed `/api/agent` returning the generic unavailable message while logging `Agent error: ANTHROPIC_API_KEY is not configured`, so the deployed AI chat had no active LLM provider.

## Existing AI Provider Found

- Active broken provider: Anthropic via `@anthropic-ai/sdk`
- Existing installed provider: OpenAI via `openai`
- Other AI systems not changed: VAPI/OpenAI voice configuration, Gemini live voice bridge, external AI attribution tracking

## Broken Files/Routes Found

- `src/app/api/agent/route.ts`
- `src/app/api/admin/agent/route.ts`
- `src/app/api/documents/analyze/route.ts`
- `src/app/api/chatbot/messages/route.ts`
- `src/app/api/nav-sync/route.ts`
- `src/app/api/opportunities/match/route.ts`
- `src/app/api/reports/route.ts`
- `src/app/api/underwriting/route.ts`
- `src/lib/content-engine.ts`
- Admin/UI references in `src/app/admin/ai-controls/page.tsx`, `src/components/ai/AdminAIPanel.tsx`, and `src/components/ai/GlobalAIPanel.tsx`

## Root Cause

The production AI paths depended on Anthropic SDK calls and Anthropic model names, but the deployment did not have a working Anthropic provider configuration. `/api/agent` checked `ANTHROPIC_API_KEY` before any OpenAI call existed and returned the same generic maintenance response for provider failures, which hid the actual root cause from the browser.

## Files Changed

- `.env.local.example`
- `package.json`
- `package-lock.json`
- `src/lib/openai.ts`
- `src/app/api/agent/route.ts`
- `src/app/api/admin/agent/route.ts`
- `src/app/api/documents/analyze/route.ts`
- `src/app/api/chatbot/messages/route.ts`
- `src/app/api/nav-sync/route.ts`
- `src/app/api/opportunities/match/route.ts`
- `src/app/api/reports/route.ts`
- `src/app/api/underwriting/route.ts`
- `src/lib/content-engine.ts`
- `src/lib/underwriting-scorer.ts`
- `src/app/admin/ai-controls/page.tsx`
- `src/components/ai/AdminAIPanel.tsx`
- `src/components/ai/GlobalAIPanel.tsx`

## Env Vars Required

- `OPENAI_API_KEY` required server-side
- `OPENAI_MODEL` optional; defaults to `gpt-4o-mini`
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are deprecated for portal AI routes

## How OpenAI Was Connected

A server-only OpenAI helper was added at `src/lib/openai.ts`. It reads `OPENAI_API_KEY`, resolves `OPENAI_MODEL`, creates the OpenAI client on the server, exposes a small text-generation wrapper, classifies provider failures into diagnostic codes, and provides JSON cleanup helpers for routes that preserve existing JSON response contracts.

## Why The Fix Works

The active portal AI routes now call OpenAI from server-side API routes only. Frontend response shapes are preserved: chat routes still return `message` or chatbot `response/extractedData`, document analysis still returns parsed analysis JSON, and tool-enabled admin AI still returns `{ message }`. Credit checks still happen before provider calls, and credit deduction still happens only after successful AI completion.

Provider failures now log server-side diagnostic codes while keeping a friendly user message:

- `OPENAI_API_KEY_MISSING`
- `OPENAI_AUTH_FAILED`
- `OPENAI_MODEL_NOT_FOUND`
- `OPENAI_RATE_LIMITED`
- `OPENAI_REQUEST_FAILED`

## Commands Run

- `rg --files`
- `rg -n "Anthropic|anthropic|ANTHROPIC|Claude|claude|OPENAI|OpenAI|openai|AI_" -S .`
- `npm uninstall @anthropic-ai/sdk`
- `npm run typecheck`
- `npm run lint`
- `npm run build` (timed out twice: 184s and 364s)
- `npm test` (failed because Node did not expand `tests/**/*.test.ts` on this Windows shell)
- `node --import tsx --test <resolved test files>`
- `npx tsx -` missing-key helper check
- `rg -n "NEXT_PUBLIC_OPENAI|OPENAI_API_KEY" src public .next/static -S`
- `git fetch origin`
- `git worktree add -b codex/openai-llm-production-fix ... origin/main`
- `npm install --ignore-scripts`
- `npm install --package-lock-only --ignore-scripts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Vercel runtime log queries for `/api/agent`, `ANTHROPIC`, and `OPENAI`

## Verification Steps Performed

- Verified production deployment `dpl_5JEQ6m43bV1K3fxUHevrKAYvXFeu` was still running Anthropic before this fix.
- Verified production logs contained `Agent error: ANTHROPIC_API_KEY is not configured`.
- Deployed commit `5980336bce59da0b9fe50b910b2bc11d09541281` to production deployment `dpl_EgBLddXF71gp2bTVpgirkDiVDm5n`.
- Verified production aliases include `https://app.sourcifylending.com`, `https://www.sourcifylending.com`, and `https://admin.sourcifylending.com`.
- Verified TypeScript passes with `npm run typecheck`.
- Verified lint passes with `npm run lint`.
- Verified production build passes with `npm run build`.
- Verified missing OpenAI key throws a controlled server-side configuration error.
- Verified local `.env*` files do not contain a real `OPENAI_API_KEY`.
- Verified no `NEXT_PUBLIC_OPENAI_API_KEY` exposure exists in source.
- Verified active Anthropic SDK imports were removed from source.
- Verified `@anthropic-ai/sdk` was removed from `package.json`.
- Verified the broad test suite runs when file paths are expanded manually, but it still has pre-existing CRM/search/workflow failures unrelated to the provider patch.
- Logged into the production client portal as the seeded demo client and opened the AI widget.
- Sent `hello` through the floating AI widget and full `/agent` page.
- Verified both requests reached `/api/agent` on the new deployment and returned the controlled friendly unavailable message.
- Verified production runtime logs for both requests show `hasOpenAIKey: false`, `configuredModel: 'gpt-4o-mini'`, and `OPENAI_API_KEY_MISSING`.
- Verified AI Credits page loads without freezing.
- Observed a separate production Supabase/RLS issue while testing `/api/agent/conversation`: `new row violates row-level security policy for table "ai_messages"`.

## Remaining Risks

- Production `OPENAI_API_KEY` is missing at runtime. The Vercel Production environment must be updated with a valid `OPENAI_API_KEY` and redeployed/restarted before real OpenAI responses can succeed.
- `OPENAI_MODEL` is not present at runtime; the app is using the safe default `gpt-4o-mini`.
- `/api/agent/conversation` has an `ai_messages` RLS insert failure that affects conversation persistence separately from the LLM provider call.
- A real OpenAI request could not be completed locally because no local env file contains `OPENAI_API_KEY`.
- External attribution references to `claude.ai` and `utm_source=claude` remain intentionally active because they track inbound AI referral sources, not the portal LLM provider.
