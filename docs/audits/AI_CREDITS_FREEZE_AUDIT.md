# AI Credits Freeze Audit

Date: 2026-06-23

## Bug summary

In the member/client portal, clicking the "AI Credits" navigation item opens `/ai-usage`. After interacting with the AI Credits content, subsequent sidebar/menu clicks can stop navigating. A live browser test reproduced the failure on production: the next sidebar click stayed on `/ai-usage` and failed because the link element was detached during the click.

## Exact files inspected

- `src/components/layout/PortalLayout.tsx`
- `src/app/ai-usage/page.tsx`
- `src/app/api/ai-usage/route.ts`
- `src/app/api/ai-credits/purchase/route.ts`
- `src/lib/use-business-context.ts`
- `src/lib/business-context.ts`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/app/api/portal/business-context/route.ts`
- `src/middleware.ts`
- `src/components/notifications/NotificationRuntime.tsx`
- `next.config.mjs`
- `package.json`

## Root cause

Live DevTools hit testing did not find a full-page invisible overlay, modal backdrop, sticky header, or AI Credits table wrapper covering the sidebar. At the failed sidebar click coordinates, `document.elementsFromPoint()` resolved to the actual sidebar link.

The failure pattern was `Element is not connected`, which means the target link was being remounted during the click. The client AI Credits page was doing extra profile/membership loading and state updates while the portal shell was also loading business context. That made the page prone to render/remount churn exactly after opening `/ai-usage`.

## Files changed

- `src/lib/use-business-context.ts`
- `src/app/ai-usage/page.tsx`
- `src/components/layout/PortalLayout.tsx`
- `docs/audits/AI_CREDITS_FREEZE_AUDIT.md`

## Why the fix works

- `useBusinessContext()` now memoizes `activePrograms` and `businesses`, so consumers do not receive new array references unless the underlying context changes.
- The AI Credits page now uses the shared business context for profile/program state instead of running its own duplicate profile and membership queries.
- The AI Credits page guards `setActivePrograms()` with shallow equality, so unchanged program lists do not enqueue another state update.
- `/api/ai-usage` and Stripe-return polling failures are now caught and rendered as controlled error UI instead of leaving the page in a stuck loading state.
- The AI Credits content wrapper and portal layout now use isolated stacking contexts, while sidebar/header/mobile nav keep a higher z-index than page content.

## Verification steps performed

- Live production browser test before patch:
  - Opened member/client `/dashboard`.
  - Clicked `AI Credits`.
  - Clicked inside the AI Credits content.
  - Clicked `Dashboard`.
  - Reproduced the failure: URL stayed on `/ai-usage` and browser automation reported `Element is not connected`.
  - Confirmed `elementsFromPoint()` at the sidebar click returned the actual sidebar link, not an overlay.
- Inspected fixed, absolute, sticky, high-z-index, and pointer-events layers around the client AI Credits page.
- Ran `npm run type-check`.
- Ran `npm run lint`.
- Ran `npm run build`.

## Commands run

- `rg -n "AI Credits|ai-usage|useBusinessContext|activePrograms|setActivePrograms|useEffect" src/app src/components src/lib`
- `Get-Content -Path src/app/ai-usage/page.tsx`
- `Get-Content -Path src/lib/use-business-context.ts`
- `Get-Content -Path src/components/layout/PortalLayout.tsx`
- `npm run type-check`
- `npm run lint`
- `npm run build`
- In-app browser live test against `https://www.sourcifylending.com/dashboard` and `https://www.sourcifylending.com/ai-usage`

## Remaining risks

Production must be retested after deployment because the pre-deploy live site still contains the old code path.
