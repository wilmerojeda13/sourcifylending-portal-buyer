export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const user = session.user

  const [{ data: profile }, { data: notifs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
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
      isDelegate={(profile as Record<string, unknown>)?.is_delegate as boolean ?? false}
      accountState={profile?.account_state ?? 'active_member'}
    >
      <SettingsClient
        initialProfile={{
          full_name: profile?.full_name ?? '',
          email: user.email ?? '',
          business_name: profile?.business_name ?? '',
          entity_type: profile?.entity_type ?? '',
          industry: profile?.industry ?? '',
          phone: (profile as Record<string, unknown>)?.phone as string ?? '',
        }}
        isDelegate={(profile as Record<string, unknown>)?.is_delegate as boolean ?? false}
      />
    </PortalLayout>
  )
}
