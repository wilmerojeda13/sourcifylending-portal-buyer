'use client'
import { useState, useEffect } from 'react'
import { Building2, CheckCircle2, Circle, ChevronDown, ChevronUp, Save, Loader2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Credibility Checklist Definition ────────────────────────────────────────
const CHECKLIST_ITEMS = [
  { key: 'ein_obtained', label: 'EIN Obtained', desc: 'Employer Identification Number from the IRS (free at irs.gov)', link: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online' },
  { key: 'business_bank_account', label: 'Business Bank Account Opened', desc: 'Dedicated business checking account in your business name' },
  { key: 'business_address', label: 'Business Address Established', desc: 'Physical address or registered virtual office — not a P.O. box' },
  { key: 'business_phone_411', label: 'Business Phone Listed with 411', desc: 'Phone number matching your business name, listed in 411 directories', link: 'https://www.listyourself.net' },
  { key: 'professional_email', label: 'Professional Domain Email', desc: 'Email on your business domain (e.g., you@yourbusiness.com) — not Gmail/Yahoo' },
  { key: 'business_website', label: 'Business Website Live', desc: 'Active website with your business name, address, and contact info' },
  { key: 'duns_registered', label: 'D-U-N-S Number Registered (Step 1 — Free)', desc: 'Register your free D-U-N-S number at dnb.com — required by most vendors for net terms. Expedited processing may cost extra.', link: 'https://www.dnb.com/duns/get-a-duns.html' },
  { key: 'experian_business_profile', label: 'Experian Business Profile Active (Step 3)', desc: 'Set up access to your Experian Business credit file and Intelliscore Plus. Business monitoring is generally a paid product.', link: 'https://www.experian.com/small-business/business-credit-report.jsp' },
  { key: 'equifax_business_profile', label: 'Equifax Business Visibility (Step 5)', desc: 'Monitor your Equifax Business visibility via Nav or an approved aggregator — no verified direct self-serve signup route is currently available.', link: 'https://www.nav.com' },
  { key: 'google_business_listed', label: 'Google Business Profile Listed', desc: 'Free listing at business.google.com — improves legitimacy', link: 'https://business.google.com' },
  { key: 'business_license', label: 'Business License / Permits Obtained', desc: 'Any required local, state, or industry licenses for your entity' },
  { key: 'naics_code_assigned', label: 'NAICS/SIC Code Assigned', desc: 'Correct industry code on all bureau registrations — must match across all bureaus' },
] as const

type ItemKey = typeof CHECKLIST_ITEMS[number]['key']

// ─── Bureau Status helpers ────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  pending: 'In Progress',
  registered: 'Registered',
  verified: 'Verified',
}
const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-500',
  pending: 'bg-amber-100 text-amber-700',
  registered: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
}

type BureauProfile = {
  duns_number: string | null
  duns_status: string
  duns_date: string | null
  experian_status: string
  experian_date: string | null
  experian_score: number | null
  equifax_status: string
  equifax_date: string | null
  equifax_score: number | null
  nav_status: string
  nav_date: string | null
  paydex_score: number | null
  paydex_date: string | null
  intelliscore: number | null
  notes: string | null
}

const DEFAULT_PROFILE: BureauProfile = {
  duns_number: '', duns_status: 'not_started', duns_date: null,
  experian_status: 'not_started', experian_date: null, experian_score: null,
  equifax_status: 'not_started', equifax_date: null, equifax_score: null,
  nav_status: 'not_started', nav_date: null,
  paydex_score: null, paydex_date: null,
  intelliscore: null, notes: null,
}

