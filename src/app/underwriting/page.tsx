export const dynamic = 'force-dynamic'

import { logActivity } from '@/lib/activity'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import UnderwritingClient from './UnderwritingClient'
import { getProgramShortLabel } from '@/lib/utils'
import type { UserProfile } from '@/types'
import { requirePortalPageContext } from '@/lib/business-context'

export default async function UnderwritingPage() {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/underwriting')

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
  logActivity(activeBusinessId, 'underwriting_started', {
    program: profile.assigned_program,
  }).catch(() => {})

  return (
    <PortalLayout
      userName={profile.full_name || user.email || 'Client'}
      programLabel={getProgramShortLabel(profile.assigned_program)}
      notificationCount={notificationCount}
      assignedProgram={profile.assigned_program}
      portalBlocked={profile.portal_blocked}
      isDemo={profile.is_demo}
      isAdmin={profile.is_admin}
      accountState="active_member"
      allPrograms={activePrograms}
    >
      <UnderwritingClient profile={profile as UserProfile} />
    </PortalLayout>
  )
}
