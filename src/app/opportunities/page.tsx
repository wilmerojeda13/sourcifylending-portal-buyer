export const dynamic = 'force-dynamic'

import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel } from '@/lib/utils'
import OpportunitiesClient from './OpportunitiesClient'
import UnderwritingGateBanner from '@/components/dashboard/UnderwritingGateBanner'
import type { AccountOpportunity } from '@/types'
import { requirePortalPageContext } from '@/lib/business-context'

export default async function OpportunitiesPage() {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/opportunities')

  // ── Underwriting gate — must have a current (non-expired) review to see opportunities ──
  const uwNextDue = profile?.underwriting_next_due_at
  const needsUnderwriting =
    !profile?.is_demo &&
    profile?.account_state === 'active_member' &&
    (profile?.assigned_program === 'program_a' || profile?.assigned_program === 'program_b') &&
    (!uwNextDue || new Date(uwNextDue) < new Date())

  if (needsUnderwriting) {
    return (
      <PortalLayout
        userName={profile?.full_name || user.email || 'Client'}
        programLabel={getProgramShortLabel(profile?.assigned_program)}
        notificationCount={notificationCount}
        assignedProgram={profile?.assigned_program}
        allPrograms={activePrograms}
      >
        <div className="mb-6">
          <h1 className="page-title">Funding Opportunities</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {(profile?.underwriting_review_count ?? 0) > 0
              ? 'Your monthly review is due — complete it to continue accessing opportunities.'
              : 'Complete your underwriting review to unlock opportunities.'}
          </p>
        </div>
        <UnderwritingGateBanner
          program={profile?.assigned_program ?? 'program_b'}
          reviewCount={profile?.underwriting_review_count ?? 0}
          nextDueAt={uwNextDue ?? null}
        />
      </PortalLayout>
    )
  }

  const [{ data: opportunities }, { data: rawStatuses }] = await Promise.all([
    supabase
      .from('account_opportunities')
      .select('*')
      .in('program', [profile?.assigned_program ?? 'program_a', 'all'])
      .eq('is_active', true)
      .order('priority_score', { ascending: false }),
    supabase
      .from('opportunity_user_status')
      .select('opportunity_id, status')
      .eq('user_id', activeBusinessId),
  ])

  // Build a map of opportunityId → status for fast lookup in the client
  const userStatuses: Record<string, string> = Object.fromEntries(
    (rawStatuses ?? []).map(s => [s.opportunity_id, s.status])
  )

  const isActive =
    profile?.subscription_status === 'active' ||
    profile?.subscription_status === 'trialing'

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      notificationCount={notificationCount}
      assignedProgram={profile?.assigned_program}
      allPrograms={activePrograms}
    >
      <div className="mb-6">
        <h1 className="page-title">Funding Opportunities</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Curated accounts and credit opportunities for your program.
        </p>
      </div>

      {!isActive && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 mb-6 text-sm text-amber-800 dark:text-amber-300">
          <strong>Membership inactive.</strong> Reactivate to unlock full opportunity details and application guidance.
        </div>
      )}

      <OpportunitiesClient
        opportunities={(opportunities ?? []) as AccountOpportunity[]}
        currentStage={profile?.current_stage ?? null}
        assignedProgram={profile?.assigned_program ?? null}
        isActive={isActive}
        userIndustry={profile?.industry ?? null}
        userStatuses={userStatuses}
      />

      {/* Legal disclaimer */}
      <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-5 text-xs text-gray-400 dark:text-gray-500 leading-relaxed space-y-2">
        <p>
          <strong className="text-gray-500 dark:text-gray-400">Personalization Notice:</strong> All recommendations shown on this page
          are based on the information you provided during your profile analysis and underwriting review.
          SourcifyLending logs your underwriting timestamp and the data used to generate these recommendations
          to ensure accuracy and accountability.
        </p>
        <p>
          <strong className="text-gray-500 dark:text-gray-400">Disclaimer:</strong> The funding accounts and credit opportunities listed
          above are provided for informational and educational purposes only. SourcifyLending does not guarantee
          approval, specific credit limits, or outcomes from any lender or creditor. Approval decisions are made
          solely by the respective issuer based on your creditworthiness and their criteria. These listings represent
          common opportunities used in credit-building programs and are subject to change without notice. Nothing
          on this page constitutes financial advice, credit repair services, or a promise of results.
        </p>
      </div>
    </PortalLayout>
  )
}
