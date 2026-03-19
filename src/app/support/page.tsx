export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import SupportInboxClient from './SupportInboxClient'

export default async function SupportPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const user = session.user

  const [{ data: profile }, messagesResult, { data: notifs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('support_messages')
      .select('id, subject, message, status, admin_reply, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('notifications')
      .select('id')
      .eq('user_id', user.id)
      .eq('read', false),
  ])

  // Gracefully handle case where support_messages table hasn't been migrated yet
  const messages = messagesResult.error ? [] : (messagesResult.data ?? [])

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
      <SupportInboxClient
        initialMessages={messages}
        userEmail={user.email ?? ''}
      />
    </PortalLayout>
  )
}
