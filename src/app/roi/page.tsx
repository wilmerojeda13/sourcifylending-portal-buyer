import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel } from '@/lib/utils'
import ROITrackerClient from './ROITrackerClient'

export default async function ROIPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, assigned_program, portal_blocked, is_demo, is_admin, account_state')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <PortalLayout
      userName={profile.full_name || ''}
      programLabel={getProgramShortLabel(profile.assigned_program ?? null)}
      assignedProgram={profile.assigned_program}
      portalBlocked={profile.portal_blocked}
      isDemo={profile.is_demo}
      isAdmin={profile.is_admin}
    >
      <ROITrackerClient />
    </PortalLayout>
  )
}
