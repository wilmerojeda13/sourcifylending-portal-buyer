import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Eye, CheckCircle2, Clock, AlertCircle, DollarSign, Activity } from 'lucide-react'
import { getProgramLabel } from '@/lib/utils'

function formatCurrency(n: number | null | undefined): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Number(n).toLocaleString()}`
}

function formatActivityMeta(data: Record<string, unknown>): string {
  const parts: string[] = []
  if (data.program) {
    const p = String(data.program)
    parts.push(p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
  }
  if (data.risk_score !== undefined) parts.push(`Risk Score: ${data.risk_score}`)
  if (data.next_due_at) {
    const d = new Date(String(data.next_due_at))
    parts.push(`Next due: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
  }
  if (data.changes && typeof data.changes === 'object') {
    const changed = Object.entries(data.changes as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k]) => k.replace(/_/g, ' '))
    if (changed.length) parts.push(changed.slice(0, 2).join(', '))
  }
  if (data.approval_likelihood) parts.push(String(data.approval_likelihood).replace(/_/g, ' '))
  return parts.length ? parts.join(' · ') : ''
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  return `${days}d ago`
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-600',
  inactive: 'bg-gray-100 text-gray-500',
}

export default async function AdminClientViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  const [
    { data: profile },
    { data: tasks },
    { data: fundingApprovals },
    { data: creditDisputes },
    { data: activityLogs },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('tasks').select('task_id, title, status, stage, sort_order').eq('user_id', id).order('sort_order'),
    supabase
      .from('funding_approvals')
      .select('id, approval_type, issuer_name, account_name, approved_amount, approved_limit, approval_date, status')
      .eq('user_id', id)
      .eq('status', 'Approved')
      .order('approval_date', { ascending: false }),
    supabase
      .from('credit_disputes')
      .select('id, bureau, account_name, dispute_status, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('activity_logs')
      .select('id, event_type, event_data, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Client not found.</p>
          <Link href="/admin/operations" className="text-green-600 hover:underline text-sm">
            ← Back to Operations
          </Link>
        </div>
      </div>
    )
  }

  const taskList = tasks ?? []
  const completedTasks = taskList.filter((t) => t.status === 'completed')
  const pendingTasks = taskList.filter((t) => t.status === 'pending')
  const overdueTasks = taskList.filter((t) => t.status === 'overdue')
  const progress = taskList.length > 0
    ? Math.round((completedTasks.length / taskList.length) * 100)
    : (profile.progress_percentage ?? 0)

  const fundingList = fundingApprovals ?? []
  const totalFunding = fundingList.reduce((sum, f) => {
    const CREDIT_TYPES = ['0% APR Card', 'Business Credit Card', 'Vendor Account', 'Store Account', 'Fleet Account', 'Line of Credit']
    const val = CREDIT_TYPES.includes(f.approval_type) ? (f.approved_limit ?? f.approved_amount ?? 0) : (f.approved_amount ?? f.approved_limit ?? 0)
    return sum + Number(val)
  }, 0)

  const activeDisputes = (creditDisputes ?? []).filter((d) => d.dispute_status === 'pending' || d.dispute_status === 'in_review')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky support banner */}
      <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Eye size={16} />
          <span className="text-sm font-semibold">
            Support Mode — Viewing {profile.full_name}&apos;s portal
          </span>
          <span className="text-xs opacity-75">Read-only view • Changes made here are REAL</span>
        </div>
        <Link href="/admin/operations" className="text-xs underline opacity-90">
          ← Back to Operations
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">

        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-gray-600">
                {(profile.full_name || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold text-gray-900">{profile.full_name || 'Unknown'}</h1>
                  <p className="text-sm text-gray-500">{profile.email}</p>
                  {profile.business_name && (
                    <p className="text-sm text-gray-500">{profile.business_name}</p>
                  )}
                  {profile.phone && (
                    <p className="text-sm text-gray-500">{profile.phone}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${STATUS_COLORS[profile.billing_status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {profile.billing_status}
                  </span>
                  {profile.portal_blocked && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-red-100 text-red-600">
                      Blocked
                    </span>
                  )}
                  {profile.is_demo && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-purple-100 text-purple-600">
                      Demo
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                <span>Program: <span className="font-medium text-gray-700">{getProgramLabel(profile.assigned_program)}</span></span>
                {profile.current_stage && (
                  <span>Stage: <span className="font-medium text-gray-700">{profile.current_stage}</span></span>
                )}
                <span>Joined: <span className="font-medium text-gray-700">{new Date(profile.created_at).toLocaleDateString()}</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Task Progress */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600" />
            Task Progress
          </h2>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-500">Overall Completion</span>
              <span className="font-bold text-gray-900">{progress}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full">
              <div
                className="h-2.5 rounded-full bg-green-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-50 rounded-xl py-3">
              <p className="text-xl font-bold text-green-700">{completedTasks.length}</p>
              <p className="text-xs text-green-600 mt-0.5">Completed</p>
            </div>
            <div className="bg-blue-50 rounded-xl py-3">
              <p className="text-xl font-bold text-blue-700">{pendingTasks.length}</p>
              <p className="text-xs text-blue-600 mt-0.5">Pending</p>
            </div>
            <div className="bg-red-50 rounded-xl py-3">
              <p className="text-xl font-bold text-red-700">{overdueTasks.length}</p>
              <p className="text-xs text-red-600 mt-0.5">Overdue</p>
            </div>
          </div>
          {overdueTasks.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Overdue Tasks</p>
              {overdueTasks.map((t) => (
                <div key={t.task_id} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                  <AlertCircle size={12} className="text-red-500 shrink-0" />
                  <span className="text-xs text-red-800">{t.title}</span>
                  {t.stage && <span className="text-[10px] text-red-500 ml-auto">{t.stage}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Funding Summary */}
        {fundingList.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign size={18} className="text-green-600" />
              Funding Summary
              <span className="ml-auto text-base font-bold text-green-700">{formatCurrency(totalFunding)} total</span>
            </h2>
            <div className="space-y-2">
              {fundingList.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{f.issuer_name}</p>
                    <p className="text-xs text-gray-400">{f.approval_type}{f.account_name ? ` • ${f.account_name}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-700">
                      {formatCurrency(f.approved_limit ?? f.approved_amount)}
                    </p>
                    <p className="text-xs text-gray-400">{f.approval_date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Disputes */}
        {activeDisputes.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-600" />
              Active Disputes
              <span className="text-xs font-medium text-gray-400 ml-1">({activeDisputes.length})</span>
            </h2>
            <div className="space-y-2">
              {activeDisputes.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{d.account_name}</p>
                    <p className="text-xs text-gray-500">{d.bureau} • {relativeTime(d.created_at)}</p>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-amber-100 text-amber-700">
                    {d.dispute_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {(activityLogs ?? []).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Activity size={18} className="text-gray-500" />
              Recent Activity
            </h2>
            <div className="space-y-1.5">
              {(activityLogs ?? []).map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-gray-700 capitalize">
                      {log.event_type.replace(/_/g, ' ')}
                    </span>
                    {log.event_data && Object.keys(log.event_data).length > 0 && (
                      <span className="text-xs text-gray-400 ml-2 truncate">
                        {formatActivityMeta(log.event_data)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-300 shrink-0">{relativeTime(log.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Link to full member detail */}
        <div className="flex items-center justify-between">
          <Link
            href={`/admin/members/${id}`}
            className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition-colors font-medium"
          >
            Open Full Member Detail →
          </Link>
          <Link
            href="/admin/operations"
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            ← Back to Operations
          </Link>
        </div>

      </div>
    </div>
  )
}
