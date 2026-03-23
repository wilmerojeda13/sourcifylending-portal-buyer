export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/activity'
import PortalLayout from '@/components/layout/PortalLayout'
import UnderwritingClient from './UnderwritingClient'
import { getProgramShortLabel } from '@/lib/utils'
import type { UserProfile } from '@/types'

export default async function UnderwritingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // ── Access rules ──────────────────────────────────────────────────────────
  // Prospects have no underwriting
  if (!profile || profile.account_state === 'prospect') redirect('/dashboard')

  // Program C skips underwriting
  if (profile.assigned_program === 'program_c') redirect('/dashboard')

  // No program assigned yet
  if (!profile.assigned_program) redirect('/dashboard')

  // Review is current (next_due_at is set and still in the future) — send to dashboard
  if (
    profile.underwriting_next_due_at &&
    new Date(profile.underwriting_next_due_at) > new Date()
  ) {
    redirect('/dashboard')
  }

  // Only program_a and program_b active_members reach this point

  // Log that underwriting was started (fire-and-forget)
  logActivity(user.id, 'underwriting_started', {
    program: profile.assigned_program,
  }).catch(() => {})

  const notifCount = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false)

  return (
    <PortalLayout
      userName={profile.full_name || user.email || 'Client'}
      programLabel={getProgramShortLabel(profile.assigned_program)}
      notificationCount={notifCount.count ?? 0}
      assignedProgram={profile.assigned_program}
      portalBlocked={profile.portal_blocked}
      isDemo={profile.is_demo}
      isAdmin={profile.is_admin}
      accountState="active_member"
    >
      <UnderwritingClient profile={profile as UserProfile} />
    </PortalLayout>
  )
}
