'use client'
import { useState, useEffect } from 'react'
import { TrendingUp, Plus, Trash2, X, Loader2, BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
type BureauProfile = {
  duns_number: string | null
  duns_status: string
  experian_status: string
  experian_score: number | null
  equifax_status: string
  equifax_score: number | null
  nav_status: string
  paydex_score: number | null
  paydex_date: string | null
  intelliscore: number | null
  intelliscore_date: string | null
}

type Tradeline = {
  id: string
  creditor_name: string
  account_type: string
  credit_limit: number | null
  balance: number | null
  payment_status: string
  date_opened: string | null
  reporting_bureaus: string[]
  notes: string | null
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCOUNT_TYPES = ['Vendor / Net-30', 'Business Credit Card', 'Line of Credit', 'Business Loan', 'Equipment Finance', 'Other']
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  current: 'Current',
  late_30: '30 Days Late',
  late_60: '60 Days Late',
  late_90: '90 Days Late',
  charge_off: 'Charge-Off',
  paid: 'Paid/Closed',
}
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  current: 'bg-green-100 text-green-700',
  late_30: 'bg-amber-100 text-amber-700',
  late_60: 'bg-orange-100 text-orange-700',
  late_90: 'bg-red-100 text-red-700',
  charge_off: 'bg-red-200 text-red-800',
  paid: 'bg-gray-100 text-gray-500',
}

const BUREAUS = ['D&B', 'Experian', 'Equifax', 'Nav']

