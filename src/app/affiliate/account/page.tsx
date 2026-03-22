'use client'
import { useEffect, useState } from 'react'
import { Copy, CheckCheck, Mail, AlertCircle, User, Calendar, Tag, TrendingUp } from 'lucide-react'

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

function fmt(n: number) {
  return `${(n * 100).toFixed(0)}%`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-600',
}

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
    ? `https://sourcifylending.com/?ref=${affiliate.referral_code}`
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
        <div className="h-8 w-40 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (error || !affiliate) {
    return (
      <div className="pt-16 lg:pt-0 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Failed to load account</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const statusColor = STATUS_COLORS[affiliate.status] ?? 'bg-gray-100 text-gray-500'

  return (
    <div className="space-y-6 pt-16 lg:pt-0">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <p className="text-sm text-gray-500 mt-1">Your affiliate profile and referral details.</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Avatar strip */}
        <div className="h-2 bg-indigo-600" />
        <div className="px-6 py-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-bold text-indigo-600">
                {affiliate.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{affiliate.name}</h2>
              <p className="text-sm text-gray-500">{affiliate.email}</p>
            </div>
            <span className={`ml-auto shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase ${statusColor}`}>
              {affiliate.status}
            </span>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <User size={15} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Full Name</p>
                <p className="text-sm font-semibold text-gray-900">{affiliate.name}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <Mail size={15} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Email Address</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{affiliate.email}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <Tag size={15} className="text-gray-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 mb-0.5">Referral Code</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold font-mono text-indigo-600">{affiliate.referral_code}</p>
                  <button
                    onClick={copyCode}
                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                  >
                    {copiedCode ? <CheckCheck size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <Calendar size={15} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Member Since</p>
                <p className="text-sm font-semibold text-gray-900">{fmtDate(affiliate.created_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commission tier */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={17} className="text-indigo-600" />
          Commission Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3.5">
            <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide mb-1">Commission Rate</p>
            <p className="text-2xl font-bold text-indigo-700">{fmt(affiliate.commission_rate)}</p>
            <p className="text-xs text-indigo-500 mt-0.5">Per eligible payment</p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Commission Tier</p>
            <p className="text-sm font-bold text-gray-900 capitalize">
              {affiliate.commission_tier || 'Standard'}
            </p>
            {affiliate.has_free_program_b_access && (
              <span className="inline-flex items-center mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full uppercase">
                Program B Access Unlocked
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Referral link */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-bold text-gray-900 mb-3">Your Referral Link</h2>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm text-gray-700 truncate">
            {referralLink}
          </div>
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shrink-0"
          >
            {copiedLink ? (
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

      {/* Read-only notice + support */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-start gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold text-gray-700 mb-1">Need to update your information?</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Name and email changes are handled by our team. Reach out and we&apos;ll update your account within 1 business day.
          </p>
        </div>
        <a
          href="mailto:abel@sourcifylending.com"
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl hover:border-indigo-300 hover:text-indigo-700 transition-colors"
        >
          <Mail size={15} />
          Contact Support
        </a>
      </div>
    </div>
  )
}
