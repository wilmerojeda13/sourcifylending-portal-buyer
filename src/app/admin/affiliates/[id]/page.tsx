'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Loader2, CheckCircle, XCircle, AlertTriangle,
  Users, TrendingUp, DollarSign, Shield, Edit2, Save, X,
  ToggleLeft, ToggleRight, Flag, FlaskConical
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Affiliate {
  id: string
  name: string
  email: string
  referral_code: string
  status: 'active' | 'inactive' | 'suspended'
  admin_notes: string | null
  has_free_program_b_access: boolean
  qualification_start_date: string | null
  free_access_unlock_date: string | null
  is_demo: boolean
  created_at: string
  tier?: string
}

interface Referral {
  id: string
  lead_name: string
  lead_email: string
  program_type: string
  referral_status: string
  subscription_active: boolean
  created_at: string
  last_payment_date: string | null
  deal_type: 'referral_only' | 'affiliate_closed' | 'partner_assisted'
  deal_type_locked: boolean
  deal_type_approved: boolean | null
}

interface Commission {
  id: string
  commission_type: string
  gross_amount: number
  commission_amount: number
  commission_percent: number
  status: string
  program_type: string
  available_at: string | null
  paid_at: string | null
  created_at: string
}

interface AffiliateFlag {
  id: string
  flag_type: string
  reason: string
  status: string
  created_at: string
  affiliate_referrals?: { lead_name: string; lead_email: string } | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-500',
    suspended: 'bg-red-100 text-red-600',
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    reversed: 'bg-red-100 text-red-600',
    reviewed: 'bg-gray-100 text-gray-500',
    dismissed: 'bg-gray-100 text-gray-400',
    actioned: 'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function FlagTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    self_referral: 'bg-red-100 text-red-700',
    same_payment_method: 'bg-orange-100 text-orange-700',
    ip_clustering: 'bg-orange-100 text-orange-700',
    suspicious_signup: 'bg-yellow-100 text-yellow-700',
    duplicate_email: 'bg-yellow-100 text-yellow-700',
    other: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${map[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AffiliateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [flags, setFlags] = useState<AffiliateFlag[]>([])
  const [totalClicks, setTotalClicks] = useState(0)
  const [activeTab, setActiveTab] = useState<'referrals' | 'commissions' | 'flags'>('referrals')

  // Edit states
  const [editNotes, setEditNotes] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [statusValue, setStatusValue] = useState<string>('')
  const [statusLoading, setStatusLoading] = useState(false)
  const [freeAccessLoading, setFreeAccessLoading] = useState(false)
  const [dealTypeApprovalLoading, setDealTypeApprovalLoading] = useState<Record<string, boolean>>({})

  const fetchAffiliate = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/affiliates/${id}`)
      const data = await res.json()
      setAffiliate(data.affiliate)
      setReferrals(data.referrals ?? [])
      setCommissions(data.commissions ?? [])
      setFlags(data.flags ?? [])
      setTotalClicks(data.total_clicks ?? 0)
      setEditNotes(data.affiliate?.admin_notes ?? '')
      setStatusValue(data.affiliate?.status ?? 'active')
    } catch { /* no-op */ }
    setLoading(false)
  }, [id])

  useEffect(() => { fetchAffiliate() }, [fetchAffiliate])

  async function saveNotes() {
    setNotesLoading(true)
    await fetch(`/api/admin/affiliates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_notes: editNotes }),
    })
    setNotesLoading(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  async function saveStatus() {
    setStatusLoading(true)
    const res = await fetch(`/api/admin/affiliates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: statusValue }),
    })
    const data = await res.json()
    if (data.affiliate) setAffiliate(data.affiliate)
    setStatusLoading(false)
  }

  async function approveDealType(referralId: string, approved: boolean) {
    setDealTypeApprovalLoading(prev => ({ ...prev, [referralId]: true }))
    try {
      const res = await fetch(`/api/admin/affiliates/referrals/${referralId}/approve-deal-type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
      if (res.ok) {
        setReferrals(prev => prev.map(r =>
          r.id === referralId ? { ...r, deal_type_approved: approved } : r
        ))
      }
    } catch { /* no-op */ }
    setDealTypeApprovalLoading(prev => ({ ...prev, [referralId]: false }))
  }

  async function toggleFreeAccess() {
    if (!affiliate) return
    setFreeAccessLoading(true)
    const res = await fetch(`/api/admin/affiliates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ has_free_program_b_access: !affiliate.has_free_program_b_access }),
    })
    const data = await res.json()
    if (data.affiliate) setAffiliate(data.affiliate)
    setFreeAccessLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!affiliate) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-gray-600">Partner not found.</p>
          <Link href="/admin/affiliates" className="text-indigo-600 text-sm mt-2 inline-block">← Back</Link>
        </div>
      </div>
    )
  }

  const totalEarned = commissions.filter(c => c.status !== 'reversed').reduce((s, c) => s + c.commission_amount, 0)
  const pendingPayout = commissions.filter(c => c.status === 'approved').reduce((s, c) => s + c.commission_amount, 0)
  const activeReferrals = referrals.filter(r => r.referral_status === 'active' && r.subscription_active).length

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/admin" className="hover:text-gray-700">Admin</Link>
          <span>/</span>
          <Link href="/admin/affiliates" className="hover:text-gray-700">Partners</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">{affiliate.name}</span>
        </div>

        {/* Demo warning banner */}
        {affiliate.is_demo && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-sm text-amber-800">
            <FlaskConical size={16} className="shrink-0 text-amber-600" />
            <div>
              <span className="font-bold">Demo Account</span> — This partner&apos;s compensation and client records are synthetic test data. They are <span className="font-bold">excluded from all aggregate stats</span> on the Partners page.
            </div>
          </div>
        )}

        {/* Header Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-indigo-700">{affiliate.name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900">{affiliate.name}</h1>
                  <StatusBadge status={affiliate.status} />
                  {affiliate.is_demo && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-amber-200 text-amber-800">
                      <FlaskConical size={10} /> Demo Account
                    </span>
                  )}
                  {affiliate.has_free_program_b_access && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-700">
                      Free Program B
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{affiliate.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">Partner Code:</span>
                  <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs font-mono font-bold">
                    {affiliate.referral_code}
                  </code>
                </div>
                <p className="text-xs text-gray-400 mt-1">Member since {fmtDate(affiliate.created_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Clicks', value: totalClicks, icon: TrendingUp, color: 'text-blue-600' },
            { label: 'Total Client Records', value: referrals.length, icon: Users, color: 'text-gray-700' },
            { label: 'Active Clients', value: activeReferrals, icon: CheckCircle, color: 'text-green-600' },
            { label: 'Total Earned', value: fmtCurrency(totalEarned), icon: DollarSign, color: 'text-indigo-600' },
            { label: 'Pending Payout', value: fmtCurrency(pendingPayout), icon: DollarSign, color: 'text-amber-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 text-center">
              <Icon size={18} className={`mx-auto mb-1.5 ${color}`} />
              <div className={`text-lg font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">{label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left col: Main tabs */}
          <div className="lg:col-span-2 space-y-4">

            {/* Free Access Status */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Shield size={16} className="text-emerald-600" /> Free Access Status
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Active Clients</p>
                  <p className="font-bold text-gray-900">{activeReferrals} / 5</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Qualification Start</p>
                  <p className="font-bold text-gray-900">{fmtDate(affiliate.qualification_start_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Unlock Date</p>
                  <p className="font-bold text-gray-900">{fmtDate(affiliate.free_access_unlock_date)}</p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Manual Override: Free Program B Access</p>
                  <p className="text-xs text-gray-400">Grant or revoke complimentary Program B access</p>
                </div>
                <button
                  onClick={toggleFreeAccess}
                  disabled={freeAccessLoading}
                  className="text-gray-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
                >
                  {freeAccessLoading
                    ? <Loader2 size={24} className="animate-spin" />
                    : affiliate.has_free_program_b_access
                      ? <ToggleRight size={32} className="text-emerald-500" />
                      : <ToggleLeft size={32} className="text-gray-300" />
                  }
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 flex">
                {(['referrals', 'commissions', 'flags'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-3 text-sm font-semibold transition-colors capitalize border-b-2 ${activeTab === tab
                      ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-gray-500 hover:text-green-700'
                    }`}
                  >
                    {tab === 'referrals' ? 'clients' : tab}
                    {tab === 'flags' && flags.length > 0 && (
                      <span className="ml-1.5 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                        {flags.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Clients Tab */}
              {activeTab === 'referrals' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Name', 'Program', 'Deal Type', 'Status', 'Created', 'Last Payment'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {referrals.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">No client records yet</td></tr>
                      ) : referrals.map(r => {
                        const isApproving = dealTypeApprovalLoading[r.id]
                        const dealType = r.deal_type || 'referral_only'
                        const needsApproval = dealType === 'affiliate_closed' && r.deal_type_approved === null
                        const isApproved = dealType === 'affiliate_closed' && r.deal_type_approved === true
                        const isRejected = dealType === 'affiliate_closed' && r.deal_type_approved === false
                        return (
                          <tr key={r.id} className="hover:bg-gray-50 align-top">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{r.lead_name}</p>
                              <p className="text-xs text-gray-400">{r.lead_email}</p>
                            </td>
                            <td className="px-4 py-3 align-top pt-3.5">
                              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                                {r.program_type?.replace('program_', 'Program ').toUpperCase() ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              {dealType === 'partner_assisted' ? (
                                <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-700">
                                  Partner-Assisted · 80/20
                                </span>
                              ) : dealType === 'affiliate_closed' ? (
                                <div className="space-y-1.5">
                                  <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                    isApproved ? 'bg-green-100 text-green-700' :
                                    isRejected ? 'bg-red-100 text-red-600' :
                                    'bg-purple-100 text-purple-700'
                                  }`}>
                                    {isApproved ? 'Closed · 30% ✓' : isRejected ? 'Closed · Rejected' : 'Closed · Pending'}
                                  </span>
                                  {(needsApproval || isRejected || isApproved) && (
                                    <div className="flex gap-1">
                                      {!isApproved && (
                                        <button
                                          onClick={() => approveDealType(r.id, true)}
                                          disabled={isApproving}
                                          className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                        >
                                          {isApproving ? '…' : '✓ Approve 30%'}
                                        </button>
                                      )}
                                      {!isRejected && (
                                        <button
                                          onClick={() => approveDealType(r.id, false)}
                                          disabled={isApproving}
                                          className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                        >
                                          {isApproving ? '…' : '✗ Reject'}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {r.deal_type_locked && <p className="text-[10px] text-gray-400">Locked</p>}
                                </div>
                              ) : (
                                <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-gray-100 text-gray-500">
                                  Legacy Referral · 10%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top pt-3.5"><StatusBadge status={r.referral_status} /></td>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap align-top pt-3.5">{fmtDate(r.created_at)}</td>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap align-top pt-3.5">{fmtDate(r.last_payment_date)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Commissions Tab */}
              {activeTab === 'commissions' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Type', 'Program', 'Amount', 'Status', 'Available', 'Paid'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {commissions.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">No commissions yet</td></tr>
                      ) : commissions.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 capitalize text-gray-700 font-medium">{c.commission_type?.replace('_', ' ')}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                              {c.program_type?.replace('program_', 'Program ').toUpperCase() ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{fmtCurrency(c.commission_amount)}</td>
                          <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(c.available_at)}</td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(c.paid_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Flags Tab */}
              {activeTab === 'flags' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Flag Type', 'Reason', 'Client', 'Status', 'Created'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {flags.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">
                          <Shield size={20} className="mx-auto mb-2 opacity-40" />
                          No flags on this account
                        </td></tr>
                      ) : flags.map(f => (
                        <tr key={f.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3"><FlagTypeBadge type={f.flag_type} /></td>
                          <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{f.reason}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {f.affiliate_referrals?.lead_name ?? '—'}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(f.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right col: Admin Controls */}
          <div className="space-y-4">

            {/* Status Control */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Edit2 size={15} className="text-gray-500" /> Status Control
              </h3>
              <select
                value={statusValue}
                onChange={e => setStatusValue(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-3"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
              <button
                onClick={saveStatus}
                disabled={statusLoading || statusValue === affiliate.status}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {statusLoading ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Status</>}
              </button>
            </div>

            {/* Admin Notes */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Edit2 size={15} className="text-gray-500" /> Admin Notes
              </h3>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={5}
                placeholder="Internal notes about this partner…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none mb-3"
                />
              <button
                onClick={saveNotes}
                disabled={notesLoading}
                className="w-full bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {notesLoading
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : notesSaved
                    ? <><CheckCircle size={14} className="text-green-400" /> Saved!</>
                    : <><Save size={14} /> Save Notes</>
                }
              </button>
            </div>

            {/* Quick Links */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3 text-sm">Quick Links</h3>
              <div className="space-y-2">
                <Link
                  href={`/admin/affiliates/commissions?affiliate_id=${affiliate.id}`}
                  className="flex items-center justify-between text-sm text-indigo-600 hover:text-indigo-800 py-1.5 border-b border-gray-50"
                >
                  View All Commissions <span>→</span>
                </Link>
                <Link
                  href={`/admin/affiliates/flags?affiliate_id=${affiliate.id}`}
                  className="flex items-center justify-between text-sm text-indigo-600 hover:text-indigo-800 py-1.5"
                >
                  View Flags <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
