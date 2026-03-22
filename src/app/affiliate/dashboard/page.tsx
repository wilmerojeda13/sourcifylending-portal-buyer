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
    freeAccessStatus: 'locked' | 'qualifying' | 'unlocked'
    activeCount: number
    daysRemaining: number | null
    threshold: number
    is_demo: boolean
  }
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
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
        <div className="h-8 w-48 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-28 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-40 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="pt-16 lg:pt-0 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Failed to load dashboard</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const { affiliate, stats } = data
  const progressPct = Math.min(100, Math.round((stats.activeCount / stats.threshold) * 100))

  const freeAccessColor =
    stats.freeAccessStatus === 'unlocked'
      ? 'bg-green-50 border-green-200'
      : stats.freeAccessStatus === 'qualifying'
      ? 'bg-amber-50 border-amber-200'
      : 'bg-gray-50 border-gray-200'

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
          <h1 className="text-2xl font-bold text-gray-900">
            Hi {affiliate.name.split(' ')[0]}! 👋
          </h1>
          {stats?.is_demo && (
            <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold">
              <FlaskConical size={12} />
              Demo Account
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">Here&apos;s your affiliate overview.</p>
      </div>

      {/* Referral Link Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-bold text-gray-900">Your Referral Link</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Share this link to earn commissions. Code:{' '}
              <span className="font-mono font-bold text-indigo-600">{affiliate.referral_code}</span>
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full uppercase">
            Active
          </span>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm text-gray-700 truncate">
            {referralLink}
          </div>
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shrink-0"
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
            label: 'Link Clicks',
            value: stats.totalClicks.toLocaleString(),
            icon: MousePointerClick,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Active Clients',
            value: stats.activeReferrals.toLocaleString(),
            icon: Users,
            color: 'text-green-600',
            bg: 'bg-green-50',
          },
          {
            label: 'Total Earned',
            value: fmt(stats.totalEarned),
            icon: DollarSign,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
          },
          {
            label: 'Pending',
            value: fmt(stats.pendingCommissions),
            icon: Clock,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-5"
          >
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <div className="text-xl font-bold text-gray-900 leading-tight">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Free Access Status */}
      <div className={`rounded-2xl border p-6 ${freeAccessColor}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              {stats.freeAccessStatus === 'unlocked' ? (
                <Unlock size={18} className="text-green-600" />
              ) : (
                <Lock size={18} className="text-gray-400" />
              )}
              Program B Free Access
            </h2>
            <p className="text-xs text-gray-500 mt-1">
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
            <span className="shrink-0 text-xs font-bold px-2.5 py-1 bg-gray-300 text-gray-700 rounded-full uppercase">
              Locked
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
            <span>
              {stats.activeCount} / {stats.threshold} active clients
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2.5 bg-white/80 rounded-full border border-gray-200">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${freeAccessBarColor}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {stats.freeAccessStatus === 'qualifying' && stats.daysRemaining !== null && (
          <p className="text-xs font-medium text-amber-700 mt-2">
            {stats.daysRemaining === 0
              ? 'Unlock processing — check back soon!'
              : `${stats.daysRemaining} day${stats.daysRemaining !== 1 ? 's' : ''} remaining in qualification period`}
          </p>
        )}
        {stats.freeAccessStatus === 'unlocked' && (
          <p className="text-xs font-medium text-green-700 mt-2">
            Congratulations! Your Program B access is active.
          </p>
        )}
        {stats.freeAccessStatus === 'locked' && (
          <p className="text-xs text-gray-500 mt-2">
            You need {stats.threshold - stats.activeCount} more active{' '}
            {stats.threshold - stats.activeCount === 1 ? 'client' : 'clients'} to start qualifying.
          </p>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/affiliate/referrals"
          className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 transition-all group flex items-center gap-4"
        >
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">
              View Referrals
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {stats.totalReferrals} total · {stats.activeReferrals} active
            </p>
          </div>
          <ChevronRight size={16} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
        </Link>

        <Link
          href="/affiliate/commissions"
          className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 transition-all group flex items-center gap-4"
        >
          <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
            <TrendingUp size={20} className="text-green-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">
              Commission Ledger
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmt(stats.approvedCommissions)} approved · {fmt(stats.paidCommissions)} paid
            </p>
          </div>
          <ChevronRight size={16} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
        </Link>
      </div>
    </div>
  )
}
