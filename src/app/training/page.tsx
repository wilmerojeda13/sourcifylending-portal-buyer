export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import PortalLayout from '@/components/layout/PortalLayout'
import TrainingClient from './TrainingClient'
import { requirePortalPageContext } from '@/lib/business-context'

export default async function TrainingPage() {
  const { authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/training')
  const serviceClient = await createServiceClient()

  const [videosResult] = await Promise.all([
    serviceClient
      .from('training_videos')
      .select('*')
      .eq('is_published', true)
      .order('category')
      .order('sort_order'),
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
      <TrainingClient
        userId={activeBusinessId}
        assignedProgram={profile?.assigned_program ?? null}
        videos={videosResult.data ?? []}
      />
    </PortalLayout>
  )
}
