'use client'

import { TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, Clock, BarChart3, Activity, Bot, AlertTriangle, Wrench } from 'lucide-react'

interface PerformanceRow {
  opportunity_id: string
  opportunity_name: string
  total_views: number
  total_clicks: number
  total_reported: number
  total_approved: number
  total_denied: number
  total_pending: number
  approval_rate: number | null
  performance_tag: string
}

interface OutcomeRow {
  outcome: string
  program: string | null
  opportunity_name: string
  created_at: string
}

interface AgentLogRow {
  id: string
  user_id: string
  agent_name: string
  action_type: string
  title: string
  status: string
  auto_fixed: boolean
  needs_review: boolean
  created_at: string
  profiles: { full_name: string | null; email: string | null } | null
}

interface Props {
  performance: PerformanceRow[]
  recentOutcomes: OutcomeRow[]
  actionCounts: Record<string, number>
  byProgram: Record<string, { approved: number; denied: number; pending: number; not_applied: number }>
  agentLogs: AgentLogRow[]
}

const TAG_CONFIG = {
  high: { label: 'High Performing', color: 'bg-green-100 text-green-700', icon: TrendingUp },
  average: { label: 'Average', color: 'bg-yellow-100 text-yellow-700', icon: Minus },
  low: { label: 'Low Performing', color: 'bg-red-100 text-red-700', icon: TrendingDown },
  unknown: { label: 'No Data Yet', color: 'bg-gray-100 text-gray-500', icon: Minus },
}

const PROGRAM_LABELS: Record<string, string> = {
  program_a: 'Program A',
  program_b: 'Program B',
  program_c: 'Program C',
}

const AGENT_COLORS: Record<string, string> = {
  onboarding: 'bg-blue-100 text-blue-700',
  document:   'bg-purple-100 text-purple-700',
  roadmap:    'bg-green-100 text-green-700',
  opportunity:'bg-amber-100 text-amber-700',
  billing:    'bg-rose-100 text-rose-700',
  support:    'bg-indigo-100 text-indigo-700',
  health:     'bg-gray-100 text-gray-600',
}

