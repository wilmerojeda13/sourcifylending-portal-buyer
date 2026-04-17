'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import PortalLayout from '@/components/layout/PortalLayout'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel } from '@/lib/utils'
import {
  Zap, AlertTriangle, Clock, TrendingUp, RefreshCw, Loader2,
  ShoppingCart, CheckCircle, Plus, Sparkles,
} from 'lucide-react'
import type { UserProfile, UserAIBalance, AIProgramLimits, AICreditPack } from '@/types'

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
  profile: {
    assigned_program: string | null
    ai_suspended: boolean
    billing_status: string | null
  } | null
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
    credit_source: string
    created_at: string
  }>
  purchased_credits_remaining: number
  purchased_buckets: Array<{
    id: string
    credits_purchased: number
    credits_remaining: number
    purchase_date: string
  }>
  credit_packs: AICreditPack[]
}

function UsageMeter({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const color = pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-green-500'
  const textColor = pct >= 100 ? 'text-red-600' : pct >= 85 ? 'text-amber-600' : pct >= 70 ? 'text-yellow-600' : 'text-green-600'
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className={`text-sm font-bold ${textColor}`}>{used} / {total}</span>
        </div>
      )}
      {!label && (
        <div className="flex justify-end">
          <span className={`text-sm font-bold ${textColor}`}>{used} / {total}</span>
        </div>
      )}
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{pct}% used</span>
        <span className="text-xs text-gray-500">{Math.max(0, total - used)} remaining</span>
      </div>
    </div>
  )
}

