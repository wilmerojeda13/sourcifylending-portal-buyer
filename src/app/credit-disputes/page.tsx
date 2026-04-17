export const dynamic = 'force-dynamic'

import PortalLayout from '@/components/layout/PortalLayout'
import CreditDisputesClient from './CreditDisputesClient'
import InquiryDisputeWizard from './InquiryDisputeWizard'
import { requirePortalPageContext } from '@/lib/business-context'
import { getAccountEntitlements } from '@/lib/account-state'
import Link from 'next/link'

export default async function CreditDisputesPage() {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/credit-disputes')
  const entitlements = getAccountEntitlements(profile?.plan_tier, profile?.subscription_status, profile?.account_state)
  const isFreeFlow = entitlements.access_state === 'free_active'
  const isPaidFlow = entitlements.access_state === 'paid_active'

  const [{ data: disputes }] = await Promise.all([
    supabase
      .from('credit_disputes')
      .select('*')
      .eq('user_id', activeBusinessId)
      .neq('status', 'Deleted')
      .order('created_at', { ascending: false }),
  ])
  const { data: documents } = await supabase
    .from('documents')
    .select('id, document_type, uploaded_at')
    .eq('user_id', activeBusinessId)
    .order('uploaded_at', { ascending: false })
  const documentCount = documents?.length ?? 0

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={profile?.assigned_program ?? undefined}
      notificationCount={notificationCount}
      assignedProgram={profile?.assigned_program ?? null}
      portalBlocked={profile?.portal_blocked ?? false}
      isDemo={profile?.is_demo ?? false}
      isAdmin={profile?.is_admin ?? false}
      accountState={profile?.account_state ?? 'active_member'}
      allPrograms={activePrograms}
    >
      {isFreeFlow ? (
        <InquiryDisputeWizard
          fullName={profile?.full_name || user.email || 'Client'}
          bureauOverride={null}
        />
      ) : isPaidFlow ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-950/70 px-5 py-5 text-sm text-slate-200 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Paid AI-assisted dispute workflow</p>
              <p className="mt-1 text-slate-300">
                Upload your credit report and supporting documents first. After upload, AI can help review the materials and draft paid dispute letters.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              {[
                { step: 'Step 1', title: 'Upload credit report', body: 'Add the report you want analyzed.' },
                { step: 'Step 2', title: 'Upload supporting docs', body: 'Add statements or proof files.' },
                { step: 'Step 3', title: 'AI reviews uploads', body: 'AI reads the materials you provided.' },
                { step: 'Step 4', title: 'Build disputes', body: 'Draft letters for inquiries, collections, and other paid items.' },
              ].map((item) => (
                <div key={item.step} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">{item.step}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div className="flex-1 min-w-[220px]">
                <p className="font-semibold text-white">
                  {documentCount > 0 ? `${documentCount} uploaded document${documentCount === 1 ? '' : 's'} detected` : 'No uploaded documents detected yet'}
                </p>
                <p className="text-xs text-slate-300">
                  {documentCount > 0
                    ? 'You can continue into the paid dispute builder below.'
                    : 'Upload your report and documents in Documents before starting AI-assisted dispute preparation.'}
                </p>
              </div>
              <Link
                href="/documents"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                Go to Documents
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { title: 'Inquiries', body: 'Paid users can work on hard inquiry disputes and related items.' },
                { title: 'Collections', body: 'Paid users can build collection disputes and validation letters.' },
                { title: 'Other paid items', body: 'Paid users can use the broader dispute tools included in the program.' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
          <CreditDisputesClient initialDisputes={disputes ?? []} prospectMode={false} documentsUploadedCount={documentCount} />
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Your paid membership is inactive. Reactivate your membership in Billing to use the paid dispute tools.
        </div>
      )}
    </PortalLayout>
  )
}
