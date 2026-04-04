import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import IntelligenceDashboard from './IntelligenceDashboard'

export const dynamic = 'force-dynamic'

export default async function IntelligencePage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const [
    { data: performance },
    { data: recentOutcomes },
    { data: eventCounts },
    { data: agentLogs },
  ] = await Promise.all([
    supabase
      .from('opportunity_performance')
      .select('*')
      .order('total_clicks', { ascending: false }),
    supabase
      .from('opportunity_outcomes')
      .select('outcome, program, opportunity_name, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('portal_events')
      .select('action_type')
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabase
      .from('agent_actions')
      .select('id, user_id, agent_name, action_type, title, status, auto_fixed, needs_review, created_at, profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  // Aggregate event counts
  const actionCounts: Record<string, number> = {}
  for (const e of eventCounts ?? []) {
    actionCounts[e.action_type] = (actionCounts[e.action_type] ?? 0) + 1
  }

  // Aggregate outcomes by program
  const byProgram: Record<string, { approved: number; denied: number; pending: number; not_applied: number }> = {}
  for (const o of recentOutcomes ?? []) {
    const prog = o.program ?? 'unknown'
    if (!byProgram[prog]) byProgram[prog] = { approved: 0, denied: 0, pending: 0, not_applied: 0 }
    byProgram[prog][o.outcome as keyof typeof byProgram[string]]++
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Intelligence Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Approval rates, performance metrics, and AI learning data</p>
          </div>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2">← Admin Hub</Link>
        </div>
        <IntelligenceDashboard
          performance={performance ?? []}
          recentOutcomes={recentOutcomes ?? []}
          actionCounts={actionCounts}
          byProgram={byProgram}
          agentLogs={agentLogs?.map(log => ({
            ...log,
            profiles: Array.isArray(log.profiles) ? log.profiles[0] : log.profiles
          })) ?? []}
        />
      </div>
    </div>
  )
}
