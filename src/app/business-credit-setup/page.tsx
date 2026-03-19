import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel } from '@/lib/utils'
import BusinessCreditSetupClient from './BusinessCreditSetupClient'

export const dynamic = 'force-dynamic'

export default async function BusinessCreditSetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name,assigned_program,subscription_status,portal_blocked,is_demo,is_admin')
    .eq('id', user.id)
    .single()

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
    >
      <BusinessCreditSetupClient />
    </PortalLayout>
  )
}
