'use client'
import { useState, useEffect } from 'react'
import PortalLayout from '@/components/layout/PortalLayout'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel } from '@/lib/utils'
import { Zap, AlertTriangle, CheckCircle, Clock, TrendingUp, RefreshCw, Loader2 } from 'lucide-react'
import type { UserProfile, UserAIBalance, AIProgramLimits } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  simple_chat: 'Simple Chat',
  guided_recommendation: 'Guided Recommendation',
  analyzer_interpretation: 'Analyzer Interpretation',
  dispute_letter_generation: 'Dispute Letter',
  funding_strategy_response: 'Funding Strategy',
  document_review: 'Document Review',
  file_analysis: 'File Analysis',
  heavy_agent_workflow: 'Advanced Workflow',
  underwriting_or_multi_step_deep_analysis: 'Deep Analysis',
}

interface UsageData {
  profile: { assigned_program: string | null; ai_suspended: boolean } | null
  balance: UserAIBalance | null
  program_limits: AIProgramLimits | null
  effective_limits: {
    monthly_credits: number
    daily_credit_cap: number
    max_heavy_actions_per_day: number
    max_requests_per_hour: number
  } | null
  recent_events: Array<{
    id: string
    action_type: string
    credits_charged: number
    request_status: string
    created_at: string
  }>
}

function UsageMeter({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const color = pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-green-500'
  const textColor = pct >= 100 ? 'text-red-600' : pct >= 85 ? 'text-amber-600' : pct >= 70 ? 'text-yellow-600' : 'text-green-600'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-bold ${textColor}`}>{used} / {total}</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{pct}% used</span>
        <span className="text-xs text-gray-500">{Math.max(0, total - used)} remaining</span>
      </div>
    </div>
  )
}

function WarningBanner({ pct, resetDate }: { pct: number; resetDate: string }) {
  if (pct >= 100) {
    return (
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700">Monthly limit reached</p>
          <p className="text-sm text-red-600 mt-0.5">
            You've reached your monthly AI guidance limit for your current program. Access resets on{' '}
            <strong>{resetDate}</strong>.
          </p>
        </div>
      </div>
    )
  }
  if (pct >= 85) {
    return (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-700">You're close to your monthly AI limit</p>
          <p className="text-sm text-amber-600 mt-0.5">Consider conserving credits until reset on <strong>{resetDate}</strong>.</p>
        </div>
      </div>
    )
  }
  if (pct >= 70) {
    return (
      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <AlertTriangle size={18} className="text-yellow-500 shrink-0 mt-0.5" />
        <p className="text-sm text-yellow-700">You've used 70% of your monthly AI guidance credits.</p>
      </div>
    )
  }
  return null
}

export default function AIUsagePage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)

      const res = await fetch('/api/ai-usage')
      if (res.ok) {
        const data = await res.json()
        setUsageData(data)
      }
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    setLoading(true)
    const res = await fetch('/api/ai-usage')
    if (res.ok) {
      const data = await res.json()
      setUsageData(data)
    }
    setLoading(false)
  }

  const balance = usageData?.balance
  const limits = usageData?.effective_limits

  const monthlyPct = balance && limits
    ? Math.min(100, Math.round((balance.credits_used / limits.monthly_credits) * 100))
    : 0

  const resetDate = balance
    ? new Date(balance.billing_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'

  const startDate = balance
    ? new Date(balance.billing_period_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : '—'

  const actionCreditMap: Record<string, number> = {
    simple_chat: 1,
    guided_recommendation: 2,
    analyzer_interpretation: 3,
    dispute_letter_generation: 3,
    funding_strategy_response: 4,
    document_review: 5,
    file_analysis: 5,
    heavy_agent_workflow: 8,
    underwriting_or_multi_step_deep_analysis: 10,
  }

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
    >
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Zap size={22} className="text-green-500" /> AI Usage
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Your monthly AI guidance credit balance
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="btn-secondary text-xs px-3 py-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>

        {loading && !usageData ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={24} className="animate-spin text-green-400" />
          </div>
        ) : (
          <>
            {/* Suspended banner */}
            {usageData?.profile?.ai_suspended && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">AI Access Suspended</p>
                  <p className="text-sm text-red-600 mt-0.5">Your AI access has been suspended. Please contact support.</p>
                </div>
              </div>
            )}

            {/* Warning banners */}
            {balance && limits && !usageData?.profile?.ai_suspended && (
              <WarningBanner pct={monthlyPct} resetDate={resetDate} />
            )}

            {/* Program + Period Card */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Program</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">
                    {getProgramShortLabel(usageData?.profile?.assigned_program ?? null)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Billing Period</p>
                  <p className="text-sm text-gray-700 mt-0.5">{startDate} → Resets {resetDate}</p>
                </div>
              </div>

              {/* Monthly meter */}
              {balance && limits ? (
                <UsageMeter
                  used={balance.credits_used}
                  total={limits.monthly_credits}
                  label="Monthly AI Credits"
                />
              ) : (
                <div className="text-sm text-gray-400 text-center py-4">No usage data available for this period.</div>
              )}
            </div>

            {/* Daily + Heavy limits */}
            {balance && limits && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Today's Credits</p>
                  <UsageMeter
                    used={balance.daily_credits_used}
                    total={limits.daily_credit_cap}
                    label=""
                  />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Advanced Actions Today</p>
                  <UsageMeter
                    used={balance.heavy_actions_used_today}
                    total={limits.max_heavy_actions_per_day}
                    label=""
                  />
                  <p className="text-[10px] text-gray-400 mt-2">Document reviews, deep analysis, etc.</p>
                </div>
              </div>
            )}

            {/* Credit Weight Info */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-green-500" /> How Credits Are Used
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Different AI actions consume different amounts of credits. Simple questions use fewer credits than advanced analysis.
              </p>
              <div className="space-y-2">
                {Object.entries(actionCreditMap).map(([action, cost]) => (
                  <div key={action} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-600">{ACTION_LABELS[action] ?? action}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      cost <= 2 ? 'bg-green-50 text-green-700'
                      : cost <= 4 ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-red-50 text-red-600'
                    }`}>
                      {cost} credit{cost !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            {usageData?.recent_events && usageData.recent_events.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Clock size={15} className="text-gray-400" /> Recent AI Activity
                  </h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {usageData.recent_events.map((evt) => (
                    <div key={evt.id} className="flex items-center gap-4 px-5 py-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        evt.request_status === 'success' ? 'bg-green-400'
                        : evt.request_status === 'blocked' ? 'bg-red-400'
                        : 'bg-gray-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">
                          {ACTION_LABELS[evt.action_type] ?? evt.action_type}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(evt.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {evt.request_status === 'success' ? (
                          <span className="text-xs font-bold text-gray-700">
                            -{evt.credits_charged} cr
                          </span>
                        ) : evt.request_status === 'blocked' ? (
                          <span className="text-xs font-medium text-red-500">Blocked</span>
                        ) : (
                          <span className="text-xs font-medium text-gray-400">No charge</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-semibold text-gray-600">About AI Credits</p>
              <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                <li>AI access is subject to program limits and varies by program tier</li>
                <li>Credits reset monthly — unused credits do not roll over</li>
                <li>Some actions (like document reviews) consume more credits than others</li>
                <li>Excessive or abusive use may be throttled or suspended</li>
                <li>Failed or blocked requests are not charged</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  )
}