export default function IntelligenceDashboard({ performance, recentOutcomes, actionCounts, byProgram, agentLogs }: Props) {
  const totalEvents = Object.values(actionCounts).reduce((a, b) => a + b, 0)
  const totalOutcomes = recentOutcomes.length
  const totalApproved = recentOutcomes.filter(o => o.outcome === 'approved').length
  const overallRate = totalOutcomes > 0 ? Math.round((totalApproved / totalOutcomes) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Events (30d)', value: totalEvents, color: 'text-indigo-600', icon: Activity },
          { label: 'Outcomes Reported', value: totalOutcomes, color: 'text-gray-900', icon: BarChart3 },
          { label: 'Approvals', value: totalApproved, color: 'text-green-600', icon: CheckCircle },
          { label: 'Overall Approval Rate', value: `${overallRate}%`, color: overallRate >= 60 ? 'text-green-600' : overallRate >= 40 ? 'text-yellow-600' : 'text-red-500', icon: TrendingUp },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className={color} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* By Program */}
      {Object.keys(byProgram).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4">Outcomes by Program</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(byProgram).map(([prog, counts]) => {
              const total = counts.approved + counts.denied + counts.pending
              const rate = total > 0 ? Math.round((counts.approved / total) * 100) : 0
              return (
                <div key={prog} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm mb-3">{PROGRAM_LABELS[prog] ?? prog}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-green-600">Approved</span><span className="font-semibold dark:text-gray-200">{counts.approved}</span></div>
                    <div className="flex justify-between"><span className="text-red-500">Denied</span><span className="font-semibold dark:text-gray-200">{counts.denied}</span></div>
                    <div className="flex justify-between"><span className="text-yellow-600">Pending</span><span className="font-semibold dark:text-gray-200">{counts.pending}</span></div>
                    <div className="flex justify-between border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                      <span className="text-gray-600 dark:text-gray-400 font-medium">Approval Rate</span>
                      <span className={`font-bold ${rate >= 60 ? 'text-green-600' : rate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>{rate}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Opportunity Performance Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 dark:text-white mb-4">Opportunity Performance</h2>
        {performance.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <BarChart3 size={40} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No performance data yet.</p>
            <p className="text-xs mt-1">Data appears as users report outcomes on opportunities.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th className="pb-2 font-medium">Opportunity</th>
                  <th className="pb-2 font-medium text-center">Clicks</th>
                  <th className="pb-2 font-medium text-center">Reported</th>
                  <th className="pb-2 font-medium text-center">Approved</th>
                  <th className="pb-2 font-medium text-center">Denied</th>
                  <th className="pb-2 font-medium text-center">Rate</th>
                  <th className="pb-2 font-medium">Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {performance.map((row) => {
                  const tag = TAG_CONFIG[row.performance_tag as keyof typeof TAG_CONFIG] ?? TAG_CONFIG.unknown
                  const TagIcon = tag.icon
                  return (
                    <tr key={row.opportunity_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-2.5 pr-4 font-medium text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{row.opportunity_name}</td>
                      <td className="py-2.5 text-center text-gray-600 dark:text-gray-400">{row.total_clicks}</td>
                      <td className="py-2.5 text-center text-gray-600 dark:text-gray-400">{row.total_reported}</td>
                      <td className="py-2.5 text-center text-green-600 font-medium">{row.total_approved}</td>
                      <td className="py-2.5 text-center text-red-500 font-medium">{row.total_denied}</td>
                      <td className="py-2.5 text-center">
                        {row.approval_rate !== null ? (
                          <span className={`font-bold ${row.approval_rate >= 60 ? 'text-green-600' : row.approval_rate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {row.approval_rate}%
                          </span>
                        ) : <span className="text-gray-400 dark:text-gray-500">&mdash;</span>}
                      </td>
                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tag.color}`}>
                          <TagIcon size={10} />
                          {tag.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 mb-4">Recent Outcomes (Last 100)</h2>
        {recentOutcomes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No outcomes reported yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recentOutcomes.map((o, i) => {
              const icon = o.outcome === 'approved' ? <CheckCircle size={14} className="text-green-500" /> :
                          o.outcome === 'denied' ? <XCircle size={14} className="text-red-400" /> :
                          <Clock size={14} className="text-yellow-500" />
              return (
                <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50">
                  {icon}
                  <span className="flex-1 text-gray-700 truncate">{o.opportunity_name}</span>
                  <span className="text-xs text-gray-400">{PROGRAM_LABELS[o.program ?? ''] ?? o.program ?? '&mdash;'}</span>
                  <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString()}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Agent Logs */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot size={18} className="text-indigo-500" />
          <h2 className="font-bold text-gray-900">Agent Activity Log</h2>
          <span className="ml-auto text-xs text-gray-400">{agentLogs.length} recent actions</span>
        </div>
        {agentLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No agent actions yet. Run the DB migration to enable agent logging.</p>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {agentLogs.map(log => (
              <div key={log.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl text-xs ${log.needs_review ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                {log.needs_review ? (
                  <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                ) : log.auto_fixed ? (
                  <Wrench size={13} className="text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <Bot size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{log.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${AGENT_COLORS[log.agent_name] ?? 'bg-gray-100 text-gray-500'}`}>
                      {log.agent_name}
                    </span>
                    {log.auto_fixed && <span className="text-[10px] text-green-600 font-medium">auto-fixed</span>}
                    {log.needs_review && <span className="text-[10px] text-amber-600 font-medium">needs review</span>}
                    <span className="text-[10px] text-gray-400">
                      {log.profiles?.full_name ?? log.profiles?.email ?? log.user_id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] text-gray-300 ml-auto">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event Breakdown */}
      {Object.keys(actionCounts).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4">Event Breakdown (Last 30 Days)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(actionCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([action, count]) => (
                <div key={action} className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500 font-mono mb-1">{action}</p>
                  <p className="text-xl font-bold text-gray-800">{count}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
