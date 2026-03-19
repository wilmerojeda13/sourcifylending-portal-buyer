import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, CheckCircle, Clock, XCircle, AlertOctagon, TrendingUp, Shield, FileText, BarChart2, Zap, HeartPulse } from 'lucide-react'
import { getProgramShortLabel } from '@/lib/utils'
import dynamic from 'next/dynamic'
import SeedDemoButton from './SeedDemoButton'
const DemoLoginPanel = dynamic(() => import('./DemoLoginPanel'), { ssr: false })

export default async function AdminHubPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  // Parallel data fetch
  const [{ data: profiles }, { data: recentActivity }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, business_name, subscription_status, assigned_program, portal_blocked, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('activity_logs')
      .select('id, user_id, event_type, event_data, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const all = profiles ?? []

  const stats = {
    total: all.length,
    active: all.filter((p) => p.subscription_status === 'active').length,
    trialing: all.filter((p) => p.subscription_status === 'trialing').length,
    inactive: all.filter((p) => p.subscription_status === 'inactive').length,
    canceled: all.filter((p) => p.subscription_status === 'canceled').length,
    blocked: all.filter((p) => p.portal_blocked).length,
    program_a: all.filter((p) => p.assigned_program === 'program_a').length,
    program_b: all.filter((p) => p.assigned_program === 'program_b').length,
    program_c: all.filter((p) => p.assigned_program === 'program_c').length,
    no_program: all.filter((p) => !p.assigned_program).length,
  }

  const recentSignups = all.slice(0, 10)

  const navCards = [
    {
      href: '/admin/members',
      label: 'Members',
      desc: 'Manage subscriptions, programs, and access',
      icon: Users,
      color: 'bg-blue-600',
      count: stats.total,
    },
    {
      href: '/admin/opportunities',
      label: 'Opportunities',
      desc: 'Control account opportunities shown to clients',
      icon: TrendingUp,
      color: 'bg-green-600',
    },
    {
      href: '/admin/chargeback-defense',
      label: 'Chargeback Defense',
      desc: 'Manage dispute documentation and responses',
      icon: Shield,
      color: 'bg-amber-600',
    },
    {
      href: '/admin/ai-controls',
      label: 'AI Controls',
      desc: 'Manage AI credit limits, action costs, and usage analytics',
      icon: Zap,
      color: 'bg-purple-600',
    },
    {
      href: '/admin/operations',
      label: 'Client Operations',
      desc: 'Health status, support assignments, and funding tracker',
      icon: HeartPulse,
      color: 'bg-rose-600',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Super admin control panel — {user.email}</p>
          </div>
          <Link
            href="/dashboard"
            className="shrink-0 text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            ← Member Dashboard
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Members', value: stats.total, color: 'text-gray-900', icon: Users },
            { label: 'Active', value: stats.active, color: 'text-green-600', icon: CheckCircle },
            { label: 'Trialing', value: stats.trialing, color: 'text-blue-600', icon: Clock },
            { label: 'Inactive', value: stats.inactive, color: 'text-gray-400', icon: XCircle },
            { label: 'Canceled', value: stats.canceled, color: 'text-red-500', icon: XCircle },
            { label: 'Blocked', value: stats.blocked, color: 'text-red-700', icon: AlertOctagon },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 px-4 py-4 shadow-sm text-center">
              <Icon size={18} className={`mx-auto mb-1.5 ${color}`} />
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">{label}</div>
            </div>
          ))}
        </div>

        {/* Program Breakdown + Nav Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Program Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart2 size={18} className="text-green-600" /> Program Breakdown
            </h2>
            <div className="space-y-3">
              {[
                { program: 'program_a', count: stats.program_a },
                { program: 'program_b', count: stats.program_b },
                { program: 'program_c', count: stats.program_c },
                { program: null, count: stats.no_program },
              ].map(({ program, count }) => {
                const label = program ? getProgramShortLabel(program) : 'No Program'
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
                return (
                  <div key={program ?? 'none'}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{label}</span>
                      <span className="text-sm font-bold text-gray-900">{count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div
                        className={`h-2 rounded-full ${program ? 'bg-green-500' : 'bg-gray-300'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Admin Nav Cards + Seed */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
            {navCards.map(({ href, label, desc, icon: Icon, color, count }) => (
              <Link
                key={href}
                href={href}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-gray-300 transition-all group"
              >
                <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon size={20} className="text-white" />
                </div>
                <div className="font-bold text-gray-900 group-hover:text-green-700 transition-colors">
                  {label}
                  {count !== undefined && (
                    <span className="ml-2 text-xs font-medium text-gray-400">({count})</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{desc}</p>
              </Link>
            ))}
            <SeedDemoButton />
            <DemoLoginPanel />
          </div>
        </div>

        {/* Recent Signups */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Users size={18} className="text-blue-600" /> Recent Signups
            </h2>
            <Link href="/admin/members" className="text-sm text-green-600 hover:text-green-700 font-medium">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentSignups.map((p) => (
              <Link
                key={p.id}
                href={`/admin/members/${p.id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-gray-600">
                    {(p.full_name || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.full_name || 'Unknown'}</p>
                  <p className="text-xs text-gray-400 truncate">{p.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.portal_blocked && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full uppercase">
                      Blocked
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                    p.subscription_status === 'active' ? 'bg-green-100 text-green-700' :
                    p.subscription_status === 'trialing' ? 'bg-blue-100 text-blue-700' :
                    p.subscription_status === 'canceled' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {p.subscription_status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
            {recentSignups.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">No members yet</div>
            )}
          </div>
        </div>

        {/* Recent Activity Log */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-gray-500" /> Recent Activity
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(recentActivity ?? []).map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                <div className="w-2 h-2 bg-green-400 rounded-full mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-gray-700 capitalize">
                    {log.event_type.replace(/_/g, ' ')}
                  </span>
                  {log.event_data && (
                    <span className="text-xs text-gray-400 ml-2 truncate">
                      {JSON.stringify(log.event_data).slice(0, 80)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-300 shrink-0">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
            {(!recentActivity || recentActivity.length === 0) && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">No activity yet</div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
