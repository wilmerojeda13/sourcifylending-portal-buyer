'use client'
import { useEffect, useState, useCallback } from 'react'
import { Users, AlertCircle, ChevronLeft, ChevronRight, Share2, Loader2, Info } from 'lucide-react'

type ReferralStatus = 'clicked' | 'signed_up' | 'active' | 'past_due' | 'canceled' | 'refunded' | 'chargeback'
type DealType = 'referral_only' | 'affiliate_closed'

interface Referral {
  id: string
  lead_name: string | null
  lead_email: string | null
  program_type: string | null
  referral_status: ReferralStatus
  subscription_active: boolean
  created_at: string
  last_payment_at: string | null
  deal_type: DealType
  deal_type_locked: boolean
  deal_type_approved: boolean | null
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
  active:     { label: 'Active',      color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' },
  signed_up:  { label: 'Signed Up',   color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' },
  clicked:    { label: 'Clicked',     color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 dark:text-gray-500' },
  past_due:   { label: 'Past Due',    color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' },
  canceled:   { label: 'Canceled',    color: 'bg-red-100 dark:bg-red-900/40 text-red-500' },
  refunded:   { label: 'Refunded',    color: 'bg-red-100 dark:bg-red-900/40 text-red-500' },
  chargeback: { label: 'Chargeback',  color: 'bg-red-100 dark:bg-red-900/40 text-red-600' },
}

function StatusBadge({ status }: { status: ReferralStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 dark:text-gray-500' }
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full uppercase ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function DealTypeBadge({ dealType, locked, approved }: { dealType: DealType; locked: boolean; approved: boolean | null }) {
  if (dealType === 'affiliate_closed') {
    if (approved === true) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 uppercase">
          Closed · 30% ✓
        </span>
      )
    }
    if (approved === false) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 uppercase">
          Closed · Rejected
        </span>
      )
    }
    // null = pending approval or approval not required
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 uppercase">
        Closed · 30%{locked ? '' : ' (pending)'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 dark:text-indigo-400 uppercase">
      Referral · 10%
    </span>
  )
}

function DealTypeSelector({
  referralId,
  currentDealType,
  locked,
  onUpdated,
}: {
  referralId: string
  currentDealType: DealType
  locked: boolean
  onUpdated: (id: string, dt: DealType) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DealType>(currentDealType)

  if (locked) return null

  async function handleChange(newType: DealType) {
    if (newType === selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/affiliate/referrals/${referralId}/deal-type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_type: newType }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to update'); return }
      setSelected(newType)
      onUpdated(referralId, newType)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1.5 space-y-1">
      {error && <p className="text-[10px] text-red-600">{error}</p>}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => handleChange('referral_only')}
          disabled={saving}
          className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold border transition-colors flex items-center gap-1 ${
            selected === 'referral_only'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600 dark:text-indigo-400'
          }`}
        >
          {saving && selected !== 'referral_only' ? null : null}
          Referral (10%)
        </button>
        <button
          onClick={() => handleChange('affiliate_closed')}
          disabled={saving}
          className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold border transition-colors flex items-center gap-1 ${
            selected === 'affiliate_closed'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600 hover:border-purple-400 hover:text-purple-600'
          }`}
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : null}
          I Closed It (30%)
        </button>
      </div>
    </div>
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

  function handleDealTypeUpdated(referralId: string, newType: DealType) {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        referrals: prev.referrals.map(r =>
          r.id === referralId
            ? { ...r, deal_type: newType, deal_type_approved: null }
            : r
        ),
      }
    })
  }

  const referrals = data?.referrals ?? []
  const total = data?.total ?? 0
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  const summary = {
    total,
    active:    referrals.filter((r) => r.referral_status === 'active').length,
    signedUp:  referrals.filter((r) => r.referral_status === 'signed_up').length,
    canceled:  referrals.filter((r) => r.referral_status === 'canceled').length,
  }

  if (error) {
    return (
      <div className="pt-16 lg:pt-0 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Failed to load referrals</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-16 lg:pt-0">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Your Referrals</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Track everyone who clicked your link or signed up.</p>
      </div>

      {/* Deal Type Info Banner */}
      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800 rounded-2xl px-5 py-4 flex gap-3 items-start">
        <Info size={18} className="text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-sm text-indigo-800 dark:text-indigo-300 space-y-0.5">
          <p className="font-semibold">How deal types work</p>
          <p className="text-indigo-600 dark:text-indigo-400 text-xs">
            <strong>Referral (10%):</strong> SourcifyLending closes the deal for you. &nbsp;
            <strong>I Closed It (30%):</strong> You handled the full sales process yourself.
            Deal type locks permanently after the client&apos;s first payment.
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Referrals', value: total,           color: 'text-gray-900 dark:text-gray-100' },
          { label: 'Active',          value: summary.active,  color: 'text-green-600 dark:text-green-400' },
          { label: 'Signed Up',       value: summary.signedUp, color: 'text-blue-600' },
          { label: 'Canceled',        value: summary.canceled, color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm px-5 py-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Users size={17} className="text-indigo-600 dark:text-indigo-400" />
            Referral List
          </h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">{total} total</span>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full w-32 animate-pulse" />
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full w-48 animate-pulse" />
                </div>
                <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : referrals.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Share2 size={22} className="text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 dark:text-gray-500">No referrals yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Share your referral link to start tracking!</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Lead</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Program</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Deal Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Last Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {referrals.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors align-top">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                              {(r.lead_name || 'A').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{r.lead_name || '—'}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{r.lead_email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-400 dark:text-gray-500 text-xs capitalize align-top pt-4">
                        {r.program_type ? r.program_type.replace('_', ' ') : '—'}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <DealTypeBadge
                          dealType={r.deal_type || 'referral_only'}
                          locked={r.deal_type_locked}
                          approved={r.deal_type_approved}
                        />
                        <DealTypeSelector
                          referralId={r.id}
                          currentDealType={r.deal_type || 'referral_only'}
                          locked={r.deal_type_locked}
                          onUpdated={handleDealTypeUpdated}
                        />
                        {r.deal_type_locked && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Locked after payment</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top pt-4">
                        <StatusBadge status={r.referral_status} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 align-top pt-4">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 align-top pt-4">{fmtDate(r.last_payment_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-50 dark:divide-gray-800">
              {referrals.map((r) => (
                <div key={r.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                          {(r.lead_name || 'A').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{r.lead_name || '—'}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{r.lead_email || '—'}</p>
                      </div>
                    </div>
                    <StatusBadge status={r.referral_status} />
                  </div>
                  <div className="mt-2 pl-12 space-y-2">
                    <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                      <span>{r.program_type ? r.program_type.replace('_', ' ') : '—'}</span>
                      <span>·</span>
                      <span>{fmtDate(r.created_at)}</span>
                    </div>
                    <div>
                      <DealTypeBadge
                        dealType={r.deal_type || 'referral_only'}
                        locked={r.deal_type_locked}
                        approved={r.deal_type_approved}
                      />
                      <DealTypeSelector
                        referralId={r.id}
                        currentDealType={r.deal_type || 'referral_only'}
                        locked={r.deal_type_locked}
                        onUpdated={handleDealTypeUpdated}
                      />
                      {r.deal_type_locked && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Locked after payment</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
