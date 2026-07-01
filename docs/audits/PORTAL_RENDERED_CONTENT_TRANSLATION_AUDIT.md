# Portal Rendered Content Translation Audit

- Date: 2026-07-01

## Bug Summary

Rendered content continued to display English after switching to Spanish even when the sidebar labels were already translated correctly.

This resumed audit covered both:

- Client portal rendered content already patched in the prior pass
- Client portal rendered content resumed in this pass for:
  - documents
  - credit optimization
  - opportunities
  - settings / notification preferences
- Admin portal rendered content still reported as English in these areas:
  - disputes/support-mode client view
  - funding/support-mode client view
  - training videos
  - support
  - credit optimization / operations-related client content
  - opportunities
  - ROI/funding summaries surfaced through admin support views
  - reports/activity-style admin content tied to operations/client views

## Files Inspected

- `src/lib/i18n.ts`
- `src/app/credit-disputes/CreditDisputesClient.tsx`
- `src/app/credit-disputes/InquiryDisputeWizard.tsx`
- `src/app/funding-results/FundingResultsClient.tsx`
- `src/app/training/TrainingClient.tsx`
- `src/app/support/SupportInboxClient.tsx`
- `src/app/roi/ROITrackerClient.tsx`
- `src/app/reports/page.tsx`
- `src/app/notifications/page.tsx`
- `src/app/documents/page.tsx`
- `src/app/credit-optimization/page.tsx`
- `src/app/opportunities/page.tsx`
- `src/app/opportunities/OpportunitiesClient.tsx`
- `src/app/settings/SettingsClient.tsx`
- `src/components/notifications/NotificationPreferencesCard.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/operations/page.tsx`
- `src/app/admin/operations/ClientManagementTable.tsx`
- `src/app/admin/client-view/[id]/page.tsx`
- `src/app/admin/training/page.tsx`
- `src/app/admin/training/TrainingAdminClient.tsx`
- `src/app/admin/support/page.tsx`
- `src/app/admin/support/SupportAdminClient.tsx`
- `src/app/admin/opportunities/page.tsx`
- `src/app/admin/opportunities/OpportunitiesAdmin.tsx`
- `src/app/admin-login/page.tsx`
- `src/app/admin-login/AdminLoginForm.tsx`
- `src/app/api/admin/demo-login/route.ts`
- `src/lib/training-videos.ts`
- `src/lib/supabase/server.ts`
- `.env.local`
- `supabase/seed.sql`
- `supabase/seeds/demo_dual_account.sql`

## Root Cause

The remaining translation failures were not in the sidebar toggle itself. They came from rendered components that still bypassed locale-aware display logic:

- Hardcoded English strings inside admin/client rendered page bodies
- Shared admin tables, cards, badges, modals, tooltips, and action labels still rendering raw English
- Raw stored enum, status, stage, and program values displayed directly instead of localized at render time
- Support-mode admin views using English-only labels for funding, disputes, activity, and profile metadata
- Additional client portal pages still had server-rendered headings, upload prompts, filter labels, and notification/settings copy hardcoded in English
- Existing authentication/environment blockers preventing complete live admin verification from this workspace

## Files Changed

- `src/app/credit-disputes/CreditDisputesClient.tsx`
- `src/app/funding-results/FundingResultsClient.tsx`
- `src/app/support/SupportInboxClient.tsx`
- `src/app/training/TrainingClient.tsx`
- `src/app/roi/ROITrackerClient.tsx`
- `src/app/reports/page.tsx`
- `src/app/notifications/page.tsx`
- `src/app/documents/page.tsx`
- `src/app/credit-optimization/page.tsx`
- `src/app/opportunities/page.tsx`
- `src/app/opportunities/OpportunitiesClient.tsx`
- `src/app/settings/SettingsClient.tsx`
- `src/components/notifications/NotificationPreferencesCard.tsx`
- `src/app/admin/client-view/[id]/page.tsx`
- `src/app/admin/operations/page.tsx`
- `src/app/admin/operations/ClientManagementTable.tsx`
- `src/app/admin/opportunities/page.tsx`
- `src/app/admin/opportunities/OpportunitiesAdmin.tsx`
- `src/app/admin/support/SupportAdminClient.tsx`
- `src/app/admin/training/page.tsx`
- `src/app/admin/training/TrainingAdminClient.tsx`
- `docs/audits/PORTAL_RENDERED_CONTENT_TRANSLATION_AUDIT.md`

## Translation Keys Added

- No new central dictionary keys were added in `src/lib/i18n.ts`

Display-time localization helpers and locale-aware mappings were added directly in affected rendered components where content was bypassing the shared translation dictionary.

## Commands Run

- `git status --short`
- targeted `rg` searches across admin and portal components
- targeted `eslint` on touched admin files using direct `node` execution
- targeted `eslint` on resumed client translation files using direct `node` execution
- `npm run type-check`
- `npm run lint`
- `npm run build`
- in-app browser connection and tab/session inspection

## Command Results

- targeted admin `eslint`: passed for the touched translation files
- targeted resumed client `eslint`: passed for the touched translation files
- `npm run type-check`: passed
- `npm run lint`: passed with pre-existing warnings in `src/app/billing/page.tsx` and `src/components/i18n/LanguageProvider.tsx`
- `npm run build`: passed
- full repo validation completed successfully for the requested commands after host npm execution

## Browser Verification

- In-app browser automation connected successfully
- Live browser review of the currently deployed client portal in Spanish still showed English rendered content on:
  - `/credit-optimization`
  - `/opportunities`
  - `/funding-results`
  - `/training`
  - `/support`
  - `/settings`
  - `/documents`
- Production browser snippets collected on July 1, 2026 confirmed the deployed site is still serving older untranslated rendered content in those sections
- No authenticated admin tab/session was available to automation at verification time
- Direct navigation to `/admin-login` showed `?error=not_admin&email=demo%40sourcifylending.com`, confirming the available demo login is not an admin session
- Repo audit confirmed no safe built-in seeded admin credentials in:
  - `supabase/seed.sql`
  - `supabase/seeds/demo_dual_account.sql`
- Client portal live verification shows the production deployment has not yet picked up the local translation patches from this workspace
- Full live admin verification remains blocked pending a valid admin session or secure admin credential handoff

## Remaining Risks

- Full live admin browser verification is still blocked by missing authenticated admin access from this workspace
- Some minor admin tooltip/placeholder strings may still need a final live pass after admin login, especially in opportunity-management helper text
- Production verification cannot be completed until the patch is committed, deployed, and re-tested in the live portal
