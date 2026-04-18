# SEO / Indexation Audit

## Fixed
- `metadataBase` now comes from `SITE_URL` in [`src/app/layout.tsx`](../../src/app/layout.tsx), which prevents relative URL ambiguity in metadata.
- [`src/app/robots.ts`](../../src/app/robots.ts) now blocks the obvious non-index surfaces:
  - `/admin/`
  - `/api/`
  - `/auth/`
  - `/login`
  - `/sign-in`
  - `/signup`
  - `/forgot-password`
  - `/claim-account`
  - `/accept-invite`
  - `/offline-crm/`
- [`src/app/sitemap.ts`](../../src/app/sitemap.ts) now emits the static public routes and the published content-engine routes instead of suppressing dynamic content entirely.
- [`src/middleware.ts`](../../src/middleware.ts) now redirects apex-host traffic to the canonical host instead of letting host drift linger.

## Issues Found
- The content engine can generate a large volume of indexable content via `seo_content_pages`, `seo_content_metrics`, and related tables in `supabase/migrations/20260402_seo_content_engine.sql`.
- There are multiple public dynamic route families that can become thin if they are not curated:
  - `/services/[slug]`
  - `/industries/[slug]`
  - `/locations/[slug]`
  - `/comparisons/[slug]`
  - `/problems/[slug]`
  - `/partner-*/*`
  - `/portal-guides/[slug]`
  - `/answers/[slug]`
- The repo still has a lot of advisory / funding-related public copy, so the search footprint needs to be watched for wording that overpromises outcomes.
- The site still has more indexable content than a typical brochure site, so soft duplicates and low-value pages are a real risk if content generation is not disciplined.

## Remaining External Verification Needed
- Verify the canonical domain in Search Console and make sure the production deployment matches `SITE_URL`.
- Submit the sitemap in Search Console and verify that the final live sitemap resolves to the canonical host.
- Check whether the generated dynamic content pages are the pages you actually want indexed.
- If `INDEXNOW_KEY` is being used, verify the host and key in production.
- Verify that no parameterized or low-value pages are accidentally reachable from the public navigation or internal links.