function PackCard({
  pack,
  onBuy,
  buying,
}: {
  pack: AICreditPack
  onBuy: (packId: string) => void
  buying: string | null
}) {
  const isBuying = buying === pack.id
  const isPopular = pack.credits_amount === 50
  return (
    <div className={`relative bg-white border rounded-2xl p-4 flex flex-col gap-3 shadow-sm transition-all ${
      isPopular ? 'border-green-400 ring-1 ring-green-200' : 'border-gray-200 hover:border-green-300'
    }`}>
      {isPopular && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
          POPULAR
        </span>
      )}
      <div>
        <p className="text-sm font-bold text-gray-900">{pack.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{pack.description}</p>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-extrabold text-gray-900">{pack.credits_amount}</span>
          <span className="text-xs text-gray-500 ml-1">credits</span>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-gray-900">${Number(pack.price_usd).toFixed(2)}</span>
          <p className="text-[10px] text-gray-400">one-time</p>
        </div>
      </div>
      <button
        onClick={() => onBuy(pack.id)}
        disabled={isBuying || buying !== null}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
          isPopular
            ? 'bg-green-500 hover:bg-green-600 text-white'
            : 'bg-gray-900 hover:bg-gray-800 text-white'
        }`}
      >
        {isBuying ? (
          <><Loader2 size={14} className="animate-spin" /> Processing…</>
        ) : (
          <><ShoppingCart size={14} /> Buy Now</>
        )}
      </button>
    </div>
  )
}

function AIUsageInner() {
  const searchParams = useSearchParams()
  const justPurchased = searchParams.get('purchased') === '1'

  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [activePrograms, setActivePrograms] = useState<string[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [profileRes, usageRes, membershipsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      fetch('/api/ai-usage'),
      supabase.from('memberships').select('program_code').eq('user_id', user.id).eq('status', 'active'),
    ])

    if (profileRes.data) {
      setProfile(profileRes.data)
      const mPrograms = (membershipsResult?.data ?? []).map((m: { program_code: string }) => m.program_code).filter(Boolean)
      setActivePrograms(mPrograms.length > 0 ? mPrograms : (profileRes.data?.assigned_program ? [profileRes.data.assigned_program] : []))
    }
    if (usageRes.ok) {
      const data = await usageRes.json()
      setUsageData(data)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // When returning from Stripe (?purchased=1), the webhook may not have fired yet.
  // Auto-poll every 2s until purchased credits appear (max 5 attempts = 10s).
  useEffect(() => {
    if (!justPurchased) return
    let attempts = 0
    const maxAttempts = 5
    const intervalMs = 2000

    const poll = setInterval(async () => {
      attempts++
      const res = await fetch('/api/ai-usage')
      if (res.ok) {
        const data = await res.json()
        if ((data.purchased_credits_remaining ?? 0) > 0 || attempts >= maxAttempts) {
          setUsageData(data)
          clearInterval(poll)
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(poll)
      }
    }, intervalMs)

    return () => clearInterval(poll)
  }, [justPurchased]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBuy = async (packId: string) => {
    setBuying(packId)
    setBuyError(null)
    try {
      const res = await fetch('/api/ai-credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setBuyError(data.error ?? 'Failed to start checkout. Please try again.')
        setBuying(null)
      }
    } catch {
      setBuyError('Network error. Please try again.')
      setBuying(null)
    }
  }

  const balance = usageData?.balance
  const limits = usageData?.effective_limits
  const purchasedRemaining = usageData?.purchased_credits_remaining ?? 0
  const creditPacks = usageData?.credit_packs ?? []
  const isActiveMember =
    usageData?.profile?.billing_status === 'active' ||
    usageData?.profile?.billing_status === 'trialing'

  const monthlyPct = balance && limits
    ? Math.min(100, Math.round((balance.credits_used / limits.monthly_credits) * 100))
    : 0

  const resetDate = balance
    ? new Date(balance.billing_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'
  const startDate = balance
    ? new Date(balance.billing_period_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : '—'

  const showBuyMore = isActiveMember && creditPacks.length > 0 && (monthlyPct >= 70 || purchasedRemaining > 0 || justPurchased)

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program as string | null)}
      assignedProgram={profile?.assigned_program as string | null}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      allPrograms={activePrograms}
    >
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Zap size={22} className="text-green-500" /> AI Usage
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Your AI credit balances and activity</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>

        {/* Purchase success banner */}
        {justPurchased && (
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
            {purchasedRemaining > 0
              ? <CheckCircle size={18} className="text-green-500 shrink-0 mt-0.5" />
              : <Loader2 size={18} className="text-green-500 shrink-0 mt-0.5 animate-spin" />
            }
            <div>
              <p className="text-sm font-semibold text-green-800">
                {purchasedRemaining > 0 ? 'Credits added successfully!' : 'Payment received — syncing credits…'}
              </p>
              <p className="text-sm text-green-700 mt-0.5">
                {purchasedRemaining > 0
                  ? `${purchasedRemaining} purchased credits are active and ready to use.`
                  : 'This usually takes just a few seconds. Your balance will update automatically.'}
              </p>
            </div>
          </div>
        )}

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

            {/* Monthly limit warning / buy-more nudge */}
            {balance && limits && !usageData?.profile?.ai_suspended && (
              <>
                {monthlyPct >= 100 ? (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                    <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">Monthly limit reached</p>
                      <p className="text-sm text-red-600 mt-0.5">
                        Resets on <strong>{resetDate}</strong>
                        {isActiveMember && ' — or buy extra credits below to keep going now.'}
                      </p>
                    </div>
                  </div>
                ) : monthlyPct >= 85 ? (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-700">Running low on monthly credits</p>
                      <p className="text-sm text-amber-600 mt-0.5">
                        Resets on <strong>{resetDate}</strong>
                        {isActiveMember && ' — or top up with extra credits below.'}
                      </p>
                    </div>
                  </div>
                ) : monthlyPct >= 70 ? (
                  <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <AlertTriangle size={18} className="text-yellow-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-700">You've used {monthlyPct}% of your monthly AI credits.</p>
                  </div>
                ) : null}
              </>
            )}

            {/* ── Credit Balances ─────────────────────────────────────────────── */}
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
                  <p className="text-sm text-gray-700 mt-0.5">{startDate} → {resetDate}</p>
                </div>
              </div>

              {/* Monthly credits meter */}
              {balance && limits ? (
                <UsageMeter
                  used={balance.credits_used}
                  total={limits.monthly_credits}
                  label="Included Monthly Credits"
                />
              ) : (
                <div className="text-sm text-gray-400 text-center py-4">No usage data available for this period.</div>
              )}

              {/* Purchased credits balance */}
              {purchasedRemaining > 0 && (
                <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-purple-500" />
                    <div>
                      <p className="text-sm font-semibold text-purple-800">Extra AI Credits</p>
                      <p className="text-xs text-purple-600">Used automatically when monthly credits run out</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-extrabold text-purple-700">{purchasedRemaining}</span>
                    <p className="text-xs text-purple-500">available</p>
                  </div>
                </div>
              )}
            </div>

            {/* Daily + Heavy limits */}
            {balance && limits && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Today's Credits</p>
                  <UsageMeter used={balance.daily_credits_used} total={limits.daily_credit_cap} label="" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Advanced Actions Today</p>
                  <UsageMeter used={balance.heavy_actions_used_today} total={limits.max_heavy_actions_per_day} label="" />
                  <p className="text-[10px] text-gray-400 mt-2">Document reviews, deep analysis, etc.</p>
                </div>
              </div>
            )}

            {/* ── Buy More Credits ───────────────────────────────────────────── */}
            {isActiveMember && creditPacks.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                    <Plus size={18} className="text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">Buy Extra AI Credits</h2>
                    <p className="text-xs text-gray-500 leading-snug">
                      One-time purchase · Never expire while your account is active · Used after monthly credits
                    </p>
                  </div>
                </div>

                {buyError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                    <p className="text-xs text-red-600">{buyError}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {creditPacks.map((pack) => (
                    <PackCard key={pack.id} pack={pack} onBuy={handleBuy} buying={buying} />
                  ))}
                </div>

                <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                  Secure checkout via Stripe · No subscription · Credits are non-refundable once used
                </p>
              </div>
            )}

            {/* ── Credit Weight Info ─────────────────────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-green-500" /> How Credits Are Used
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Different AI actions consume different credit amounts. Extra (purchased) credits are used automatically when your monthly allowance runs out.
              </p>
              <div className="space-y-2">
                {[
                  ['simple_chat', 1],
                  ['guided_recommendation', 2],
                  ['analyzer_interpretation', 3],
                  ['dispute_letter_generation', 3],
                  ['funding_strategy_response', 4],
                  ['document_review', 5],
                  ['file_analysis', 5],
                  ['heavy_agent_workflow', 8],
                  ['underwriting_or_multi_step_deep_analysis', 10],
                ].map(([action, cost]) => (
                  <div key={action as string} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-600">{ACTION_LABELS[action as string] ?? action}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      (cost as number) <= 2 ? 'bg-green-50 text-green-700'
                      : (cost as number) <= 4 ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-red-50 text-red-600'
                    }`}>
                      {cost} credit{cost !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Recent Activity ────────────────────────────────────────────── */}
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
                      <div className="text-right shrink-0 space-y-0.5">
                        {evt.request_status === 'success' ? (
                          <>
                            <span className="text-xs font-bold text-gray-700 block">
                              -{evt.credits_charged} cr
                            </span>
                            {evt.credit_source === 'purchased' && (
                              <span className="text-[9px] text-purple-500 font-medium">extra</span>
                            )}
                          </>
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
                <li>Included monthly credits reset each billing cycle — unused credits do not roll over</li>
                <li>Purchased extra credits <strong>never expire</strong> while your account is active</li>
                <li>Your monthly credits are always used first; extra credits kick in automatically</li>
                <li>Some actions (document reviews, deep analysis) consume more credits</li>
                <li>Failed or blocked requests are not charged</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  )
}

export default function AIUsagePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="animate-spin text-green-400" />
      </div>
    }>
      <AIUsageInner />
    </Suspense>
  )
}
