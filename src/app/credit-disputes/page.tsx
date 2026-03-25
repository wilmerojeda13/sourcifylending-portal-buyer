export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import CreditDisputesClient from './CreditDisputesClient'

export default async function CreditDisputesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: disputes }, { data: notifs }, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('credit_disputes')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'Deleted')
      .order('created_at', { ascending: false }),
    supabase.from('notifications').select('id').eq('user_id', user.id).eq('read', false),
    supabase.from('memberships').select('program_code').eq('user_id', user.id).eq('status', 'active'),
  ])

  const allPrograms = (membershipsResult?.data ?? []).map((m: { program_code: string }) => m.program_code).filter(Boolean)
  const activePrograms = allPrograms.length > 0 ? allPrograms : (profile?.assigned_program ? [profile.assigned_program] : [])

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
      allPrograms={activePrograms}
    >
      <CreditDisputesClient initialDisputes={disputes ?? []} />
    </PortalLayout>
  )
}
