'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { SITE_URL, SUPPORT_EMAIL } from '@/lib/site-config'
import {
  Copy, CheckCheck, Mail, AlertCircle, User, Calendar, Tag,
  TrendingUp, Zap, CheckCircle, Clock, ExternalLink, RefreshCw,
  DollarSign, AlertTriangle,
} from 'lucide-react'

interface Affiliate {
  id: string
  name: string
  email: string
  referral_code: string
  status: string
  commission_rate: number
  commission_tier: string | null
  has_free_program_b_access: boolean
  created_at: string
}

interface StripeStatus {
  status: 'not_connected' | 'pending' | 'active' | 'restricted'
  stripe_account_id: string | null
  payouts_enabled?: boolean
  details_submitted?: boolean
  requirements?: { currently_due?: string[]; errors?: { reason: string }[] }
}

interface PayoutData {
  stripe_connect_status: string
  balances: {
    pending_cents: number
    available_cents: number
    paid_cents: number
  }
  minimum_payout_cents: number
  next_payout_date: string
  payouts: {
    id: string
    amount_cents: number
    status: string
    paid_at: string | null
    created_at: string
    stripe_transfer_id: string | null
  }[]
}

function fmt(n: number) {
  return `${(n * 100).toFixed(0)}%`
}

function fmtCents(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  pending:   'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  suspended: 'bg-red-100 dark:bg-red-900/40 text-red-600',
}

