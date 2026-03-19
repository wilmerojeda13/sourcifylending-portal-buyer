export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import FundingResultsClient from './FundingResultsClient'

export default async function FundingResultsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')
  const user = session.user

  const [{ data: profile }, { data: approvals }, { data: notifs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('funding_approvals')
      .select('*')
      .eq('user_id', user.id)
      .order('approval_date', { ascending: false }),
    supabase.from('notifications').select('id').eq('user_id', user.id).eq('read', false),
  ])

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={profile?.assigned_program ?? undefined}
      notificationCount={notifs?.length ?? 0}
      assignedProgram={profile?.assigned_program ?? null}
      portalBlocked={profile?.portal_blocked ?? false}
      isDemo={profile?.is_demo ?? false}
      isAdmin={profile?.is_admin ?? false}
      accountState={profile?.account_state ?? 'active_member'}
    >
      <FundingResultsClient
        initialApprovals={approvals ?? []}
        startDate={profile?.created_at ?? null}
        assignedProgram={profile?.assigned_program ?? null}
      />
    </PortalLayout>
  )
}
