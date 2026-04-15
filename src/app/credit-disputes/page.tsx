export const dynamic = 'force-dynamic'

import PortalLayout from '@/components/layout/PortalLayout'
import CreditDisputesClient from './CreditDisputesClient'
import { requirePortalPageContext } from '@/lib/business-context'

export default async function CreditDisputesPage() {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/credit-disputes')
  const prospectMode = profile?.account_state === 'prospect'

  const [{ data: disputes }] = await Promise.all([
    supabase
      .from('credit_disputes')
      .select('*')
      .eq('user_id', activeBusinessId)
      .neq('status', 'Deleted')
      .order('created_at', { ascending: false }),
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
      accountState={profile?.account_state ?? 'active_member'}
      allPrograms={activePrograms}
    >
      <CreditDisputesClient initialDisputes={disputes ?? []} prospectMode={prospectMode} />
    </PortalLayout>
  )
}
