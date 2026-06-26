'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/lib/use-business-context'
import { getProgramShortLabel } from '@/lib/utils'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'
import {
  Zap,
  AlertTriangle,
  Clock,
  TrendingUp,
  RefreshCw,
  Loader2,
  ShoppingCart,
  CheckCircle,
  Plus,
  Sparkles,
} from 'lucide-react'
import type { UserProfile, UserAIBalance, AIProgramLimits, AICreditPack } from '@/types'

const ACTION_LABEL_KEYS: Record<string, string> = {
  simple_chat: 'aiUsage.simpleChat',
  guided_recommendation: 'aiUsage.guidedRecommendation',
  analyzer_interpretation: 'aiUsage.analyzerInterpretation',
  dispute_letter_generation: 'aiUsage.disputeLetter',
  funding_strategy_response: 'aiUsage.fundingStrategy',
  document_review: 'aiUsage.documentReview',
  file_analysis: 'aiUsage.fileAnalysis',
  heavy_agent_workflow: 'aiUsage.advancedWorkflow',
  underwriting_or_multi_step_deep_analysis: 'aiUsage.deepAnalysis',
}

function sameStringList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

interface UsageData {
  profile: {
    assigned_program: string | null
    ai_suspended: boolean
    billing_status: string | null
    is_admin?: boolean
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

function UsageMeter({ used, total, label, text }: { used: number; total: number; label: string; text: (key: string, fallback: string) => string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const color = pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-green-500'
  const textColor = pct >= 100 ? 'text-red-600' : pct >= 85 ? 'text-amber-600' : pct >= 70 ? 'text-yellow-600' : 'text-green-600'

  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className={`text-sm font-bold ${textColor}`}>{used} / {total}</span>
        </div>
      ) : (
        <div className="flex justify-end">
          <span className={`text-sm font-bold ${textColor}`}>{used} / {total}</span>
        </div>
      )}
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{pct}% {text('aiUsage.usedPercent', 'used')}</span>
        <span className="text-xs text-gray-500">{Math.max(0, total - used)} {text('common.remaining', 'remaining')}</span>
      </div>
    </div>
  )
}

function PackCard({
  pack,
  onBuy,
  buying,
  text,
}: {
  pack: AICreditPack
  onBuy: (packId: string) => void
  buying: string | null
  text: (key: string, fallback: string) => string
}) {
  const isBuying = buying === pack.id
  const isPopular = pack.credits_amount === 50

  return (
    <div
      className={`relative flex flex-col gap-3 rounded-2xl border p-4 shadow-sm transition-all ${
        isPopular ? 'border-green-400 ring-1 ring-green-200' : 'border-gray-200 hover:border-green-300'
      } bg-white`}
    >
      {isPopular && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-2.5 py-0.5 text-[10px] font-bold text-white">
          {text('aiUsage.popular', 'Popular')}
        </span>
      )}
      <div>
        <p className="text-sm font-bold text-gray-900">{pack.name}</p>
        <p className="mt-0.5 text-xs leading-snug text-gray-500">{pack.description}</p>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-extrabold text-gray-900">{pack.credits_amount}</span>
          <span className="ml-1 text-xs text-gray-500">{text('aiUsage.credits', 'credits')}</span>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-gray-900">${Number(pack.price_usd).toFixed(2)}</span>
          <p className="text-[10px] text-gray-400">{text('aiUsage.oneTime', 'one-time')}</p>
        </div>
      </div>
      <button
        onClick={() => onBuy(pack.id)}
        disabled={isBuying || buying !== null}
        className={`w-full rounded-xl py-2 text-sm font-semibold text-white transition-all disabled:opacity-60 ${
          isPopular ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-900 hover:bg-gray-800'
        } flex items-center justify-center gap-2`}
      >
        {isBuying ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            {text('aiUsage.processing', 'Processing...')}
          </>
        ) : (
          <>
            <ShoppingCart size={14} />
            {text('aiUsage.buyNow', 'Buy Now')}
          </>
        )}
      </button>
    </div>
  )
}