// ─── Stripe Connect Status Card ───────────────────────────────────────────────
function StripeConnectSection() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null)
  const [payoutData, setPayoutData] = useState<PayoutData | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [flashSuccess, setFlashSuccess] = useState(false)
  const [flashRefresh, setFlashRefresh] = useState(false)

  const getFriendlyConnectError = useCallback((reason: string | null) => {
    switch (reason) {
      case 'auth':
        return 'Please sign in again before starting Stripe onboarding.'
      case 'missing_partner':
        return 'We could not find your partner account. Please contact support.'
      case 'missing_email':
        return 'Your partner account is missing an email address. Please contact support before connecting Stripe.'
      default:
        return 'Unable to start Stripe onboarding right now. Please try again.'
    }
  }, [])

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const [statusRes, payoutRes] = await Promise.all([
        fetch('/api/affiliate/connect/status'),
        fetch('/api/affiliate/payouts'),
      ])
      const statusData = await statusRes.json()
      const payoutJson = await payoutRes.json()
      if (!statusData.error) setStripeStatus(statusData)
      if (!payoutJson.error) setPayoutData(payoutJson)
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Handle return from Stripe onboarding
  useEffect(() => {
    const connect = searchParams.get('connect')
    if (connect === 'success') {
      setFlashSuccess(true)
      setConnectError(null)
      loadStatus()
      router.replace('/affiliate/account', { scroll: false })
    } else if (connect === 'refresh') {
      setFlashRefresh(true)
      setConnectError(null)
      router.replace('/affiliate/account', { scroll: false })
    } else if (connect === 'error') {
      setConnectError(getFriendlyConnectError(searchParams.get('reason')))
      router.replace('/affiliate/account', { scroll: false })
    }
  }, [searchParams, loadStatus, router, getFriendlyConnectError])

  const handleConnect = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (connecting) return
    setConnecting(true)
    setConnectError(null)
    try {
      const res = await fetch('/api/affiliate/connect/onboard', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setConnectError(data.error ?? 'Unable to start Stripe onboarding right now. Please try again.')
        setConnecting(false)
      }
    } catch {
      setConnectError('Network error. Please check your connection and try again.')
      setConnecting(false)
    }
  }

  if (loadingStatus) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <div className="h-5 w-40 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse mb-4" />
        <div className="h-20 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
      </div>
    )
  }

  const status = stripeStatus?.status ?? 'not_connected'

  return (
    <div className="space-y-4">

      {/* Success flash */}
      {flashSuccess && (
        <div className="flex items-start gap-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl px-5 py-4">
          <CheckCircle size={18} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">Stripe account connected!</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
              Your account is being verified. Payouts will activate once Stripe confirms your details.
            </p>
          </div>
        </div>
      )}

      {/* Refresh flash */}
      {flashRefresh && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl px-5 py-4">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Onboarding session expired</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Your Stripe session timed out. Click the button below to restart.
            </p>
          </div>
        </div>
      )}

      {connectError && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4">
          <AlertCircle size={18} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Stripe setup couldn&apos;t start</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{connectError}</p>
          </div>
        </div>
      )}

      {/* Connect card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center justify-center shrink-0">
              <Zap size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">Stripe Payout Account</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5">Required to receive commission payouts</p>
            </div>
          </div>

          {/* Status badge */}
          {status === 'active' && (
            <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full uppercase">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Active
            </span>
          )}
          {status === 'pending' && (
            <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full uppercase">
              <Clock size={10} />
              Pending
            </span>
          )}
          {status === 'not_connected' && (
            <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 dark:text-gray-500 rounded-full uppercase">
              Not Connected
            </span>
          )}
          {status === 'restricted' && (
            <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full uppercase">
              Restricted
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">

          {/* NOT CONNECTED */}
          {status === 'not_connected' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-1">Connect your bank to receive payouts</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 leading-relaxed">
                  We use Stripe Connect to send your commission payments directly to your bank account.
                  Setup takes about 5 minutes and your information is securely handled by Stripe.
                </p>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="shrink-0 flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {connecting ? (
                  <><RefreshCw size={15} className="animate-spin" /> Redirecting...</>
                ) : (
                  <><Zap size={15} /> Connect with Stripe</>
                )}
              </button>
            </div>
          )}

          {/* PENDING */}
          {status === 'pending' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4">
                <Clock size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Verification in progress</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                    {stripeStatus?.details_submitted
                      ? 'Your details have been submitted. Stripe is reviewing your account — this usually takes 1–2 business days.'
                      : 'Your Stripe account was created but onboarding isn\'t complete. Click below to finish setting it up.'}
                  </p>
                </div>
              </div>
              {!stripeStatus?.details_submitted && (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  {connecting ? (
                    <><RefreshCw size={15} className="animate-spin" /> Redirecting...</>
                  ) : (
                    <><ExternalLink size={15} /> Complete Stripe Setup</>
                  )}
                </button>
              )}
              {stripeStatus?.requirements?.currently_due && stripeStatus.requirements.currently_due.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
                  <p className="font-semibold mb-1">Still required by Stripe:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {stripeStatus.requirements.currently_due.slice(0, 5).map((req) => (
                      <li key={req}>{req.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ACTIVE */}
          {status === 'active' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 rounded-xl p-4">
                <CheckCircle size={16} className="text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">Payouts enabled</p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                    Your Stripe account is active. Commissions are paid out automatically on the 1st of each month.
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Account ID: <span className="font-mono">{stripeStatus?.stripe_account_id}</span>
              </p>
            </div>
          )}

          {/* RESTRICTED */}
          {status === 'restricted' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 rounded-xl p-4">
                <AlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">Stripe needs more information</p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-0.5 leading-relaxed">
                    Your payout account has restrictions or missing requirements. Reopen Stripe to finish onboarding and restore payouts.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {connecting ? (
                  <><RefreshCw size={15} className="animate-spin" /> Redirecting...</>
                ) : (
                  <><ExternalLink size={15} /> Resume Stripe Setup</>
                )}
              </button>
              {stripeStatus?.requirements?.currently_due && stripeStatus.requirements.currently_due.length > 0 && (
                <div className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                  <p className="font-semibold mb-1">Still required by Stripe:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {stripeStatus.requirements.currently_due.slice(0, 5).map((req) => (
                      <li key={req}>{req.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Payout balance — only show if connected */}
      {status !== 'not_connected' && payoutData && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <DollarSign size={17} className="text-indigo-600 dark:text-indigo-400" />
            Payout Balance
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Holding (7-day)', value: fmtCents(payoutData.balances.pending_cents), color: 'text-gray-600 dark:text-gray-400 dark:text-gray-500' },
              { label: 'Available', value: fmtCents(payoutData.balances.available_cents), color: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Total Paid', value: fmtCents(payoutData.balances.paid_cents), color: 'text-green-600 dark:text-green-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-3 text-center">
                <p className={`text-base font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
            <span>Next payout: <strong className="text-gray-700 dark:text-gray-300">{fmtDateShort(payoutData.next_payout_date)}</strong></span>
            <span>Min payout: <strong className="text-gray-700 dark:text-gray-300">{fmtCents(payoutData.minimum_payout_cents)}</strong></span>
          </div>

          {/* Recent payouts */}
          {payoutData.payouts.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Recent Payouts</p>
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {payoutData.payouts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{fmtCents(p.amount_cents)}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDateShort(p.paid_at ?? p.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        p.status === 'paid' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
                        p.status === 'failed' ? 'bg-red-100 dark:bg-red-900/40 text-red-600' :
                        'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                      }`}>
                        {p.status}
                      </span>
                      {p.stripe_transfer_id && (
                        <a
                          href={`https://dashboard.stripe.com/transfers/${p.stripe_transfer_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:text-indigo-400 transition-colors"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AffiliateAccountPage() {
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  useEffect(() => {
    fetch('/api/affiliate/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setAffiliate(d.affiliate)
      })
      .catch(() => setError('Failed to load account'))
      .finally(() => setLoading(false))
  }, [])

  const referralLink = affiliate
  ? `${SITE_URL}/?ref=${affiliate.referral_code}`
    : ''

  const copyCode = () => {
    if (!affiliate) return
    navigator.clipboard.writeText(affiliate.referral_code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-6 pt-16 lg:pt-0">
        <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (error || !affiliate) {
    return (
      <div className="pt-16 lg:pt-0 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Failed to load account</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const statusColor = STATUS_COLORS[affiliate.status] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 dark:text-gray-500'

  return (
    <div className="space-y-6 pt-16 lg:pt-0">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Account</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Your affiliate profile, payout setup, and partner details.</p>
      </div>

      {/* Profile card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="h-2 bg-indigo-600" />
        <div className="px-6 py-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {affiliate.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{affiliate.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">{affiliate.email}</p>
            </div>
            <span className={`ml-auto shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase ${statusColor}`}>
              {affiliate.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <User size={15} className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Full Name</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{affiliate.name}</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <Mail size={15} className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Email Address</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{affiliate.email}</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <Tag size={15} className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Partner Code</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">{affiliate.referral_code}</p>
                  <button onClick={copyCode} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:text-indigo-400 transition-colors">
                    {copiedCode ? <CheckCheck size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <Calendar size={15} className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Member Since</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtDate(affiliate.created_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commission tier */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <TrendingUp size={17} className="text-indigo-600 dark:text-indigo-400" />
          Commission Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800 rounded-xl px-4 py-3.5">
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wide mb-1">Base Commission</p>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">80% setup + 20% recurring</p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">Partner-Assisted tier</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3.5">
            <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wide mb-1">Closed-Deal Tier</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">30%</p>
            {affiliate.has_free_program_b_access && (
              <span className="inline-flex items-center mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full uppercase">
                Program B Access Unlocked
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stripe Connect + Payout Balance */}
      <StripeConnectSection />

      {/* Partner link */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Your Partner Link</h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 font-mono text-sm text-gray-700 dark:text-gray-300 truncate">
            {referralLink}
          </div>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shrink-0 w-full sm:w-auto"
          >
            {copiedLink ? (
              <><CheckCheck size={15} /> Copied!</>
            ) : (
              <><Copy size={15} /> Copy</>
            )}
          </button>
        </div>
      </div>

      {/* Support */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 flex flex-col sm:flex-row items-start gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Need to update your information?</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 leading-relaxed">
            Name and email changes are handled by our team. Reach out and we&apos;ll update your account within 1 business day.
          </p>
        </div>
        <a
  href={`mailto:${SUPPORT_EMAIL}`}
          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-700 dark:text-indigo-400 transition-colors w-full sm:w-auto"
        >
          <Mail size={15} />
          Contact Support
        </a>
      </div>
    </div>
  )
}
