export const dynamic = 'force-dynamic'

import PortalLayout from '@/components/layout/PortalLayout'
import SettingsClient from './SettingsClient'
import { requirePortalPageContext } from '@/lib/business-context'

export default async function SettingsPage() {
  const { authUser: user, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/settings')

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={profile?.assigned_program ?? undefined}
      notificationCount={notificationCount}
      assignedProgram={profile?.assigned_program ?? null}
      portalBlocked={profile?.portal_blocked ?? false}
      isDemo={profile?.is_demo ?? false}
      isAdmin={profile?.is_admin ?? false}
      isDelegate={(profile as unknown as Record<string, unknown>)?.is_delegate as boolean ?? false}
      accountState={profile?.account_state ?? 'active_member'}
      allPrograms={activePrograms}
    >
      <SettingsClient
        initialProfile={{
          full_name: profile?.full_name ?? '',
          email: user.email ?? '',
          business_name: (profile as any)?.business_name ?? '',
          entity_type: (profile as any)?.entity_type ?? '',
          industry: (profile as any)?.industry ?? '',
          phone: (profile as any)?.phone ?? '',
        }}
        activeBusinessName={profile?.business_name ?? profile?.full_name ?? 'This business'}
        isDelegate={(profile as unknown as Record<string, unknown>)?.is_delegate as boolean ?? false}
      />
    </PortalLayout>
  )
}
