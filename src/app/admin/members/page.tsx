import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import MembersTable from './MembersTable'

export default async function AdminMembersPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  // Load profiles + subscriptions + memberships in parallel
  const [{ data: profiles }, { data: subscriptions }, { data: allMemberships }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, business_name, subscription_status, assigned_program, current_stage, portal_blocked, is_demo, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('subscriptions')
      .select('user_id, stripe_subscription_id, stripe_customer_id, status, current_period_end'),
    supabase
      .from('memberships')
      .select('user_id, program_code, status')
      .eq('status', 'active'),
  ])

  const subMap = new Map((subscriptions ?? []).map((s) => [s.user_id, s]))

  // Build a map of user_id → active program codes
  const membershipMap = new Map<string, string[]>()
  for (const m of allMemberships ?? []) {
    if (!membershipMap.has(m.user_id)) membershipMap.set(m.user_id, [])
    membershipMap.get(m.user_id)!.push(m.program_code)
  }

  const members = (profiles ?? []).map((p) => {
    const sub = subMap.get(p.id)
    return {
      id: p.id,
      full_name: p.full_name ?? '',
      email: p.email ?? '',
      business_name: p.business_name ?? null,
      subscription_status: p.subscription_status ?? 'inactive',
      assigned_program: p.assigned_program ?? null,
      active_programs: membershipMap.get(p.id) ?? [],
      current_stage: p.current_stage ?? null,
      portal_blocked: p.portal_blocked ?? false,
      is_demo: p.is_demo ?? false,
      created_at: p.created_at,
      stripe_subscription_id: sub?.stripe_subscription_id ?? null,
      stripe_customer_id: sub?.stripe_customer_id ?? null,
      stripe_status: sub?.status ?? null,
      current_period_end: sub?.current_period_end ?? null,
    }
  })

  const stats = {
    total: members.length,
    active: members.filter((m) => m.subscription_status === 'active').length,
    trialing: members.filter((m) => m.subscription_status === 'trialing').length,
    canceled: members.filter((m) => m.subscription_status === 'canceled').length,
    inactive: members.filter((m) => m.subscription_status === 'inactive').length,
    blocked: members.filter((m) => m.portal_blocked).length,
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Membership Management</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage subscriptions, programs, and access for all members</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            >
              ← Admin Hub
            </Link>
            <a
              href="/admin/opportunities"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            >
              Opportunities →
            </a>
            <a
              href="/admin/chargeback-defense"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            >
              Chargeback Defense →
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-white' },
            { label: 'Active', value: stats.active, color: 'text-green-600' },
            { label: 'Trialing', value: stats.trialing, color: 'text-blue-600' },
            { label: 'Canceled', value: stats.canceled, color: 'text-red-500' },
            { label: 'Inactive', value: stats.inactive, color: 'text-gray-400' },
            { label: 'Blocked', value: stats.blocked, color: 'text-red-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-center shadow-sm dark:shadow-gray-900">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <MembersTable members={members} />
      </div>
    </div>
  )
}
