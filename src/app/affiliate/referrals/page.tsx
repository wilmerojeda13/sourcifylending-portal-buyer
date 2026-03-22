'use client'
import { useEffect, useState, useCallback } from 'react'
import { Users, AlertCircle, ChevronLeft, ChevronRight, Share2 } from 'lucide-react'

type ReferralStatus = 'clicked' | 'signed_up' | 'active' | 'past_due' | 'canceled' | 'refunded' | 'chargeback'

interface Referral {
  id: string
  lead_name: string | null
  lead_email: string | null
  program: string | null
  referral_status: ReferralStatus
  subscription_active: boolean
  created_at: string
  last_payment_date: string | null
}

interface ReferralsData {
  referrals: Referral[]
  total: number
  page: number
  limit: number
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_CONFIG: Record<ReferralStatus, { label: string; color: string }> = {
  active:      { label: 'Active',      color: 'bg-green-100 text-green-700' },
  signed_up:   { label: 'Signed Up',   color: 'bg-blue-100 text-blue-700' },
  clicked:     { label: 'Clicked',     color: 'bg-gray-100 text-gray-500' },
  past_due:    { label: 'Past Due',    color: 'bg-amber-100 text-amber-700' },
  canceled:    { label: 'Canceled',    color: 'bg-red-100 text-red-500' },
  refunded:    { label: 'Refunded',    color: 'bg-red-100 text-red-500' },
  chargeback:  { label: 'Chargeback',  color: 'bg-red-100 text-red-600' },
}

function StatusBadge({ status }: { status: ReferralStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full uppercase ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

export default function AffiliateReferralsPage() {
  const [data, setData] = useState<ReferralsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const load = useCallback((p: number) => {
    setLoading(true)
    fetch(`/api/affiliate/referrals?page=${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Failed to load referrals'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(page) }, [page, load])

  const referrals = data?.referrals ?? []
  const total = data?.total ?? 0
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  // Summary counts derived from current page data — for a real summary, the API would return totals
  const summary = {
    total,
    active: referrals.filter((r) => r.referral_status === 'active').length,
    signedUp: referrals.filter((r) => r.referral_status === 'signed_up').length,
    canceled: referrals.filter((r) => r.referral_status === 'canceled').length,
  }

  if (error) {
    return (
      <div className="pt-16 lg:pt-0 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Failed to load referrals</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-16 lg:pt-0">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Your Referrals</h1>
        <p className="text-sm text-gray-500 mt-1">Track everyone who clicked your link or signed up.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Referrals', value: total, color: 'text-gray-900' },
          { label: 'Active', value: summary.active, color: 'text-green-600' },
          { label: 'Signed Up', value: summary.signedUp, color: 'text-blue-600' },
          { label: 'Canceled', value: summary.canceled, color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Users size={17} className="text-indigo-600" />
            Referral List
          </h2>
          <span className="text-xs text-gray-400">{total} total</span>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="w-8 h-8 bg-gray-100 rounded-full animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-100 rounded-full w-32 animate-pulse" />
                  <div className="h-2.5 bg-gray-100 rounded-full w-48 animate-pulse" />
                </div>
                <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : referrals.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Share2 size={22} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-600">No referrals yet</p>
            <p className="text-xs text-gray-400 mt-1">Share your referral link to start tracking!</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Program</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {referrals.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-indigo-600">
                              {(r.lead_name || 'A').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{r.lead_name || '—'}</p>
                            <p className="text-xs text-gray-400">{r.lead_email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 text-xs capitalize">
                        {r.program ? r.program.replace('_', ' ') : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={r.referral_status} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{fmtDate(r.last_payment_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-50">
              {referrals.map((r) => (
                <div key={r.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-indigo-600">
                          {(r.lead_name || 'A').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{r.lead_name || '—'}</p>
                        <p className="text-xs text-gray-400">{r.lead_email || '—'}</p>
                      </div>
                    </div>
                    <StatusBadge status={r.referral_status} />
                  </div>
                  <div className="mt-2 flex items-center gap-4 pl-12 text-xs text-gray-400">
                    <span>{r.program ? r.program.replace('_', ' ') : '—'}</span>
                    <span>·</span>
                    <span>{fmtDate(r.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-xs text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