export default function BusinessCreditSetupClient() {
  const [profile, setProfile] = useState<BureauProfile>(DEFAULT_PROFILE)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showBureauForm, setShowBureauForm] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/business-credit-profile').then(r => r.json()),
      fetch('/api/business-credibility').then(r => r.json()),
    ]).then(([profileRes, checklistRes]) => {
      if (profileRes.profile) setProfile({ ...DEFAULT_PROFILE, ...profileRes.profile })
      const completed: Record<string, boolean> = {}
      for (const item of checklistRes.items || []) {
        completed[item.item_key] = item.is_complete
      }
      setChecklist(completed)
      setLoading(false)
    })
  }, [])

  const toggleChecklist = async (key: ItemKey) => {
    const newVal = !checklist[key]
    setChecklist(prev => ({ ...prev, [key]: newVal }))
    await fetch('/api/business-credibility', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: key, is_complete: newVal }),
    })
  }

  const saveProfile = async () => {
    setSaving(true)
    const res = await fetch('/api/business-credit-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('Bureau profile saved')
    } else {
      toast.error('Failed to save')
    }
  }

  const completedCount = CHECKLIST_ITEMS.filter(i => checklist[i.key]).length
  const progressPct = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100)

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Building2 size={24} className="text-green-500" />
          Business Credit Setup
        </h1>
        <p className="text-gray-500 text-sm mt-1">Track your business credit bureau registrations and credibility foundation</p>
      </div>

      {/* Progress Hero */}
      <div className="card bg-gradient-to-br from-green-600 to-green-700 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-green-100 text-xs font-semibold uppercase tracking-wide">Credibility Score</p>
            <p className="text-3xl font-black mt-0.5">{progressPct}%</p>
          </div>
          <div className="text-right">
            <p className="text-green-100 text-xs">Completed</p>
            <p className="text-lg font-bold">{completedCount} / {CHECKLIST_ITEMS.length}</p>
          </div>
        </div>
        <div className="w-full bg-green-500/40 rounded-full h-2.5">
          <div
            className="bg-white h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {progressPct < 100 && (
          <p className="text-green-100 text-xs mt-2">
            {completedCount === 0
              ? 'Start by completing the items below — each one strengthens your business credit profile.'
              : `${CHECKLIST_ITEMS.length - completedCount} items remaining to reach a complete credibility foundation.`}
          </p>
        )}
        {progressPct === 100 && (
          <p className="text-white text-xs mt-2 font-semibold">
            Full credibility foundation complete — your business profile is lender-ready.
          </p>
        )}
      </div>

      {/* Credibility Checklist */}
      <div className="card">
        <h2 className="section-title mb-4">Business Credibility Checklist</h2>
        <p className="text-xs text-gray-400 mb-4">
          Lenders verify these foundational elements before approving business credit. Complete all 12 items to maximize approval odds.
        </p>
        <div className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => {
            const done = !!checklist[item.key]
            return (
              <button
                key={item.key}
                onClick={() => toggleChecklist(item.key)}
                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  done
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {done
                    ? <CheckCircle2 size={20} className="text-green-600" />
                    : <Circle size={20} className="text-gray-300" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${done ? 'text-green-700 line-through' : 'text-gray-900'}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{item.desc}</p>
                </div>
                {'link' in item && item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-green-600 transition-colors"
                    title="Open link"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Bureau Registration Status */}
      <div className="card">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setShowBureauForm(!showBureauForm)}
        >
          <h2 className="section-title">Bureau Registration Status</h2>
          {showBureauForm ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {/* Quick status pills — always visible */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {[
            { label: 'D&B / DUNS', status: profile.duns_status, score: profile.paydex_score, scoreLabel: 'PAYDEX' },
            { label: 'Experian Biz', status: profile.experian_status, score: profile.intelliscore, scoreLabel: 'Intelliscore' },
            { label: 'Equifax Biz', status: profile.equifax_status, score: profile.equifax_score, scoreLabel: 'Score' },
            { label: 'Nav', status: profile.nav_status, score: null, scoreLabel: '' },
          ].map(bureau => (
            <div key={bureau.label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1.5">{bureau.label}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[bureau.status]}`}>
                {STATUS_LABELS[bureau.status]}
              </span>
              {bureau.score !== null && (
                <p className="text-xs text-gray-500 mt-1.5">{bureau.scoreLabel}: <strong className="text-gray-800">{bureau.score}</strong></p>
              )}
            </div>
          ))}
        </div>

        {/* Expanded form */}
        {showBureauForm && (
          <div className="mt-5 pt-5 border-t border-gray-100 space-y-5">
            {/* D&B */}
            <div>
              <p className="text-sm font-bold text-gray-800 mb-2">Dun & Bradstreet (D-U-N-S)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">D-U-N-S Number</label>
                  <input className="input-field" placeholder="12-345-6789" value={profile.duns_number || ''} onChange={e => setProfile(p => ({ ...p, duns_number: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input-field" value={profile.duns_status} onChange={e => setProfile(p => ({ ...p, duns_status: e.target.value }))}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Registration Date</label>
                  <input type="date" className="input-field" value={profile.duns_date || ''} onChange={e => setProfile(p => ({ ...p, duns_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="label">PAYDEX Score</label>
                  <input type="number" min={1} max={100} className="input-field" placeholder="0–100" value={profile.paydex_score ?? ''} onChange={e => setProfile(p => ({ ...p, paydex_score: e.target.value ? parseInt(e.target.value) : null }))} />
                </div>
                <div>
                  <label className="label">PAYDEX Score Date</label>
                  <input type="date" className="input-field" value={profile.paydex_date || ''} onChange={e => setProfile(p => ({ ...p, paydex_date: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Experian */}
            <div>
              <p className="text-sm font-bold text-gray-800 mb-2">Experian Business</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select className="input-field" value={profile.experian_status} onChange={e => setProfile(p => ({ ...p, experian_status: e.target.value }))}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Registration Date</label>
                  <input type="date" className="input-field" value={profile.experian_date || ''} onChange={e => setProfile(p => ({ ...p, experian_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Intelliscore Plus</label>
                  <input type="number" min={1} max={100} className="input-field" placeholder="1–100" value={profile.intelliscore ?? ''} onChange={e => setProfile(p => ({ ...p, intelliscore: e.target.value ? parseInt(e.target.value) : null }))} />
                </div>
              </div>
            </div>

            {/* Equifax */}
            <div>
              <p className="text-sm font-bold text-gray-800 mb-2">Equifax Business</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select className="input-field" value={profile.equifax_status} onChange={e => setProfile(p => ({ ...p, equifax_status: e.target.value }))}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Registration Date</label>
                  <input type="date" className="input-field" value={profile.equifax_date || ''} onChange={e => setProfile(p => ({ ...p, equifax_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Score</label>
                  <input type="number" className="input-field" placeholder="Score" value={profile.equifax_score ?? ''} onChange={e => setProfile(p => ({ ...p, equifax_score: e.target.value ? parseInt(e.target.value) : null }))} />
                </div>
              </div>
            </div>

            {/* Nav */}
            <div>
              <p className="text-sm font-bold text-gray-800 mb-2">Nav Business Credit</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select className="input-field" value={profile.nav_status} onChange={e => setProfile(p => ({ ...p, nav_status: e.target.value }))}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Registration Date</label>
                  <input type="date" className="input-field" value={profile.nav_date || ''} onChange={e => setProfile(p => ({ ...p, nav_date: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Any additional notes about your bureau registrations…"
                value={profile.notes || ''}
                onChange={e => setProfile(p => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <button onClick={saveProfile} disabled={saving} className="btn-primary w-full sm:w-auto">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save Bureau Profile</>}
            </button>
          </div>
        )}
      </div>

      {/* Resources */}
      <div className="card bg-blue-50 border border-blue-100">
        <h2 className="text-sm font-bold text-blue-900 mb-2">Recommended Bureau Setup Order</h2>
        <ul className="space-y-2 text-xs text-blue-700">
          <li className="flex gap-2"><span className="font-bold shrink-0 text-blue-900">Step 1</span><span><strong>D&B D-U-N-S (Free)</strong> — Register at dnb.com. Required by most vendors for net terms. Standard registration is free.</span></li>
          <li className="flex gap-2"><span className="font-bold shrink-0 text-blue-900">Step 2</span><span><strong>Nav Free Tier</strong> — Sign up at nav.com to monitor D&B, Experian, and Equifax business bureau standing in one free dashboard. Best low-cost first step before paying for other tools.</span></li>
          <li className="flex gap-2"><span className="font-bold shrink-0 text-blue-900">Step 3</span><span><strong>Experian Business (Paid monitoring)</strong> — Set up access to your Experian Intelliscore file. Paid monitoring product.</span></li>
          <li className="flex gap-2"><span className="font-bold shrink-0 text-blue-900">Step 4</span><span><strong>CreditSafe (Paid)</strong> — Useful for vendor reporting visibility. Check if a free self-view for your own business is available.</span></li>
          <li className="flex gap-2"><span className="font-bold shrink-0 text-blue-900">Step 5</span><span><strong>Equifax Business</strong> — No verified direct self-serve signup route. Monitor via Nav or approved aggregator when available.</span></li>
          <li className="flex gap-2 pt-1 border-t border-blue-200"><span className="shrink-0">📊</span><span><strong>PAYDEX goal:</strong> 80+ (paid as agreed) → 90+ (paid early) for best approval rates</span></li>
        </ul>
      </div>
    </div>
  )
}
