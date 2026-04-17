export const dynamic = 'force-dynamic'

import PortalLayout from '@/components/layout/PortalLayout'
import FundingResultsClient from './FundingResultsClient'
import { requirePortalPageContext } from '@/lib/business-context'

export default async function FundingResultsPage() {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/funding-results')

  const [{ data: approvals }] = await Promise.all([
    supabase
      .from('funding_approvals')
      .select('*')
      .eq('user_id', activeBusinessId)
      .order('approval_date', { ascending: false }),
  ])

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={profile?.assigned_program ?? undefined}
      notificationCount={notificationCount}
      assignedProgram={profile?.assigned_program ?? null}
      portalBlocked={profile?.portal_blocked ?? false}
      isDemo={profile?.is_demo ?? false}
      isAdmin={profile?.is_admin ?? false}
      accountState={profile?.member_status ?? 'active_member'}
      allPrograms={activePrograms}
    >
      <FundingResultsClient
        initialApprovals={approvals ?? []}
        startDate={profile?.created_at ?? null}
        assignedProgram={profile?.assigned_program ?? null}
        clientStatus={profile?.billing_status ?? null}
        initialFundingGoal={(profile as any)?.funding_goal_amount ?? null}
      />
    </PortalLayout>
  )
}
