import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangle, Users, DollarSign, HeartPulse } from 'lucide-react'
import ClientManagementTable from './ClientManagementTable'

const CREDIT_ACCOUNT_TYPES = [
  '0% APR Card',
  'Business Credit Card',
  'Vendor Account',
  'Store Account',
  'Fleet Account',
  'Line of Credit',
]

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toLocaleString()}`
}

export default async function AdminOperationsPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  // Parallel fetch all data
  const [profilesRes, tasksRes, activityRes, fundingRes, assignmentsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, business_name, subscription_status, assigned_program, current_stage, progress_percentage, portal_blocked, is_demo, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('tasks').select('user_id, status'),
    supabase
      .from('activity_logs')
      .select('user_id, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('funding_approvals')
      .select('user_id, approved_amount, approved_limit, approval_type, status')
      .eq('status', 'Approved'),
    supabase.from('support_assignments').select('*'),
  ])

  const profiles = profilesRes.data ?? []
  const tasks = tasksRes.data ?? []
  const activityLogs = activityRes.data ?? []
  const fundingApprovals = fundingRes.data ?? []
  const assignments = assignmentsRes.data ?? []

  // Build per-user maps
  const taskMap = new Map<string, { completed: number; total: number }>()
  for (const t of tasks) {
    const existing = taskMap.get(t.user_id) ?? { completed: 0, total: 0 }
    existing.total++
    if (t.status === 'completed') existing.completed++
    taskMap.set(t.user_id, existing)
  }

  // Latest activity per user (logs are ordered desc)
  const activityMap = new Map<string, string>()
  for (const log of activityLogs) {
    if (!activityMap.has(log.user_id)) {
      activityMap.set(log.user_id, log.created_at)
    }
  }

  // Funding totals per user
  const fundingMap = new Map<string, number>()
  for (const f of fundingApprovals) {
    const isCreditType = CREDIT_ACCOUNT_TYPES.includes(f.approval_type)
    const value = isCreditType
      ? (f.approved_limit ?? f.approved_amount ?? 0)
      : (f.approved_amount ?? f.approved_limit ?? 0)
    fundingMap.set(f.user_id, (fundingMap.get(f.user_id) ?? 0) + Number(value))
  }

  const assignmentMap = new Map(assignments.map((a) => [a.client_user_id, a]))

  const now = Date.now()
  const DAY_MS = 86_400_000

  // Enrich clients
  const enrichedClients = profiles.map((p) => {
    const taskData = taskMap.get(p.id)
    const progress = taskData && taskData.total > 0
      ? Math.round((taskData.completed / taskData.total) * 100)
      : (p.progress_percentage ?? 0)

    const lastActivity = activityMap.get(p.id) ?? null
    const lastActivityMs = lastActivity ? new Date(lastActivity).getTime() : null
    const daysSinceActivity = lastActivityMs ? (now - lastActivityMs) / DAY_MS : null

    const joinedMs = new Date(p.created_at).getTime()
    const daysSinceJoined = (now - joinedMs) / DAY_MS

    const isActiveSubscription = ['active', 'trialing'].includes(p.subscription_status ?? '')

    let health_status: 'good' | 'needs_attention' | 'at_risk' = 'good'
    if (
      (daysSinceActivity === null || daysSinceActivity >= 7) && isActiveSubscription ||
      (progress < 10 && daysSinceJoined >= 14)
    ) {
      health_status = 'at_risk'
    } else if (
      (daysSinceActivity !== null && daysSinceActivity >= 3 && daysSinceActivity < 7) ||
      (progress < 30 && daysSinceJoined >= 7)
    ) {
      health_status = 'needs_attention'
    }

    return {
      id: p.id,
      full_name: p.full_name ?? '',
      email: p.email ?? '',
      business_name: p.business_name ?? null,
      subscription_status: p.subscription_status ?? 'inactive',
      assigned_program: p.assigned_program ?? null,
      current_stage: p.current_stage ?? null,
      progress,
      last_activity: lastActivity,
      funding_total: fundingMap.get(p.id) ?? 0,
      health_status,
      portal_blocked: p.portal_blocked ?? false,
      is_demo: p.is_demo ?? false,
      created_at: p.created_at,
    }
  })

  // Aggregate stats
  const totalFundingAllClients = enrichedClients.reduce((sum, c) => sum + c.funding_total, 0)
  const clientsAtRisk = enrichedClients.filter((c) => c.health_status === 'at_risk').length
  const clientsNeedingAttention = enrichedClients.filter((c) => c.health_status === 'needs_attention').length

  const assignmentRows = assignments.map((a) => ({
    client_user_id: a.client_user_id,
    assigned_to_name: a.assigned_to_name ?? null,
    support_notes: a.support_notes ?? null,
  }))

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Client Operations</h1>
            <p className="text-sm text-gray-500 mt-1">Client health, support assignments, and funding overview</p>
          </div>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 underline">
            ← Admin Hub
          </Link>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                <Users size={18} className="text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Total Clients</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{enrichedClients.length}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">At Risk</span>
            </div>
            <p className="text-3xl font-bold text-red-600">{clientsAtRisk}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                <HeartPulse size={18} className="text-amber-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Needs Attention</span>
            </div>
            <p className="text-3xl font-bold text-amber-600">{clientsNeedingAttention}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                <DollarSign size={18} className="text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Total Funding Approved</span>
            </div>
            <p className="text-3xl font-bold text-green-700">{formatCurrency(totalFundingAllClients)}</p>
          </div>
        </div>

        {/* Client Management Table (client component handles all filtering + interactions) */}
        <ClientManagementTable clients={enrichedClients} assignments={assignmentRows} />

      </div>
    </div>
  )
}