function AIUsageInner() {
  const searchParams = useSearchParams()
  const justPurchased = searchParams.get('purchased') === '1'
  const { locale } = useLanguage()
  const text = useCallback((key: string, fallback: string) => t(locale, key, fallback), [locale])

  const supabase = createClient()
  const { activeProfile: contextProfile, activePrograms: contextPrograms } = useBusinessContext()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [activePrograms, setActivePrograms] = useState<string[]>([])

  const actionLabel = useCallback(
    (action: string) => {
      const key = ACTION_LABEL_KEYS[action]
      return key ? text(key, action) : action
    },
    [text]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setUsageData(null)
        return
      }

      const usageRes = await fetch('/api/ai-usage')
      const data = await usageRes.json().catch(() => null)

      if (usageRes.ok && data) {
        setUsageData(data)
      } else {
        setUsageData(null)
        setLoadError(data?.error ?? text('aiUsage.creditsUnavailable', 'AI Credits unavailable'))
      }
    } catch (err) {
      console.error('[ai-usage page] load failed', err)
      setUsageData(null)
      setLoadError(text('aiUsage.creditsUnavailable', 'AI Credits unavailable'))
    } finally {
      setLoading(false)
    }
  }, [supabase, text])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile)
      const effectivePrograms = (contextProfile.effective_allowed_programs ?? contextPrograms ?? []).filter(Boolean)
      const nextPrograms = effectivePrograms.length > 0
        ? effectivePrograms
        : contextProfile.assigned_program
          ? [contextProfile.assigned_program]
          : []
      setActivePrograms((current) => (sameStringList(current, nextPrograms) ? current : nextPrograms))
    }
  }, [contextProfile, contextPrograms])

  useEffect(() => {
    if (!justPurchased) return

    let attempts = 0
    const maxAttempts = 5
    const intervalMs = 2000

    const poll = setInterval(async () => {
      attempts += 1
      try {
        const res = await fetch('/api/ai-usage')
        const data = await res.json().catch(() => null)
        if (res.ok && data) {
          if ((data.purchased_credits_remaining ?? 0) > 0 || attempts >= maxAttempts) {
            setUsageData(data)
            clearInterval(poll)
          }
        } else if (attempts >= maxAttempts) {
          clearInterval(poll)
        }
      } catch (err) {
        console.error('[ai-usage page] polling failed', err)
        if (attempts >= maxAttempts) {
          clearInterval(poll)
        }
      }
    }, intervalMs)

    return () => clearInterval(poll)
  }, [justPurchased])

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
        setBuyError(data.error ?? text('aiUsage.failedCheckout', 'Failed to start checkout. Please try again.'))
        setBuying(null)
      }
    } catch {
      setBuyError(text('aiUsage.networkError', 'Network error. Please try again.'))
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

  const monthlyPct =
    balance && limits ? Math.min(100, Math.round((balance.credits_used / limits.monthly_credits) * 100)) : 0

  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US'
  const resetDate = balance
    ? new Date(balance.billing_period_end).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'
  const startDate = balance
    ? new Date(balance.billing_period_start).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric' })
    : '—'

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
      <div className="relative isolate mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Zap size={22} className="text-green-500" /> {text('aiUsage.title', 'AI Usage')}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">{text('aiUsage.subtitle', 'Your AI credit balances and activity')}</p>
          </div>
          <button onClick={fetchData} disabled={loading} className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {text('aiUsage.refresh', 'Refresh')}
          </button>
        </div>

        {justPurchased && (
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            {purchasedRemaining > 0 ? (
              <CheckCircle size={18} className="mt-0.5 shrink-0 text-green-500" />
            ) : (
              <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-green-500" />
            )}
            <div>
              <p className="text-sm font-semibold text-green-800">
                {purchasedRemaining > 0
                  ? text('aiUsage.creditsAdded', 'Credits added successfully!')
                  : text('aiUsage.syncingCredits', 'Payment received - syncing credits...')}
              </p>
              <p className="mt-0.5 text-sm text-green-700">
                {purchasedRemaining > 0
                  ? `${purchasedRemaining} ${text('aiUsage.purchasedCreditsReady', 'purchased credits are active and ready to use.')}`
                  : text('aiUsage.balanceUpdating', 'This usually takes just a few seconds. Your balance will update automatically.')}
              </p>
            </div>
          </div>
        )}

        {loadError && !usageData && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{text('aiUsage.creditsUnavailable', 'AI Credits unavailable')}</p>
              <p className="mt-0.5 text-sm text-amber-700">{loadError}</p>
            </div>
          </div>
        )}

        {loading && !usageData ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-green-400" />
          </div>
        ) : (
          <>
            {usageData?.profile?.ai_suspended && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">{text('aiUsage.aiSuspended', 'AI Access Suspended')}</p>
                  <p className="mt-0.5 text-sm text-red-600">{text('aiUsage.contactSupport', 'Your AI access has been suspended. Please contact support.')}</p>
                </div>
              </div>
            )}

            {balance && limits && !usageData?.profile?.ai_suspended && (
              <>
                {monthlyPct >= 100 ? (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">{text('aiUsage.monthlyLimitReached', 'Monthly limit reached')}</p>
                      <p className="mt-0.5 text-sm text-red-600">
                        {text('aiUsage.resetsOn', 'Resets on')} <strong>{resetDate}</strong>
                        {isActiveMember ? ` — ${text('aiUsage.buyMoreNow', 'or buy extra credits below to keep going now.')}` : ''}
                      </p>
                    </div>
                  </div>
                ) : monthlyPct >= 85 ? (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
                    <div>
                      <p className="text-sm font-semibold text-amber-700">{text('aiUsage.runningLow', 'Running low on monthly credits')}</p>
                      <p className="mt-0.5 text-sm text-amber-600">
                        {text('aiUsage.resetsOn', 'Resets on')} <strong>{resetDate}</strong>
                        {isActiveMember ? ` — ${text('aiUsage.topUpNow', 'or top up with extra credits below.')}` : ''}
                      </p>
                    </div>
                  </div>
                ) : monthlyPct >= 70 ? (
                  <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-yellow-500" />
                    <p className="text-sm text-yellow-700">
                      {text('aiUsage.usedPercent', "You've used")} {monthlyPct}% {text('aiUsage.monthlyCredits', 'of your monthly AI credits.')}
                    </p>
                  </div>
                ) : null}
              </>
            )}

            <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{text('aiUsage.program', 'Program')}</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">
                    {getProgramShortLabel(usageData?.profile?.assigned_program ?? null)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{text('aiUsage.billingPeriod', 'Billing Period')}</p>
                  <p className="mt-0.5 text-sm text-gray-700">{startDate} → {resetDate}</p>
                </div>
              </div>

              {balance && limits ? (
                <UsageMeter
                  used={balance.credits_used}
                  total={limits.monthly_credits}
                  label={text('aiUsage.includedMonthlyCredits', 'Included Monthly Credits')}
                  text={text}
                />
              ) : (
                <div className="py-4 text-center text-sm text-gray-400">{text('aiUsage.noUsage', 'No usage data available for this period.')}</div>
              )}

              {purchasedRemaining > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-purple-100 bg-purple-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-purple-500" />
                    <div>
                      <p className="text-sm font-semibold text-purple-800">{text('aiUsage.extraCredits', 'Extra AI Credits')}</p>
                      <p className="text-xs text-purple-600">{text('aiUsage.autoUseExtra', 'Used automatically when monthly credits run out')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-extrabold text-purple-700">{purchasedRemaining}</span>
                    <p className="text-xs text-purple-500">{text('aiUsage.available', 'available')}</p>
                  </div>
                </div>
              )}
            </div>

            {balance && limits && (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{text('aiUsage.todayCredits', "Today's Credits")}</p>
                  <UsageMeter used={balance.daily_credits_used} total={limits.daily_credit_cap} label="" text={text} />
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{text('aiUsage.advancedActions', 'Advanced Actions Today')}</p>
                  <UsageMeter used={balance.heavy_actions_used_today} total={limits.max_heavy_actions_per_day} label="" text={text} />
                  <p className="mt-2 text-[10px] text-gray-400">{text('aiUsage.documentReviewsEtc', 'Document reviews, deep analysis, etc.')}</p>
                </div>
              </div>
            )}

            {isActiveMember && creditPacks.length > 0 && (
              <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100">
                    <Plus size={18} className="text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">{text('aiUsage.buyExtraTitle', 'Buy Extra AI Credits')}</h2>
                    <p className="text-xs leading-snug text-gray-500">{text('aiUsage.buyExtraSubtitle', 'One-time purchase - Never expire while your account is active - Used after monthly credits')}</p>
                  </div>
                </div>

                {buyError && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <AlertTriangle size={14} className="shrink-0 text-red-500" />
                    <p className="text-xs text-red-600">{buyError}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {creditPacks.map((pack) => (
                    <PackCard key={pack.id} pack={pack} onBuy={handleBuy} buying={buying} text={text} />
                  ))}
                </div>

                <p className="text-center text-[10px] leading-relaxed text-gray-400">
                  {text('aiUsage.secureCheckout', 'Secure checkout via Stripe - no subscription - credits are non-refundable once used')}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                <TrendingUp size={16} className="text-green-500" /> {text('aiUsage.howUsed', 'How Credits Are Used')}
              </h2>
              <p className="mb-4 text-xs text-gray-500">
                {text('aiUsage.howCreditsUsed', 'Different AI actions consume different credit amounts. Extra (purchased) credits are used automatically when your monthly allowance runs out.')}
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
                  <div key={action as string} className="flex items-center justify-between border-b border-gray-50 py-1.5 last:border-0">
                    <span className="text-xs text-gray-600">{actionLabel(action as string)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        (cost as number) <= 2
                          ? 'bg-green-50 text-green-700'
                          : (cost as number) <= 4
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {cost} {text((cost as number) === 1 ? 'aiUsage.credit' : 'aiUsage.creditsPlural', (cost as number) === 1 ? 'credit' : 'credits')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {usageData?.recent_events && usageData.recent_events.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Clock size={15} className="text-gray-400" /> {text('aiUsage.recentActivity', 'Recent AI Activity')}
                  </h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {usageData.recent_events.map((evt) => (
                    <div key={evt.id} className="flex items-center gap-4 px-5 py-3">
                      <div
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          evt.request_status === 'success'
                            ? 'bg-green-400'
                            : evt.request_status === 'blocked'
                              ? 'bg-red-400'
                              : 'bg-gray-300'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-700">{actionLabel(evt.action_type)}</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(evt.created_at).toLocaleString(dateLocale)}
                        </p>
                      </div>
                      <div className="shrink-0 space-y-0.5 text-right">
                        {evt.request_status === 'success' ? (
                          <>
                            <span className="block text-xs font-bold text-gray-700">-{evt.credits_charged} cr</span>
                            {evt.credit_source === 'purchased' && (
                              <span className="text-[9px] font-medium text-purple-500">{text('aiUsage.extra', 'extra')}</span>
                            )}
                          </>
                        ) : evt.request_status === 'blocked' ? (
                          <span className="text-xs font-medium text-red-500">{text('aiUsage.blocked', 'Blocked')}</span>
                        ) : (
                          <span className="text-xs font-medium text-gray-400">{text('aiUsage.noCharge', 'No charge')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-600">{text('aiUsage.aboutTitle', 'About AI Credits')}</p>
              <ul className="list-inside list-disc space-y-1 text-xs text-gray-500">
                <li>{text('aiUsage.aboutMonthlyReset', 'Included monthly credits reset each billing cycle - unused credits do not roll over')}</li>
                <li>{text('aiUsage.aboutNeverExpire', 'Purchased extra credits never expire while your account is active')}</li>
                <li>{text('aiUsage.aboutMonthlyFirst', 'Your monthly credits are always used first; extra credits kick in automatically')}</li>
                <li>{text('aiUsage.aboutHeavyActions', 'Some actions (document reviews, deep analysis) consume more credits')}</li>
                <li>{text('aiUsage.aboutNoCharge', 'Failed or blocked requests are not charged')}</li>
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
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 size={24} className="animate-spin text-green-400" />
        </div>
      }
    >
      <AIUsageInner />
    </Suspense>
  )
}
