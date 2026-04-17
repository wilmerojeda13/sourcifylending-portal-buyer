import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getProgramShortLabel, formatDate } from '@/lib/utils'
import type { ProgramId } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────
interface UserRow {
  id: string
  full_name: string
  email: string
  business_name: string | null
  assigned_program: ProgramId | null
  billing_status: string
  created_at: string
}

interface SubscriptionRow {
  user_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: string
  program: string | null
  current_period_end: string | null
  updated_at: string
}

interface AgreementRow {
  user_id: string
  program: string
  agreement_version: string
  accepted_at: string
  ip_address: string | null
  user_agent: string | null
}

interface ActivityRow {
  user_id: string
  event_type: string
  event_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

interface TaskCount { user_id: string; total: number; completed: number }
interface DocCount  { user_id: string; total: number }
interface ReportCount { user_id: string; total: number }

// ── Data loader ────────────────────────────────────────────────────────────────
async function loadData() {
  const supabase = await createServiceClient()

  const [
    { data: profiles },
    { data: subscriptions },
    { data: agreements },
    { data: activityLogs },
    { data: taskData },
    { data: docData },
    { data: reportData },
  ] = await Promise.all([
    supabase.from('profiles').select('id,full_name,email,business_name,assigned_program,billing_status,created_at').order('created_at', { ascending: false }),
    supabase.from('subscriptions').select('user_id,stripe_subscription_id,stripe_customer_id,status,program,current_period_end,updated_at'),
    supabase.from('agreements').select('user_id,program,agreement_version,accepted_at,ip_address,user_agent').order('accepted_at', { ascending: false }),
    supabase.from('activity_logs').select('user_id,event_type,event_data,ip_address,created_at').order('created_at', { ascending: false }),
    supabase.from('tasks').select('user_id,status'),
    supabase.from('documents').select('user_id'),
    supabase.from('reports').select('user_id'),
  ])

  // Build lookup maps
  const subMap = new Map<string, SubscriptionRow>()
  for (const s of subscriptions ?? []) subMap.set(s.user_id, s)

  const agreementMap = new Map<string, AgreementRow[]>()
  for (const a of agreements ?? []) {
    const arr = agreementMap.get(a.user_id) ?? []
    arr.push(a)
    agreementMap.set(a.user_id, arr)
  }

  const activityMap = new Map<string, ActivityRow[]>()
  for (const a of activityLogs ?? []) {
    const arr = activityMap.get(a.user_id) ?? []
    arr.push(a)
    activityMap.set(a.user_id, arr)
  }

  const taskMap = new Map<string, TaskCount>()
  for (const t of taskData ?? []) {
    const existing = taskMap.get(t.user_id) ?? { user_id: t.user_id, total: 0, completed: 0 }
    existing.total++
    if (t.status === 'completed') existing.completed++
    taskMap.set(t.user_id, existing)
  }

  const docMap = new Map<string, number>()
  for (const d of docData ?? []) docMap.set(d.user_id, (docMap.get(d.user_id) ?? 0) + 1)

  const reportMap = new Map<string, number>()
  for (const r of reportData ?? []) reportMap.set(r.user_id, (reportMap.get(r.user_id) ?? 0) + 1)

  return { profiles: profiles ?? [], subMap, agreementMap, activityMap, taskMap, docMap, reportMap }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default async function ChargebackDefensePage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const { profiles, subMap, agreementMap, activityMap, taskMap, docMap, reportMap } = await loadData()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Chargeback Defense Center</h1>
          <p className="text-gray-500 text-sm mt-1">Full audit trail per client — agreement acceptance, Stripe IDs, and activity timeline</p>
          <p className="text-xs text-gray-400 mt-1">{profiles.length} total clients</p>
        </div>

        {/* Client rows */}
        <div className="space-y-6">
          {profiles.map((profile: UserRow) => {
            const sub = subMap.get(profile.id)
            const userAgreements = agreementMap.get(profile.id) ?? []
            const latestAgreement = userAgreements[0] ?? null
            const activity = activityMap.get(profile.id) ?? []
            const tasks = taskMap.get(profile.id)
            const docs = docMap.get(profile.id) ?? 0
            const reports = reportMap.get(profile.id) ?? 0

            return (
              <div key={profile.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                {/* Client header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{profile.full_name}</span>
                      <span className="text-gray-400 text-sm">·</span>
                      <span className="text-gray-600 text-sm">{profile.email}</span>
                      {profile.business_name && (
                        <>
                          <span className="text-gray-400 text-sm">·</span>
                          <span className="text-gray-500 text-sm">{profile.business_name}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        profile.billing_status === 'active' ? 'bg-green-100 text-green-700' :
                        profile.billing_status === 'trialing' ? 'bg-blue-100 text-blue-700' :
                        profile.billing_status === 'canceled' ? 'bg-red-100 text-red-600' :
                        profile.billing_status === 'past_due' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {profile.billing_status}
                      </span>
                      {profile.assigned_program && (
                        <span className="text-xs text-gray-500">{getProgramShortLabel(profile.assigned_program)}</span>
                      )}
                      <span className="text-xs text-gray-400">Signed up {formatDate(profile.created_at)}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400 space-y-0.5">
                    <div>Tasks: <span className="text-gray-700 font-medium">{tasks?.completed ?? 0}/{tasks?.total ?? 0} completed</span></div>
                    <div>Docs: <span className="text-gray-700 font-medium">{docs}</span></div>
                    <div>Reports: <span className="text-gray-700 font-medium">{reports}</span></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">

                  {/* Agreement */}
                  <div className="px-6 py-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Agreement Acceptance</p>
                    {latestAgreement ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="text-xs font-semibold text-green-700">Accepted</span>
                        </div>
                        <p className="text-xs text-gray-700">
                          <span className="font-medium">Program:</span> {getProgramShortLabel(latestAgreement.program as ProgramId)}
                        </p>
                        <p className="text-xs text-gray-700">
                          <span className="font-medium">Version:</span> {latestAgreement.agreement_version}
                        </p>
                        <p className="text-xs text-gray-700">
                          <span className="font-medium">Date:</span> {new Date(latestAgreement.accepted_at).toLocaleString()}
                        </p>
                        {latestAgreement.ip_address && (
                          <p className="text-xs text-gray-700">
                            <span className="font-medium">IP:</span> {latestAgreement.ip_address}
                          </p>
                        )}
                        {latestAgreement.user_agent && (
                          <p className="text-xs text-gray-500 truncate" title={latestAgreement.user_agent}>
                            <span className="font-medium">UA:</span> {latestAgreement.user_agent.slice(0, 60)}…
                          </p>
                        )}
                        {userAgreements.length > 1 && (
                          <p className="text-xs text-gray-400">{userAgreements.length} total acceptances</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">No agreement on file</span>
                      </div>
                    )}
                  </div>

                  {/* Stripe */}
                  <div className="px-6 py-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Stripe Records</p>
                    {sub ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-gray-700">
                          <span className="font-medium">Customer:</span>{' '}
                          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{sub.stripe_customer_id ?? '—'}</code>
                        </p>
                        <p className="text-xs text-gray-700">
                          <span className="font-medium">Subscription:</span>{' '}
                          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{sub.stripe_subscription_id ?? '—'}</code>
                        </p>
                        <p className="text-xs text-gray-700">
                          <span className="font-medium">Status:</span> {sub.status}
                        </p>
                        {sub.current_period_end && (
                          <p className="text-xs text-gray-700">
                            <span className="font-medium">Period end:</span> {formatDate(sub.current_period_end)}
                          </p>
                        )}
                        <p className="text-xs text-gray-700">
                          <span className="font-medium">Last updated:</span> {formatDate(sub.updated_at)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No Stripe subscription record</p>
                    )}
                  </div>

                  {/* Activity Timeline */}
                  <div className="px-6 py-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Activity Timeline</p>
                    {activity.length === 0 ? (
                      <p className="text-xs text-gray-400">No activity recorded</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {activity.slice(0, 20).map((event, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 mt-1.5" />
                            <div>
                              <p className="text-xs text-gray-700 font-medium leading-tight">{event.event_type.replace(/_/g, ' ')}</p>
                              <p className="text-xs text-gray-400">{new Date(event.created_at).toLocaleString()}</p>
                              {event.event_data && Object.keys(event.event_data).length > 0 && (
                                <p className="text-xs text-gray-400 truncate">
                                  {Object.entries(event.event_data).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                        {activity.length > 20 && (
                          <p className="text-xs text-gray-400 pl-3.5">+{activity.length - 20} more events</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {profiles.length === 0 && (
          <div className="text-center py-20 text-gray-400">No clients found.</div>
        )}
      </div>
    </div>
  )
}
