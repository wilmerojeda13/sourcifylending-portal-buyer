'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Users, Plus, Search, Filter, Download, RefreshCw, ChevronLeft,
  Loader2, CheckCircle, XCircle, AlertCircle, ArrowRight, ExternalLink, FlaskConical
} from 'lucide-react'
import ResetDemoAffiliateButton from './ResetDemoAffiliateButton'

interface Affiliate {
  id: string
  name: string
  email: string
  referral_code: string
  status: 'active' | 'inactive' | 'suspended'
  active_referrals: number
  total_earned: number
  pending_payout: number
  has_free_program_b_access: boolean
  is_demo: boolean
  created_at: string
}

function fmtCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-500',
    suspended: 'bg-red-100 text-red-600',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

export default function AffiliatesPage() {
  const router = useRouter()
  const [affiliates, setAffiliates] = useState<Affiliate[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addedCode, setAddedCode] = useState('')
  const [freeAccessLoading, setFreeAccessLoading] = useState(false)
  const [freeAccessResult, setFreeAccessResult] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [showDemo, setShowDemo] = useState(true)

  const fetchAffiliates = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/admin/affiliates?${params}`)
      const data = await res.json()
      setAffiliates(data.affiliates ?? [])
      setTotal(data.total ?? 0)
    } catch {
      /* no-op */
    }
    setLoading(false)
  }, [page, search, statusFilter])

  useEffect(() => { fetchAffiliates() }, [fetchAffiliates])

  // Derived stats — always exclude demo from real numbers
  const realAffiliates = affiliates.filter(a => !a.is_demo)
  const totalActive = realAffiliates.filter(a => a.status === 'active').length
  const totalSuspended = realAffiliates.filter(a => a.status === 'suspended').length
  const totalCommissions = realAffiliates.reduce((s, a) => s + a.total_earned, 0)

  // What's shown in the table (respects showDemo toggle)
  const visibleAffiliates = showDemo ? affiliates : realAffiliates

  async function handleAddAffiliate() {
    if (!addName.trim() || !addEmail.trim()) { setAddError('Name and email are required.'); return }
    setAddLoading(true)
    setAddError('')
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), email: addEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error || 'Failed to create affiliate'); setAddLoading(false); return }
      setAddedCode(data.affiliate.referral_code)
      fetchAffiliates()
    } catch {
      setAddError('Network error')
    }
    setAddLoading(false)
  }

  function closeAddModal() {
    setShowAddModal(false)
    setAddName('')
    setAddEmail('')
    setAddError('')
    setAddedCode('')
  }

  async function handleFreeAccessCheck() {
    setFreeAccessLoading(true)
    setFreeAccessResult(null)
    try {
      const res = await fetch('/api/admin/affiliates/free-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_check: true }),
      })
      const data = await res.json()
      setFreeAccessResult(data.message || (data.ok ? 'Free access check complete.' : 'Check complete.'))
      fetchAffiliates()
    } catch {
      setFreeAccessResult('Error running check.')
    }
    setFreeAccessLoading(false)
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
        a.download = 'affiliate-commissions.csv'
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch { /* no-op */ }
    setExportLoading(false)
  }

  const limit = 20
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
              <h1 className="text-2xl font-bold text-gray-900">Affiliate Management</h1>
              <p className="text-sm text-gray-500 mt-0.5">Manage affiliates, referrals, and commission payouts</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowDemo(s => !s)}
              className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-xl border transition-all ${
                showDemo
                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <FlaskConical size={14} />
              {showDemo ? 'Showing Demo' : 'Demo Hidden'}
            </button>
            <button
              onClick={handleFreeAccessCheck}
              disabled={freeAccessLoading}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-60"
            >
              {freeAccessLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Run Free Access Check
            </button>
            <button
              onClick={handleExport}
              disabled={exportLoading}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-60"
            >
              {exportLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export CSV
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <Plus size={15} /> Add Affiliate
            </button>
          </div>
        </div>

        {freeAccessResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            {freeAccessResult}
          </div>
        )}

        {/* Sub-nav */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {[
            { label: 'Affiliates', href: '/admin/affiliates', active: true },
            { label: 'Commissions', href: '/admin/affiliates/commissions' },
            { label: 'Applications', href: '/admin/affiliates/applications' },
            { label: 'Settings', href: '/admin/affiliates/settings' },
            { label: 'Resources', href: '/admin/affiliates/resources' },
            { label: 'Flags', href: '/admin/affiliates/flags' },
          ].map(({ label, href, active }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${active
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Stats Row — demo excluded from all figures */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Affiliates', value: realAffiliates.length, sub: 'excl. demo', color: 'text-gray-900', icon: Users },
            { label: 'Active', value: totalActive, sub: 'real accounts', color: 'text-green-600', icon: CheckCircle },
            { label: 'Suspended', value: totalSuspended, sub: 'real accounts', color: 'text-red-500', icon: XCircle },
            { label: 'Total Commissions', value: fmtCurrency(totalCommissions), sub: 'excl. demo', color: 'text-indigo-600', icon: AlertCircle },
          ].map(({ label, value, sub, color, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 text-center">
              <Icon size={18} className={`mx-auto mb-1.5 ${color}`} />
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{label}</div>
              <div className="text-[10px] text-gray-300 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* Demo Tools */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ResetDemoAffiliateButton />
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or referral code..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-400" />
            {(['', 'active', 'inactive', 'suspended'] as const).map(s => (
              <button
                key={s}
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
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              {visibleAffiliates.length} affiliate{visibleAffiliates.length !== 1 ? 's' : ''}
              {!showDemo && affiliates.some(a => a.is_demo) && (
                <span className="ml-2 text-xs text-gray-400 font-normal">(demo hidden)</span>
              )}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Name', 'Email', 'Referral Code', 'Status', 'Active Referrals', 'Total Earned', 'Pending Payout', 'Free Access', 'Created', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                      <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                      Loading affiliates…
                    </td>
                  </tr>
                ) : affiliates.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                      <Users size={24} className="mx-auto mb-2 opacity-40" />
                      No affiliates found
                    </td>
                  </tr>
                ) : visibleAffiliates.map(aff => (
                  <tr
                    key={aff.id}
                    className={`cursor-pointer transition-colors ${aff.is_demo ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-gray-50'}`}
                    onClick={() => router.push(`/admin/affiliates/${aff.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${aff.is_demo ? 'text-amber-900' : 'text-gray-900'}`}>{aff.name}</span>
                        {aff.is_demo && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 uppercase tracking-wide">
                            <FlaskConical size={9} /> Demo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-[180px]">{aff.email}</td>
                    <td className="px-4 py-3">
                      <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs font-mono">
                        {aff.referral_code}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={aff.status} />
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">{aff.active_referrals}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{fmtCurrency(aff.total_earned)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${aff.pending_payout > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {fmtCurrency(aff.pending_payout)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {aff.has_free_program_b_access ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-700">Yes</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-gray-100 text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(aff.created_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/admin/affiliates/${aff.id}`) }}
                        className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-medium"
                      >
                        View <ArrowRight size={12} />
                      </button>
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
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Add Affiliate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Plus size={18} className="text-indigo-600" /> Add Affiliate
              </h2>
              <button onClick={closeAddModal} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
            </div>

            {addedCode ? (
              <div className="px-6 py-8 text-center space-y-4">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle size={28} className="text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-lg">Affiliate Created!</p>
                  <p className="text-sm text-gray-500 mt-1">Their referral code is:</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-6 py-4">
                  <code className="text-2xl font-mono font-bold text-indigo-700 tracking-widest">{addedCode}</code>
                </div>
                <p className="text-xs text-gray-400">Share this with the affiliate to start tracking referrals.</p>
                <button
                  onClick={closeAddModal}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address *</label>
                  <input
                    type="email"
                    value={addEmail}
                    onChange={e => setAddEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                {addError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{addError}</div>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={closeAddModal}
                    className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddAffiliate}
                    disabled={addLoading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {addLoading ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create Affiliate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
