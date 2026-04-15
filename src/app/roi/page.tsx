import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel } from '@/lib/utils'
import ROITrackerClient from './ROITrackerClient'
import { requirePortalPageContext } from '@/lib/business-context'

export default async function ROIPage() {
  const { activeProfile: profile, activePrograms } = await requirePortalPageContext('/roi')

  return (
    <PortalLayout
      userName={profile.full_name || ''}
      programLabel={getProgramShortLabel(profile.assigned_program ?? null)}
      assignedProgram={profile.assigned_program}
      portalBlocked={profile.portal_blocked}
      isDemo={profile.is_demo}
      isAdmin={profile.is_admin}
      allPrograms={activePrograms}
    >
      <ROITrackerClient />
    </PortalLayout>
  )
}