const PAYDEX_LABEL = (score: number | null) => {
  if (!score) return null
  if (score >= 90) return { label: 'Excellent — Pays Early', color: 'text-green-600' }
  if (score >= 80) return { label: 'Good — Pays On Time', color: 'text-blue-600' }
  if (score >= 70) return { label: 'Fair — Slight Delay', color: 'text-amber-600' }
  return { label: 'Poor — Pays Late', color: 'text-red-600' }
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export default function BusinessCreditMonitoringClient() {
  const [bureauProfile, setBureauProfile] = useState<BureauProfile | null>(null)
  const [tradelines, setTradelines] = useState<Tradeline[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)

  const [form, setForm] = useState({
    creditor_name: '',
    account_type: 'Vendor / Net-30',
    credit_limit: '',
    balance: '',
    payment_status: 'current',
    date_opened: '',
    reporting_bureaus: [] as string[],
    notes: '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/business-credit-profile').then(r => r.json()),
      fetch('/api/business-tradelines').then(r => r.json()),
    ]).then(([profileRes, tlRes]) => {
      setBureauProfile(profileRes.profile || null)
      setTradelines(tlRes.tradelines || [])
      setLoading(false)
    })
  }, [])

  const toggleBureau = (b: string) => {
    setForm(f => ({
      ...f,
      reporting_bureaus: f.reporting_bureaus.includes(b)
        ? f.reporting_bureaus.filter(x => x !== b)
        : [...f.reporting_bureaus, b],
    }))
  }

  const addTradeline = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    const res = await fetch('/api/business-tradelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setAdding(false)
    if (!res.ok) { toast.error(data.error || 'Failed to add tradeline'); return }
    setTradelines(prev => [data.tradeline, ...prev])
    setForm({ creditor_name: '', account_type: 'Vendor / Net-30', credit_limit: '', balance: '', payment_status: 'current', date_opened: '', reporting_bureaus: [], notes: '' })
    setShowAddForm(false)
    toast.success('Tradeline added')
  }

  const deleteTradeline = async (id: string) => {
    setTradelines(prev => prev.filter(t => t.id !== id))
    await fetch(`/api/business-tradelines?id=${id}`, { method: 'DELETE' })
    toast.success('Tradeline removed')
  }

  // Stats
  const activeTradelines = tradelines.filter(t => t.payment_status !== 'paid')
  const totalCreditLimit = activeTradelines.reduce((s, t) => s + (t.credit_limit || 0), 0)
  const totalBalance = activeTradelines.reduce((s, t) => s + (t.balance || 0), 0)
  const utilization = totalCreditLimit > 0 ? Math.round((totalBalance / totalCreditLimit) * 100) : 0
  const paydexInfo = PAYDEX_LABEL(bureauProfile?.paydex_score || null)

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        <div className="h-28 bg-gray-200 rounded-2xl" />
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title flex items-center gap-2">
          <TrendingUp size={24} className="text-green-500" />
          Business Credit Monitoring
        </h1>
        <p className="text-gray-500 text-sm mt-1">Track your business credit scores, PAYDEX, and tradeline portfolio</p>
      </div>

      {/* Bureau Score Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* PAYDEX */}
        <div className="card text-center">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">PAYDEX</p>
          <p className={`text-3xl font-black ${bureauProfile?.paydex_score ? 'text-gray-900' : 'text-gray-200'}`}>
            {bureauProfile?.paydex_score ?? '—'}
          </p>
          {paydexInfo && <p className={`text-xs font-semibold mt-1 ${paydexInfo.color}`}>{paydexInfo.label}</p>}
          <p className="text-[10px] text-gray-400 mt-1">D&B Score</p>
        </div>

        {/* Intelliscore */}
        <div className="card text-center">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Intelliscore</p>
          <p className={`text-3xl font-black ${bureauProfile?.intelliscore ? 'text-gray-900' : 'text-gray-200'}`}>
            {bureauProfile?.intelliscore ?? '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">Experian</p>
        </div>

        {/* Equifax */}
        <div className="card text-center">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Biz Score</p>
          <p className={`text-3xl font-black ${bureauProfile?.equifax_score ? 'text-gray-900' : 'text-gray-200'}`}>
            {bureauProfile?.equifax_score ?? '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">Equifax</p>
        </div>

        {/* Utilization */}
        <div className="card text-center">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Utilization</p>
          <p className={`text-3xl font-black ${
            utilization === 0 ? 'text-gray-200' :
            utilization <= 30 ? 'text-green-600' :
            utilization <= 60 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {totalCreditLimit > 0 ? `${utilization}%` : '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">Business Credit</p>
        </div>
      </div>

      {/* PAYDEX Guide */}
      {(bureauProfile?.paydex_score || null) && (
        <div className="card bg-blue-50 border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-blue-600" />
            <p className="text-sm font-bold text-blue-900">PAYDEX Scale</p>
          </div>
          <div className="flex gap-1 mb-2">
            {[
              { range: '0–49', label: 'Poor', color: 'bg-red-400' },
              { range: '50–79', label: 'Fair', color: 'bg-amber-400' },
              { range: '80–89', label: 'Good', color: 'bg-blue-400' },
              { range: '90–100', label: 'Excellent', color: 'bg-green-500' },
            ].map(b => (
              <div key={b.range} className="flex-1 text-center">
                <div className={`h-2 rounded-full ${b.color} mb-1`} />
                <p className="text-[9px] text-gray-500 font-semibold">{b.range}</p>
                <p className="text-[9px] text-gray-400">{b.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-700">
            Current PAYDEX: <strong>{bureauProfile.paydex_score}</strong> — {paydexInfo?.label}.{' '}
            Pay vendors 5–10 days early to push toward 90+.
          </p>
        </div>
      )}

      {/* Tradeline Portfolio */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">Tradeline Portfolio</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {activeTradelines.length} active · {totalCreditLimit > 0 ? `${fmt(totalCreditLimit)} total credit` : 'No credit limits logged'}
            </p>
          </div>
          <button onClick={() => setShowAddForm(true)} className="btn-primary text-sm px-3 py-2">
            <Plus size={15} /> Add Tradeline
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="card mb-4 border-green-200 border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">Add Tradeline</h3>
              <button onClick={() => setShowAddForm(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <form onSubmit={addTradeline} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Creditor / Vendor Name</label>
                  <input className="input-field" placeholder="e.g. Uline, Grainger, Chase Ink" required
                    value={form.creditor_name} onChange={e => setForm(f => ({ ...f, creditor_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Account Type</label>
                  <select className="input-field" value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}>
                    {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Credit Limit</label>
                  <input type="number" className="input-field" placeholder="$0" value={form.credit_limit}
                    onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Current Balance</label>
                  <input type="number" className="input-field" placeholder="$0" value={form.balance}
                    onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Date Opened</label>
                  <input type="date" className="input-field" value={form.date_opened}
                    onChange={e => setForm(f => ({ ...f, date_opened: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Payment Status</label>
                <select className="input-field" value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}>
                  {Object.entries(PAYMENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Reporting Bureaus</label>
                <div className="flex gap-2 flex-wrap">
                  {BUREAUS.map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggleBureau(b)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        form.reporting_bureaus.includes(b)
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <input className="input-field" placeholder="e.g. Net-30 terms, reports monthly" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <button type="submit" disabled={adding} className="btn-primary w-full">
                {adding ? <><Loader2 size={15} className="animate-spin" /> Adding…</> : 'Add Tradeline'}
              </button>
            </form>
          </div>
        )}

        {/* Tradeline List */}
        {tradelines.length === 0 ? (
          <div className="card text-center py-10">
            <TrendingUp size={28} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No tradelines logged yet</p>
            <p className="text-xs text-gray-300 mt-1">Add each business account that reports to the credit bureaus</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tradelines.map(tl => {
              const util = tl.credit_limit && tl.balance !== null
                ? Math.round((tl.balance / tl.credit_limit) * 100) : null
              return (
                <div key={tl.id} className="card">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{tl.creditor_name}</p>
                        <span className="text-xs text-gray-400">{tl.account_type}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PAYMENT_STATUS_COLORS[tl.payment_status]}`}>
                          {PAYMENT_STATUS_LABELS[tl.payment_status]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                        {tl.credit_limit !== null && <span>Limit: <strong className="text-gray-700">{fmt(tl.credit_limit)}</strong></span>}
                        {tl.balance !== null && <span>Balance: <strong className="text-gray-700">{fmt(tl.balance)}</strong></span>}
                        {util !== null && (
                          <span className={util > 30 ? 'text-amber-600 font-semibold' : ''}>
                            Util: {util}%
                          </span>
                        )}
                        {tl.date_opened && <span>Opened: {tl.date_opened}</span>}
                      </div>
                      {tl.reporting_bureaus.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {tl.reporting_bureaus.map(b => (
                            <span key={b} className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">{b}</span>
                          ))}
                        </div>
                      )}
                      {tl.notes && <p className="text-xs text-gray-400 mt-1">{tl.notes}</p>}
                    </div>
                    <button
                      onClick={() => deleteTradeline(tl.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="card bg-green-50 border border-green-100">
        <p className="text-sm font-bold text-green-900 mb-2">PAYDEX Building Tips</p>
        <ul className="space-y-1 text-xs text-green-700">
          <li>• Pay all vendor invoices 5–10 days early to maximize PAYDEX reporting</li>
          <li>• A score of 80 = paid as agreed · 90+ = paid early — both unlock better terms</li>
          <li>• Aim for 10+ unique tradelines across multiple bureaus within 12 months</li>
          <li>• Business credit accounts must be in the business name and EIN, not personal SSN</li>
          <li>• Check your D&B profile at dnb.com monthly to verify tradelines are reporting correctly</li>
        </ul>
      </div>
    </div>
  )
}
