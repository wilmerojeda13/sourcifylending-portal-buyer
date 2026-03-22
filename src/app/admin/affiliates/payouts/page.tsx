'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Loader2, DollarSign, CheckCircle, XCircle,
  Clock, Play, AlertTriangle, ExternalLink
} from 'lucide-react'

interface Payout {
  id: string
  affiliate_id: string
  amount_cents: number
  status: 'pending' | 'paid' | 'failed' | 'cancelled'
  stripe_transfer_id: string | null
  triggered_by: string
  failure_reason: string | null
  paid_at: string | null
  created_at: string
  affiliates: { id: string; name: string; email: string } | null
}

interface RunResult {
  affiliate_id: string
  affiliate_name: string
  status: 'paid' | 'skipped' | 'failed'
  amount_cents?: number
  payout_id?: string
  reason?: string
}

function fmtCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  paid:      'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [running, setRunning] = useState(false)
  const [runResults, setRunResults] = useState<RunResult[] | null>(null)
  const [runSummary, setRunSummary] = useState<{ paid: number; skipped: number; failed: number; total_paid_cents: number } | null>(null)

  const fetchPayouts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/admin/affiliates/payouts?${params}`)
      const data = await res.json()
      setPayouts(data.payouts ?? [])
      setTotal(data.total ?? 0)
    } catch { /* no-op */ }
    setLoading(false)
  }, [page, statusFilter])

  useEffect(() => { fetchPayouts() }, [fetchPayouts])

  async function handleRunPayouts() {
    if (!confirm('Run payouts now for all eligible affiliates?')) return
    setRunning(true)
    setRunResults(null)
    setRunSummary(null)
    try {
      const res = await fetch('/api/admin/affiliates/payouts/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggered_by: 'admin' }),
      })
      const data = await res.json()
      setRunResults(data.results ?? [])
      setRunSummary(data.summary ?? null)
      fetchPayouts()
    } catch { /* no-op */ }
    setRunning(false)
  }

  const limit = 25
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin/affiliates" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ChevronLeft size={14} /> Affiliates
            </Link>
            <span className="text-gray-300">/</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
              <p className="text-sm text-gray-500 mt-0.5">Stripe Connect affiliate commission payouts</p>
            </div>
          </div>
          <button
            onClick={handleRunPayouts}
            disabled={running}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {running ? 'Running Payouts…' : 'Run Payouts Now'}
          </button>
        </div>

        {/* Sub-nav */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {[
            { label: 'Affiliates', href: '/admin/affiliates' },
            { label: 'Commissions', href: '/admin/affiliates/commissions' },
            { label: 'Leads', href: '/admin/affiliates/leads' },
            { label: 'Payouts', href: '/admin/affiliates/payouts', active: true },
            { label: 'Settings', href: '/admin/affiliates/settings' },
            { label: 'Flags', href: '/admin/affiliates/flags' },
          ].map(({ label, href, active }) => (
            <Link key={href} href={href}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
              {label}
            </Link>
          ))}
        </div>

        {/* Run results */}
        {runResults && runSummary && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="font-bold text-gray-900">Payout Run Results</h3>
              <div className="flex gap-3 flex-wrap text-sm">
                <span className="text-green-600 font-semibold">{runSummary.paid} paid</span>
                <span className="text-gray-400">{runSummary.skipped} skipped</span>
                {runSummary.failed > 0 && <span className="text-red-500 font-semibold">{runSummary.failed} failed</span>}
                <span className="font-bold text-gray-900">Total: {fmtCents(runSummary.total_paid_cents)}</span>
              </div>
            </div>
            <div className="space-y-2">
              {runResults.map((r, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm ${
                  r.status === 'paid' ? 'bg-green-50' : r.status === 'failed' ? 'bg-red-50' : 'bg-gray-50'
                }`}>
                  <div>
                    <span className="font-medium text-gray-900">{r.affiliate_name}</span>
                    {r.reason && <span className="ml-2 text-gray-400 text-xs">— {r.reason}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.amount_cents && <span className="font-bold text-green-700">{fmtCents(r.amount_cents)}</span>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      r.status === 'paid' ? 'bg-green-200 text-green-800' :
                      r.status === 'failed' ? 'bg-red-200 text-red-800' : 'bg-gray-200 text-gray-600'
                    }`}>{r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { value: '', label: 'All' },
            { value: 'paid', label: 'Paid' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
          ].map(({ value, label }) => (
            <button key={value} onClick={() => { setStatusFilter(value); setPage(1) }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                statusFilter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Payouts table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">{total} payout{total !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Affiliate', 'Amount', 'Status', 'Triggered By', 'Transfer ID', 'Paid', 'Created'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Loading…
                  </td></tr>
                ) : payouts.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <DollarSign size={24} className="mx-auto mb-2 opacity-40" /> No payouts yet
                  </td></tr>
                ) : payouts.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {p.affiliates ? (
                        <div>
                          <Link href={`/admin/affiliates/${p.affiliates.id}`} className="font-semibold text-indigo-700 hover:underline">
                            {p.affiliates.name}
                          </Link>
                          <div className="text-xs text-gray-400">{p.affiliates.email}</div>
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">{fmtCents(p.amount_cents)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_STYLE[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {p.status}
                      </span>
                      {p.failure_reason && (
                        <div className="text-xs text-red-500 mt-0.5">{p.failure_reason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 capitalize">{p.triggered_by}</td>
                    <td className="px-4 py-3">
                      {p.stripe_transfer_id ? (
                        <a href={`https://dashboard.stripe.com/transfers/${p.stripe_transfer_id}`}
                           target="_blank" rel="noopener noreferrer"
                           className="text-xs font-mono text-indigo-600 hover:underline flex items-center gap-1">
                          {p.stripe_transfer_id.slice(0, 20)}… <ExternalLink size={10} />
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(p.paid_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
    </div>
  )
}
