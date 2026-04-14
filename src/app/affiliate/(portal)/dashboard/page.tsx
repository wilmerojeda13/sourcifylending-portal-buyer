'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  MousePointerClick,
  Users,
  DollarSign,
  Clock,
  Copy,
  CheckCheck,
  Lock,
  Unlock,
  TrendingUp,
  ChevronRight,
  AlertCircle,
  FlaskConical,
  Loader2,
  Banknote as BanknoteIcon,
} from 'lucide-react'

interface DashboardData {
  affiliate: {
    id: string
    name: string
    referral_code: string
    has_free_program_b_access: boolean
    qualification_start_date: string | null
    commission_rate: number
    status: string
  }
  stats: {
    totalClicks: number
    totalReferrals: number
    activeReferrals: number
    totalEarned: number
    pendingCommissions: number
    approvedCommissions: number
    paidCommissions: number
    setupEarnings: number
    recurringEarnings: number
    freeAccessStatus: 'locked' | 'qualifying' | 'unlocked'
    activeCount: number
    daysRemaining: number | null
    threshold: number
    is_demo: boolean
  }
}

/** Commission amounts are stored in cents — divide by 100 before displaying */
function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

export default function AffiliateDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/affiliate/dashboard')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  const referralLink = data
    ? `https://sourcifylending.com/?ref=${data.affiliate.referral_code}`
    : ''

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-6 pt-16 lg:pt-0">
        {/* Skeleton */}
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="pt-16 lg:pt-0 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Failed to load dashboard</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const { affiliate, stats } = data
  const progressPct = Math.min(100, Math.round((stats.activeCount / stats.threshold) * 100))

  const freeAccessColor =
    stats.freeAccessStatus === 'unlocked'
      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
      : stats.freeAccessStatus === 'qualifying'
      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'

  const freeAccessBarColor =
    stats.freeAccessStatus === 'unlocked'
      ? 'bg-green-500'
      : stats.freeAccessStatus === 'qualifying'
      ? 'bg-amber-500'
      : 'bg-indigo-500'

  return (
    <div className="space-y-6 pt-16 lg:pt-0">

      {/* Welcome */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Hi {affiliate.name.split(' ')[0]}! 👋
          </h1>
          {stats?.is_demo && (
            <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full text-xs font-semibold">
              <FlaskConical size={12} />
              Demo Account
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Here&apos;s your partner overview.</p>
      </div>

      {/* Partner Link Card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Your Partner Link</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Share this link for partner-assisted clients. Code:{' '}
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{affiliate.referral_code}</span>
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 rounded-full uppercase">
            Active
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
          <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 font-mono text-sm text-gray-700 dark:text-gray-300 truncate">
            {referralLink}
          </div>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shrink-0 w-full sm:w-auto"
          >
            {copied ? (
              <>
                <CheckCheck size={15} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={15} />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Partner Clicks',
            value: stats.totalClicks.toLocaleString(),
            icon: MousePointerClick,
            color: 'text-blue-600',
            bg: 'bg-blue-50 dark:bg-blue-950/30',
          },
          {
            label: 'Partner Clients',
            value: stats.activeReferrals.toLocaleString(),
            icon: Users,
            color: 'text-green-600 dark:text-green-400',
            bg: 'bg-green-50 dark:bg-green-950/30',
          },
          {
            label: 'Total Earned',
            value: fmt(stats.totalEarned),
            icon: DollarSign,
            color: 'text-indigo-600 dark:text-indigo-400',
            bg: 'bg-indigo-50 dark:bg-indigo-950/30',
          },
          {
            label: 'Pending Payouts',
            value: fmt(stats.pendingCommissions),
            icon: Clock,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-950/30',
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm px-5 py-5"
          >
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{value}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm px-5 py-5">
          <div className="text-xs uppercase tracking-wide text-gray-400">Setup Earnings</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{fmt(stats.setupEarnings)}</div>
          <div className="text-xs text-gray-400 mt-1">80% of collected setup fees on partner-assisted Program A and B deals.</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm px-5 py-5">
          <div className="text-xs uppercase tracking-wide text-gray-400">Monthly Commissions</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{fmt(stats.recurringEarnings)}</div>
          <div className="text-xs text-gray-400 mt-1">20% of collected recurring subscription revenue from your partner clients.</div>
        </div>
      </div>

      {/* Free Access Status */}
      <div className={`rounded-2xl border p-6 ${freeAccessColor}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              {stats.freeAccessStatus === 'unlocked' ? (
                <Unlock size={18} className="text-green-600 dark:text-green-400" />
              ) : (
                <Lock size={18} className="text-gray-400 dark:text-gray-500" />
              )}
              Program B Free Access
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
              Refer {stats.threshold} active clients to unlock free Program B access for yourself.
            </p>
          </div>
          {stats.freeAccessStatus === 'unlocked' && (
            <span className="shrink-0 text-xs font-bold px-2.5 py-1 bg-green-600 text-white rounded-full uppercase">
              Unlocked
            </span>
          )}
          {stats.freeAccessStatus === 'qualifying' && (
            <span className="shrink-0 text-xs font-bold px-2.5 py-1 bg-amber-500 text-white rounded-full uppercase">
              Qualifying
            </span>
          )}
          {stats.freeAccessStatus === 'locked' && (
            <span className="shrink-0 text-xs font-bold px-2.5 py-1 bg-gray-300 text-gray-700 dark:text-gray-300 rounded-full uppercase">
              Locked
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500 mb-1.5">
            <span>
              {stats.activeCount} / {stats.threshold} active clients
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2.5 bg-white dark:bg-gray-900/80 rounded-full border border-gray-200 dark:border-gray-700">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${freeAccessBarColor}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {stats.freeAccessStatus === 'qualifying' && stats.daysRemaining !== null && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-2">
            {stats.daysRemaining === 0
              ? 'Unlock processing — check back soon!'
              : `${stats.daysRemaining} day${stats.daysRemaining !== 1 ? 's' : ''} remaining in qualification period`}
          </p>
        )}
        {stats.freeAccessStatus === 'unlocked' && (
          <p className="text-xs font-medium text-green-700 dark:text-green-400 mt-2">
            Congratulations! Your Program B access is active.
          </p>
        )}
        {stats.freeAccessStatus === 'locked' && (
          <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-2">
            You need {stats.threshold - stats.activeCount} more active{' '}
            {stats.threshold - stats.activeCount === 1 ? 'client' : 'clients'} to start qualifying.
          </p>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/affiliate/referrals"
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group flex items-center gap-4"
        >
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-700 dark:text-indigo-400 transition-colors">
              View Partner Clients
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {stats.totalReferrals} total · {stats.activeReferrals} active
            </p>
          </div>
          <ChevronRight size={16} className="text-gray-400 dark:text-gray-500 group-hover:text-indigo-500 dark:text-indigo-400 transition-colors" />
        </Link>

        <Link
          href="/affiliate/commissions"
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group flex items-center gap-4"
        >
          <div className="w-10 h-10 bg-green-50 dark:bg-green-950/30 rounded-xl flex items-center justify-center">
            <TrendingUp size={20} className="text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-700 dark:text-indigo-400 transition-colors">
              Commission Ledger
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {fmt(stats.approvedCommissions)} approved · {fmt(stats.paidCommissions)} paid
            </p>
          </div>
          <ChevronRight size={16} className="text-gray-400 dark:text-gray-500 group-hover:text-indigo-500 dark:text-indigo-400 transition-colors" />
        </Link>
      </div>

      {/* Payouts */}
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">Payouts</h2>
        <PayoutSection />
      </div>
    </div>
  )
}

function PayoutSection() {
  const [payoutData, setPayoutData] = useState<{
    stripe_connect_status: string
    balances: { pending_cents: number; available_cents: number; paid_cents: number }
    minimum_payout_cents: number
    next_payout_date: string
    payouts: Array<{ id: string; amount_cents: number; status: string; paid_at: string | null; created_at: string }>
  } | null>(null)
  const [connectLoading, setConnectLoading] = useState(false)
  const [loadingPayout, setLoadingPayout] = useState(true)

  useEffect(() => {
    fetch('/api/affiliate/payouts')
      .then(r => r.json())
      .then(setPayoutData)
      .catch(() => {})
      .finally(() => setLoadingPayout(false))
  }, [])

  async function handleConnect() {
    setConnectLoading(true)
    try {
      const res = await fetch('/api/affiliate/connect/onboard', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {}
    setConnectLoading(false)
  }

  const fmtCents = (cents: number) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const isConnected = payoutData?.stripe_connect_status === 'active'
  const isPending = payoutData?.stripe_connect_status === 'pending'
  const nextPayout = payoutData?.next_payout_date ? new Date(payoutData.next_payout_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'
  const availableCents = payoutData?.balances.available_cents ?? 0
  const meetsMinimum = availableCents >= (payoutData?.minimum_payout_cents ?? 10000)

  if (loadingPayout) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading payout info…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stripe Connect Setup Banner */}
      {!isConnected && (
        <div className={`rounded-2xl border p-5 flex items-start justify-between gap-4 flex-wrap ${
          isPending
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
            : 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-700'
        }`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BanknoteIcon size={18} className={isPending ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'} />
              <span className={`font-bold text-sm ${isPending ? 'text-amber-900 dark:text-amber-200' : 'text-indigo-900 dark:text-indigo-200'}`}>
                {isPending ? 'Complete Your Payout Setup' : 'Connect Your Bank Account'}
              </span>
            </div>
            <p className={`text-xs ${isPending ? 'text-amber-700 dark:text-amber-400' : 'text-indigo-700 dark:text-indigo-400'}`}>
              {isPending
                ? 'Your Stripe account is set up but needs a few more details before payouts can be sent.'
                : 'Connect your bank account to receive automatic monthly commission payouts.'}
            </p>
          </div>
          <button
            onClick={handleConnect}
            disabled={connectLoading}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap disabled:opacity-60 ${
              isPending
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {connectLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            {isPending ? 'Complete Setup' : 'Connect with Stripe'}
          </button>
        </div>
      )}

      {/* Balance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Available Balance',
            value: fmtCents(availableCents),
            sub: meetsMinimum && isConnected ? 'Will pay out on ' + nextPayout : availableCents > 0 ? `Min. $${(payoutData?.minimum_payout_cents ?? 10000) / 100} needed` : 'Nothing available yet',
            color: meetsMinimum && isConnected ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100',
          },
          {
            label: 'In Hold Period',
            value: fmtCents(payoutData?.balances.pending_cents ?? 0),
            sub: 'Released after 7 days',
            color: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'Total Paid Out',
            value: fmtCents(payoutData?.balances.paid_cents ?? 0),
            sub: 'All time',
            color: 'text-indigo-600 dark:text-indigo-400',
          },
          {
            label: 'Next Payout',
            value: isConnected ? nextPayout : '—',
            sub: isConnected ? (meetsMinimum ? 'You qualify ✓' : `Need ${fmtCents((payoutData?.minimum_payout_cents ?? 10000) - availableCents)} more`) : 'Connect to enable',
            color: 'text-gray-900 dark:text-gray-100',
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-4">
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5 font-medium">{label}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Recent Payouts */}
      {(payoutData?.payouts ?? []).length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Payouts</span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {payoutData!.payouts.slice(0, 5).map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtCents(p.amount_cents)}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(p.paid_at ?? p.created_at)}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  p.status === 'paid' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
                  p.status === 'failed' ? 'bg-red-100 dark:bg-red-900/40 text-red-600' :
                  'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                }`}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
