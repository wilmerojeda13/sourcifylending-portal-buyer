'use client'
import { useEffect, useState, useCallback } from 'react'
import { DollarSign, AlertCircle, ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react'

type CommissionStatus = 'pending' | 'approved' | 'paid' | 'reversed'
type CommissionType = 'setup' | 'recurring'

interface Commission {
  id: string
  commission_amount: number
  commission_percent: number | null
  gross_amount: number
  status: CommissionStatus
  commission_type: CommissionType
  program_type: string | null
  revenue_component?: 'setup_fee' | 'recurring' | null
  available_at: string | null
  paid_at: string | null
  created_at: string
  affiliate_referrals: {
    lead_name: string | null
    lead_email: string | null
  } | null
}

interface CommissionsData {
  commissions: Commission[]
  total: number
  page: number
  limit: number
}

// Amounts in DB are stored in cents — divide by 100 before display
function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPct(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return '—'
  return `${Number(n).toFixed(Number(n) % 1 === 0 ? 0 : 1)}%`
}

const STATUS_CONFIG: Record<CommissionStatus, { label: string; color: string }> = {
  pending:  { label: 'Pending',  color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' },
  approved: { label: 'Approved', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' },
  paid:     { label: 'Paid',     color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' },
  reversed: { label: 'Reversed', color: 'bg-red-100 dark:bg-red-900/40 text-red-500' },
}

const TYPE_CONFIG: Record<CommissionType, string> = {
  setup:     'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  recurring: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400',
}

function StatusBadge({ status }: { status: CommissionStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 dark:text-gray-500' }
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full uppercase ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function TypeBadge({ type }: { type: CommissionType }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${TYPE_CONFIG[type] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 dark:text-gray-500'}`}>
      {type}
    </span>
  )
}

const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Paid', value: 'paid' },
  { label: 'Reversed', value: 'reversed' },
]

export default function AffiliateCommissionsPage() {
  const [data, setData] = useState<CommissionsData | null>(null)
  const [allData, setAllData] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback((p: number, status: string) => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(p) })
    if (status) qs.set('status', status)
    fetch(`/api/affiliate/commissions?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Failed to load commissions'))
      .finally(() => setLoading(false))
  }, [])

  // Load all for summary stats (no status filter, high limit)
  useEffect(() => {
    fetch('/api/affiliate/commissions?page=1')
      .then((r) => r.json())
      .then((d) => { if (d.commissions) setAllData(d.commissions) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setPage(1)
    load(1, statusFilter)
  }, [statusFilter, load])

  useEffect(() => {
    load(page, statusFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const commissions = data?.commissions ?? []
  const total = data?.total ?? 0
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  // Summary from allData (first page, good enough for totals in many cases)
  const totalEarned = allData.filter((c) => c.status !== 'reversed').reduce((s, c) => s + c.commission_amount, 0)
  const pending = allData.filter((c) => c.status === 'pending').reduce((s, c) => s + c.commission_amount, 0)
  const approved = allData.filter((c) => c.status === 'approved').reduce((s, c) => s + c.commission_amount, 0)
  const paid = allData.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commission_amount, 0)

  if (error) {
    return (
      <div className="pt-16 lg:pt-0 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Failed to load commissions</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-16 lg:pt-0">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Partner Earnings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Track setup earnings and recurring commissions from your partner-assisted clients.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Earned', value: fmt(totalEarned), color: 'text-gray-900 dark:text-gray-100' },
          { label: 'Pending',      value: fmt(pending),     color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Approved',     value: fmt(approved),    color: 'text-blue-600' },
          { label: 'Paid',         value: fmt(paid),        color: 'text-green-600 dark:text-green-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm px-5 py-4 text-center">
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Filter tabs */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-1 overflow-x-auto">
          {FILTER_TABS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === value
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">{total} records</span>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full w-40 animate-pulse" />
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full w-24 animate-pulse" />
                </div>
                <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
                <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : commissions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <ReceiptText size={22} className="text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 dark:text-gray-500">No commissions found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {statusFilter ? `No ${statusFilter} commissions.` : 'Commissions will appear here once your partner-assisted clients begin paying.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Program</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Gross</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Rate</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Commission</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Available</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wide">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {commissions.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                          {c.affiliate_referrals?.lead_name || '—'}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {c.affiliate_referrals?.lead_email || ''}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500 capitalize">
                        {c.program_type ? c.program_type.replace('_', ' ') : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <TypeBadge type={c.commission_type} />
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">{fmt(c.gross_amount)}</td>
                      <td className="px-4 py-3.5 text-right text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">{fmtPct(c.commission_percent)}</td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-gray-900 dark:text-gray-100">{fmt(c.commission_amount)}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">{fmtDate(c.available_at)}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">{fmtDate(c.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-gray-50 dark:divide-gray-800">
              {commissions.map((c) => (
                <div key={c.id} className="px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {c.affiliate_referrals?.lead_name || '—'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{c.affiliate_referrals?.lead_email || ''}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <TypeBadge type={c.commission_type} />
                    <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{c.program_type?.replace('_', ' ') || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-xs">{fmt(c.gross_amount)} × {fmtPct(c.commission_percent)}</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{fmt(c.commission_amount)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                    <span>Available: {fmtDate(c.available_at)}</span>
                    {c.paid_at && <span>· Paid: {fmtDate(c.paid_at)}</span>}
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
            <span className="text-xs text-gray-400 dark:text-gray-500">Page {page} of {totalPages}</span>
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

      {/* Policy note */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
        <div className="flex items-start gap-3">
          <DollarSign size={16} className="text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 leading-relaxed">
            Partner earnings become eligible after a <strong className="text-gray-700 dark:text-gray-300">7-day hold</strong> period.
            Minimum payout threshold: <strong className="text-gray-700 dark:text-gray-300">$100.00</strong>.
            Setup earnings pay at 80% of collected setup fees for partner-assisted Program A and B clients. Recurring commissions pay at 20% of successfully collected subscription revenue only.
          </p>
        </div>
      </div>
    </div>
  )
}
