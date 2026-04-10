import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import DialerNav from '@/components/dialer/DialerNav'
import { BarChart3, Phone, CheckCircle2, Ban, Archive } from 'lucide-react'

export const metadata = { title: 'Analytics — Dialer' }

export default async function DialerAnalyticsPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  const { data: allLeads } = await supabase
    .from('dialer_raw_leads')
    .select('stage, do_not_call, is_archived, promoted_to_crm_lead_id, created_at, last_call_at')

  const leads = allLeads ?? []
  const total = leads.length
  const active   = leads.filter(l => !l.is_archived && !l.do_not_call && !l.promoted_to_crm_lead_id).length
  const promoted = leads.filter(l => l.promoted_to_crm_lead_id).length
  const dnc      = leads.filter(l => l.do_not_call).length
  const archived = leads.filter(l => l.is_archived && !l.do_not_call).length
  const called   = leads.filter(l => l.last_call_at).length

  const stageCounts: Record<string, number> = {}
  for (const l of leads) {
    const s = (l.stage as string) ?? 'new'
    stageCounts[s] = (stageCounts[s] ?? 0) + 1
  }

  const STAGE_LABELS: Record<string, string> = {
    new: 'New', contacted: 'Contacted', interested: 'Interested',
    callback: 'Callback', follow_up: 'Follow Up', qualified: 'Qualified',
    promoted: 'Promoted', dnc: 'DNC', closed_lost: 'Closed Lost',
  }
  const STAGE_COLORS: Record<string, string> = {
    new: 'bg-blue-500', contacted: 'bg-gray-400', interested: 'bg-green-500',
    callback: 'bg-cyan-500', follow_up: 'bg-yellow-500', qualified: 'bg-purple-500',
    promoted: 'bg-teal-500', dnc: 'bg-red-500', closed_lost: 'bg-gray-300',
  }

  const stats = [
    { label: 'Total Leads',    value: total,    icon: BarChart3,    color: 'text-gray-700' },
    { label: 'Active',         value: active,   icon: Phone,        color: 'text-blue-600' },
    { label: 'Called',         value: called,   icon: Phone,        color: 'text-green-600' },
    { label: 'Promoted to CRM',value: promoted, icon: CheckCircle2, color: 'text-teal-600' },
    { label: 'DNC',            value: dnc,      icon: Ban,          color: 'text-red-600' },
    { label: 'Archived',       value: archived, icon: Archive,      color: 'text-gray-500' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <DialerNav />
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Raw lead pipeline overview</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map(s => {
            const Icon = s.icon
            return (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <Icon size={20} className={`mx-auto mb-2 ${s.color}`} />
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            )
          })}
        </div>

        {/* Stage breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Stage Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(STAGE_LABELS).map(([key, label]) => {
              const count = stageCounts[key] ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-24 shrink-0">{label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${STAGE_COLORS[key] ?? 'bg-gray-300'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-8 text-right">{count}</span>
                  <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>

        {total === 0 && (
          <div className="text-center py-12 text-gray-400">
            <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No data yet. Import leads to see analytics.</p>
          </div>
        )}
      </div>
    </div>
  )
}
