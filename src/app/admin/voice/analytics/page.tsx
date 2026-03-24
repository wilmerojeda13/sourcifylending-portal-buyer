import { createServiceClient } from '@/lib/supabase/server'
import { BarChart3, Phone, TrendingUp, Clock, CheckCircle, XCircle, PhoneOff, Voicemail } from 'lucide-react'

const DISP_LABEL: Record<string, string> = {
  transferred_live: 'Transferred Live', send_link: 'Send Link', callback_requested: 'Callback Requested',
  interested: 'Interested', decision_maker: 'Decision Maker', not_interested: 'Not Interested',
  voicemail: 'Voicemail', no_answer: 'No Answer', do_not_call: 'DNC', bad_number: 'Bad Number',
  wrong_number: 'Wrong Number', gatekeeper: 'Gatekeeper', business_closed: 'Business Closed',
  personal_line: 'Personal Line',
}

const DISP_COLOR: Record<string, string> = {
  transferred_live: 'bg-green-500', send_link: 'bg-blue-500', callback_requested: 'bg-indigo-500',
  interested: 'bg-emerald-500', decision_maker: 'bg-purple-500', not_interested: 'bg-gray-400',
  voicemail: 'bg-amber-500', no_answer: 'bg-gray-300', do_not_call: 'bg-red-600',
  bad_number: 'bg-red-400', wrong_number: 'bg-orange-400', gatekeeper: 'bg-yellow-500',
  business_closed: 'bg-gray-400', personal_line: 'bg-orange-500',
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ComponentType<{ size?: number; className?: string }>; color: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  )
}

export default async function AnalyticsPage() {
  const supabase = await createServiceClient()

  const [
    { count: totalCalls },
    { count: completedCalls },
    { count: noAnswer },
    { count: totalLeads },
    { data: allCalls },
  ] = await Promise.all([
    supabase.from('voice_calls').select('id', { count: 'exact', head: true }),
    supabase.from('voice_calls').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('voice_calls').select('id', { count: 'exact', head: true }).eq('status', 'no-answer'),
    supabase.from('voice_leads').select('id', { count: 'exact', head: true }),
    supabase.from('voice_calls').select('disposition, duration_seconds, status, created_at').not('disposition', 'is', null),
  ])

  const calls = allCalls ?? []

  // Disposition breakdown
  const dispMap: Record<string, number> = {}
  for (const c of calls) {
    if (c.disposition) dispMap[c.disposition] = (dispMap[c.disposition] ?? 0) + 1
  }
  const dispEntries = Object.entries(dispMap).sort((a, b) => b[1] - a[1])
  const maxDisp = Math.max(...dispEntries.map(e => e[1]), 1)

  // Qualified rate
  const qualified = calls.filter(c =>
    ['decision_maker', 'interested', 'send_link', 'callback_requested', 'transferred_live'].includes(c.disposition ?? '')
  ).length
  const qualRate = calls.length > 0 ? ((qualified / calls.length) * 100).toFixed(1) : '0.0'

  // Avg duration (completed only)
  const durations = calls.filter(c => c.status === 'completed' && c.duration_seconds).map(c => c.duration_seconds as number)
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
  const avgDurStr = avgDuration >= 60 ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` : `${avgDuration}s`

  // Connect rate (completed > 5s)
  const connects = calls.filter(c => c.status === 'completed' && (c.duration_seconds ?? 0) > 5).length
  const connectRate = (totalCalls ?? 0) > 0 ? (((connects) / (totalCalls ?? 1)) * 100).toFixed(1) : '0.0'

  // Daily calls (last 14 days)
  const now = new Date()
  const daily: { date: string; count: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const count = calls.filter(c => (c.created_at as string)?.slice(0, 10) === dateStr).length
    daily.push({ date: dateStr, count })
  }
  const maxDay = Math.max(...daily.map(d => d.count), 1)

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Voice campaign performance overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Calls" value={(totalCalls ?? 0).toLocaleString()} icon={Phone} color="bg-indigo-500" />
        <StatCard label="Connect Rate" value={`${connectRate}%`} sub={`${connects} connects`} icon={CheckCircle} color="bg-green-500" />
        <StatCard label="Qualified Rate" value={`${qualRate}%`} sub={`${qualified} qualified`} icon={TrendingUp} color="bg-emerald-500" />
        <StatCard label="Avg Duration" value={avgDurStr} sub={`${durations.length} answered`} icon={Clock} color="bg-blue-500" />
        <StatCard label="Total Leads" value={(totalLeads ?? 0).toLocaleString()} icon={BarChart3} color="bg-purple-500" />
        <StatCard label="Completed" value={(completedCalls ?? 0).toLocaleString()} icon={CheckCircle} color="bg-teal-500" />
        <StatCard label="No Answer" value={(noAnswer ?? 0).toLocaleString()} icon={PhoneOff} color="bg-gray-400" />
        <StatCard label="Voicemail" value={dispMap['voicemail'] ?? 0} icon={Voicemail} color="bg-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily calls chart */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4 text-sm">Daily Calls — Last 14 Days</h2>
          <div className="flex items-end gap-1 h-32">
            {daily.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full bg-indigo-500 rounded-t-sm transition-all"
                  style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                  {d.count} calls
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-gray-400">{daily[0]?.date.slice(5)}</span>
            <span className="text-[10px] text-gray-400">{daily[daily.length - 1]?.date.slice(5)}</span>
          </div>
        </div>

        {/* Disposition breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4 text-sm">Disposition Breakdown</h2>
          {dispEntries.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No disposition data yet</p>
          ) : (
            <div className="space-y-2.5">
              {dispEntries.slice(0, 10).map(([disp, count]) => (
                <div key={disp} className="flex items-center gap-3">
                  <div className="w-28 text-right">
                    <span className="text-[10px] text-gray-500 font-medium">{DISP_LABEL[disp] ?? disp}</span>
                  </div>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${DISP_COLOR[disp] ?? 'bg-gray-400'}`}
                      style={{ width: `${(count / maxDisp) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary table */}
      {dispEntries.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-sm">Full Disposition Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Disposition', 'Count', '% of Calls'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dispEntries.map(([disp, count]) => (
                  <tr key={disp} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${DISP_COLOR[disp] ?? 'bg-gray-400'}`} />
                        <span className="text-gray-700 font-medium">{DISP_LABEL[disp] ?? disp}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-bold text-gray-900">{count}</td>
                    <td className="px-5 py-3 text-gray-500">{calls.length > 0 ? ((count / calls.length) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
