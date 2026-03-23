export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel } from '@/lib/utils'
import CreditOptimizationClient from './CreditOptimizationClient'

export default async function CreditOptimizationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: notifications },
    { data: tasks },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('notifications').select('id').eq('user_id', user.id).eq('read', false),
    supabase.from('tasks').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  // Redirect non-Program-A users
  if (profile?.assigned_program && profile.assigned_program !== 'program_a') {
    redirect('/dashboard')
  }

  const isActive =
    profile?.subscription_status === 'active' ||
    profile?.subscription_status === 'trialing'

  const nextTask = tasks?.find((t) => t.status === 'pending') ?? null

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      notificationCount={notifications?.length || 0}
      assignedProgram={profile?.assigned_program}
    >
      <div className="mb-6">
        <h1 className="page-title">Personal Credit Optimization</h1>
        <p className="text-gray-500 text-sm mt-1">
          Funding readiness guidance for Program A members.
        </p>
      </div>

      <CreditOptimizationClient
        profile={{
          credit_score_range: profile?.credit_score_range ?? null,
          utilization_range: profile?.utilization_range ?? null,
          inquiry_range: profile?.inquiry_range ?? null,
          nsf_flag: profile?.nsf_flag ?? false,
          readiness_status: profile?.readiness_status ?? null,
          business_name: profile?.business_name ?? null,
        }}
        nextTask={nextTask}
        isActive={isActive}
      />

      {/* Legal disclaimer */}
      <div className="mt-8 border-t border-gray-200 pt-5 text-xs text-gray-400 leading-relaxed">
        <p>
          <strong className="text-gray-500">Important Notice:</strong> The information on this page is for
          educational and informational purposes only and constitutes <em>funding readiness guidance</em>,
          not credit repair services. SourcifyLending does not dispute items on your behalf, does not
          contact credit bureaus or creditors as your representative, and does not guarantee any improvement
          to your credit profile. Any dispute letters generated here are educational templates for your
          personal use. Always review dispute letters carefully before sending. Results vary by individual.
        </p>
      </div>
    </PortalLayout>
  )
}
