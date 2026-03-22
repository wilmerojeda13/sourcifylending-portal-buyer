'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Loader2, Search, Filter, Download, DollarSign,
  CheckCircle, Clock, XCircle, AlertCircle
} from 'lucide-react'

interface Commission {
  id: string
  affiliate_id: string
  commission_type: string
  gross_amount: number
  commission_amount: number
  commission_percent: number
  status: string
  program_type: string
  available_at: string | null
  paid_at: string | null
  approved_at: string | null
  created_at: string
  affiliates?: { name: string; email: string; referral_code: string } | null
  affiliate_referrals?: { lead_name: string; lead_email: string } | null
}

function fmtCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    reversed: 'bg-red-100 text-red-600',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

const SUB_NAV = [
  { label: 'Affiliates', href: '/admin/affiliates' },
  { label: 'Commissions', href: '/admin/affiliates/commissions', active: true },
  { label: 'Settings', href: '/admin/affiliates/settings' },
  { label: 'Resources', href: '/admin/affiliates/resources' },
  { label: 'Flags', href: '/admin/affiliates/flags' },
]

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [affiliateSearch, setAffiliateSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'pay' | 'reverse' | null>(null)

  const limit = 25

  const fetchCommissions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (statusFilter) params.set('status', statusFilter)
      if (programFilter) params.set('program', programFilter)
      const res = await fetch(`/api/admin/affiliates/commissions?${params}`)
      const data = await res.json()
      setCommissions(data.commissions ?? [])
      setTotal(data.total ?? 0)
    } catch { /* no-op */ }
    setLoading(false)
  }, [page, statusFilter, programFilter])

  useEffect(() => { fetchCommissions() }, [fetchCommissions])

  const filtered = affiliateSearch
    ? commissions.filter(c =>
        c.affiliates?.name?.toLowerCase().includes(affiliateSearch.toLowerCase()) ||
        c.affiliates?.email?.toLowerCase().includes(affiliateSearch.toLowerCase())
      )
    : commissions

  const pendingTotal = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + c.commission_amount, 0)
  const approvedTotal = commissions.filter(c => c.status === 'approved').reduce((s, c) => s + c.commission_amount, 0)
  const paidTotal = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + c.commission_amount, 0)

  async function handleAction(id: string, action: 'approve' | 'pay' | 'reverse') {
    setActionLoading(id)
    try {
      await fetch('/api/admin/affiliates/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      await fetchCommissions()
    } catch { /* no-op */ }
    setActionLoading(null)
    setConfirmId(null)
    setConfirmAction(null)
  }

  async function handleBulkApprove() {
    setBulkLoading(true)
    const now = new Date().toISOString()
    const eligible = commissions.filter(c =>
      c.status === 'pending' && (!c.available_at || c.available_at <= now)
    )
    await Promise.all(eligible.map(c =>
      fetch('/api/admin/affiliates/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, action: 'approve' }),
      })
    ))
    await fetchCommissions()
    setBulkLoading(false)
  }

  async function handleExport() {
    setExportLoading(true)
    try {
      const res = await fetch('/api/admin/affiliates/export?type=commissions&status=approved')
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'approved-commissions.csv'
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch { /* no-op */ }
    setExportLoading(false)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ChevronLeft size={14} /> Admin
            </Link>
            <span className="text-gray-300">/</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Commission Management</h1>
              <p className="text-sm text-gray-500 mt-0.5">Review, approve, and pay affiliate commissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Approve All Eligible
            </button>
            <button
              onClick={handleExport}
              disabled={exportLoading}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-60"
            >
              {exportLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export Approved
            </button>
          </div>
        </div>

        {/* Sub-nav */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {SUB_NAV.map(({ label, href, active }) => (
            <Link key={href} href={href}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${active
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Pending', value: fmtCurrency(pendingTotal), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Ready to Pay (Approved)', value: fmtCurrency(approvedTotal), icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Paid', value: fmtCurrency(paidTotal), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl border border-gray-200 shadow-sm px-5 py-4 flex items-center gap-4`}>
              <Icon size={24} className={color} />
              <div>
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search affiliate…"
              value={affiliateSearch}
              onChange={e => setAffiliateSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={14} className="text-gray-400" />
            {(['', 'pending', 'approved', 'paid', 'reversed'] as const).map(s => (
              <button key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Program:</span>
            {(['', 'program_a', 'program_b', 'program_c'] as const).map(p => (
              <button key={p}
                onClick={() => { setProgramFilter(p); setPage(1) }}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${programFilter === p
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p === '' ? 'All' : p.replace('program_', 'Prog ').toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">{total} commission{total !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Affiliate', 'Client', 'Program', 'Type', 'Gross', 'Comm %', 'Amount', 'Status', 'Available', 'Paid Date', 'Actions'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Loading commissions…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                    <DollarSign size={24} className="mx-auto mb-2 opacity-40" /> No commissions found
                  </td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/affiliates/${c.affiliate_id}`} className="font-medium text-indigo-700 hover:underline">
                        {c.affiliates?.name ?? '—'}
                      </Link>
                      <p className="text-[10px] text-gray-400">{c.affiliates?.referral_code}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {c.affiliate_referrals?.lead_name ?? '—'}
                      {c.affiliate_referrals?.lead_email && (
                        <p className="text-[10px] text-gray-400">{c.affiliate_referrals.lead_email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                        {c.program_type?.replace('program_', 'Prog ').toUpperCase() ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700 text-xs">{c.commission_type?.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtCurrency(c.gross_amount)}</td>
                    <td className="px-4 py-3 text-gray-500">{c.commission_percent}%</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{fmtCurrency(c.commission_amount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(c.available_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(c.paid_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {c.status === 'pending' && (
                          <button
                            onClick={() => { setConfirmId(c.id); setConfirmAction('approve') }}
                            disabled={actionLoading === c.id}
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors disabled:opacity-50"
                          >
                            {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : 'Approve'}
                          </button>
                        )}
                        {c.status === 'approved' && (
                          <button
                            onClick={() => { setConfirmId(c.id); setConfirmAction('pay') }}
                            disabled={actionLoading === c.id}
                            className="text-xs px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-medium transition-colors disabled:opacity-50"
                          >
                            {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : 'Mark Paid'}
                          </button>
                        )}
                        {(c.status === 'pending' || c.status === 'approved') && (
                          <button
                            onClick={() => { setConfirmId(c.id); setConfirmAction('reverse') }}
                            disabled={actionLoading === c.id}
                            className="text-xs px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-medium transition-colors disabled:opacity-50"
                          >
                            Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Previous</button>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Confirm Dialog */}
      {confirmId && confirmAction && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm p-6 text-center space-y-4">
            <AlertCircle size={32} className={`mx-auto ${confirmAction === 'reverse' ? 'text-red-500' : 'text-indigo-600'}`} />
            <div>
              <h3 className="font-bold text-gray-900">
                {confirmAction === 'approve' && 'Approve Commission?'}
                {confirmAction === 'pay' && 'Mark as Paid?'}
                {confirmAction === 'reverse' && 'Reverse Commission?'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {confirmAction === 'reverse'
                  ? 'This will permanently mark the commission as reversed. This cannot be undone.'
                  : 'Confirm this action on the selected commission.'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmId(null); setConfirmAction(null) }}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(confirmId, confirmAction)}
                disabled={actionLoading === confirmId}
                className={`flex-1 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                  confirmAction === 'reverse' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {actionLoading === confirmId ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
