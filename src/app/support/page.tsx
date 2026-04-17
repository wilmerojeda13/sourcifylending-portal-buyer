export const dynamic = 'force-dynamic'

import PortalLayout from '@/components/layout/PortalLayout'
import SupportInboxClient from './SupportInboxClient'
import { requirePortalPageContext } from '@/lib/business-context'

export default async function SupportPage() {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/support')

  const [messagesResult] = await Promise.all([
    supabase
      .from('support_messages')
      .select('id, subject, message, status, admin_reply, created_at, updated_at')
      .eq('user_id', activeBusinessId)
      .order('created_at', { ascending: false }),
  ])

  // Gracefully handle case where support_messages table hasn't been migrated yet
  const messages = messagesResult.error ? [] : (messagesResult.data ?? [])

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
      <SupportInboxClient
        initialMessages={messages}
        userEmail={user.email ?? ''}
      />
    </PortalLayout>
  )
}
