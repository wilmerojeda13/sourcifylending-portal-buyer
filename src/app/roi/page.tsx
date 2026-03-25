import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel } from '@/lib/utils'
import ROITrackerClient from './ROITrackerClient'

export default async function ROIPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('full_name, assigned_program, portal_blocked, is_demo, is_admin, account_state').eq('id', user.id).single(),
    supabase.from('memberships').select('program_code').eq('user_id', user.id).eq('status', 'active'),
  ])

  if (!profile) redirect('/login')

  const allPrograms = (membershipsResult?.data ?? []).map((m: { program_code: string }) => m.program_code).filter(Boolean)
  const activePrograms = allPrograms.length > 0 ? allPrograms : (profile.assigned_program ? [profile.assigned_program] : [])

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
