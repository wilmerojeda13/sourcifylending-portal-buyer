import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel } from '@/lib/utils'
import BusinessCreditSetupClient from './BusinessCreditSetupClient'
import { requirePortalPageContext } from '@/lib/business-context'

export const dynamic = 'force-dynamic'

export default async function BusinessCreditSetupPage() {
  const { activeProfile: profile, activePrograms } = await requirePortalPageContext()

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      allPrograms={activePrograms}
    >
      <BusinessCreditSetupClient />
    </PortalLayout>
  )
}
