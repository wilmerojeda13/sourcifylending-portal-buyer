'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, Save, CheckCircle, ToggleLeft, ToggleRight, Settings, Gift, Shield } from 'lucide-react'

interface ProgramSettings {
  id: string
  program_type: string
  setup_commission_percent: number
  recurring_commission_percent: number
  setup_hold_days: number
  recurring_hold_days: number
  minimum_payout_threshold: number
  setup_commissions_enabled: boolean
  recurring_commissions_enabled: boolean
}

const PROGRAM_LABELS: Record<string, { label: string; color: string }> = {
  program_a: { label: 'Program A', color: 'bg-blue-100 text-blue-700' },
  program_b: { label: 'Program B', color: 'bg-purple-100 text-purple-700' },
  program_c: { label: 'Program C', color: 'bg-emerald-100 text-emerald-700' },
}

const SUB_NAV = [
  { label: 'Partners', href: '/admin/affiliates' },
  { label: 'Commissions', href: '/admin/affiliates/commissions' },
  { label: 'Settings', href: '/admin/affiliates/settings', active: true },
  { label: 'Resources', href: '/admin/affiliates/resources' },
  { label: 'Flags', href: '/admin/affiliates/flags' },
]

function NumberInput({
  label, value, onChange, suffix = '', min = 0, step = 1,
}: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; min?: number; step?: number
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        {suffix && <span className="text-sm text-gray-400 shrink-0">{suffix}</span>}
      </div>
    </div>
  )
}

function ToggleRow({
  label, desc, enabled, onToggle,
}: {
  label: string; desc: string; enabled: boolean; onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between py-2 border-t border-gray-100">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      <button onClick={onToggle} className="text-gray-400 hover:text-indigo-600 transition-colors">
        {enabled
          ? <ToggleRight size={28} className="text-indigo-600" />
          : <ToggleLeft size={28} className="text-gray-300" />
        }
      </button>
    </div>
  )
}

interface GlobalSettings {
  require_approval_for_affiliate_closed: boolean
}

export default function AffiliateSettingsPage() {
  const [settings, setSettings] = useState<ProgramSettings[]>([])
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({ require_approval_for_affiliate_closed: false })
  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalSaving, setGlobalSaving] = useState(false)
  const [globalSaved, setGlobalSaved] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [progRes, globalRes] = await Promise.all([
        fetch('/api/admin/affiliates/settings'),
        fetch('/api/admin/affiliates/global-settings'),
      ])
      const progData = await progRes.json()
      const globalData = await globalRes.json()
      setSettings(progData.settings ?? [])
      if (globalData.settings) setGlobalSettings(globalData.settings)
    } catch { /* no-op */ }
    setLoading(false)
  }, [])

  async function saveGlobalSettings() {
    setGlobalSaving(true)
    try {
      await fetch('/api/admin/affiliates/global-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(globalSettings),
      })
      setGlobalSaved(true)
      setTimeout(() => setGlobalSaved(false), 2500)
    } catch { /* no-op */ }
    setGlobalSaving(false)
  }

  useEffect(() => { fetchSettings() }, [fetchSettings])

  function updateField(programType: string, field: keyof ProgramSettings, value: unknown) {
    setSettings(prev => prev.map(s => s.program_type === programType ? { ...s, [field]: value } : s))
  }

  async function saveProgram(programType: string) {
    setSaveLoading(programType)
    setErrors(e => ({ ...e, [programType]: '' }))
    const s = settings.find(s => s.program_type === programType)
    if (!s) { setSaveLoading(null); return }
    try {
      const res = await fetch('/api/admin/affiliates/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_type: programType,
          setup_commission_percent: s.setup_commission_percent,
          recurring_commission_percent: s.recurring_commission_percent,
          setup_hold_days: s.setup_hold_days,
          recurring_hold_days: s.recurring_hold_days,
          minimum_payout_threshold: s.minimum_payout_threshold,
          setup_commissions_enabled: s.setup_commissions_enabled,
          recurring_commissions_enabled: s.recurring_commissions_enabled,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErrors(e => ({ ...e, [programType]: data.error || 'Save failed' })); setSaveLoading(null); return }
      setSaved(programType)
      setTimeout(() => setSaved(null), 2500)
    } catch {
      setErrors(e => ({ ...e, [programType]: 'Network error' }))
    }
    setSaveLoading(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ChevronLeft size={14} /> Admin
          </Link>
          <span className="text-gray-300">/</span>
          <Link href="/admin/affiliates" className="text-sm text-gray-500 hover:text-gray-700">Partners</Link>
          <span className="text-gray-300">/</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partner Compensation Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configure partner compensation rates and hold periods per program</p>
          </div>
        </div>

        {/* Sub-nav */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {SUB_NAV.map(({ label, href, active }) => (
            <Link key={href} href={href}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${active
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-green-700 hover:bg-green-50'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-indigo-600" />
          </div>
        ) : (
          <>
            {/* Program Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {['program_a', 'program_b', 'program_c'].map(pt => {
                const s = settings.find(s => s.program_type === pt) ?? {
                  id: '', program_type: pt,
                  setup_commission_percent: 0, recurring_commission_percent: 0,
                  setup_hold_days: 30, recurring_hold_days: 14,
                  minimum_payout_threshold: 50,
                  setup_commissions_enabled: true,
                  recurring_commissions_enabled: true,
                }
                const meta = PROGRAM_LABELS[pt]
                const isSaving = saveLoading === pt
                const wasSaved = saved === pt
                const err = errors[pt]

                return (
                  <div key={pt} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                    {/* Program Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Settings size={16} className="text-gray-500" />
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span>
                      </div>
                    </div>

                    {/* Fields */}
                    <NumberInput
                      label="Setup Commission %"
                      value={s.setup_commission_percent}
                      onChange={v => updateField(pt, 'setup_commission_percent', v)}
                      suffix="%"
                      step={0.5}
                    />
                    <NumberInput
                      label="Recurring Commission %"
                      value={s.recurring_commission_percent}
                      onChange={v => updateField(pt, 'recurring_commission_percent', v)}
                      suffix="%"
                      step={0.5}
                    />
                    <NumberInput
                      label="Setup Hold Days"
                      value={s.setup_hold_days}
                      onChange={v => updateField(pt, 'setup_hold_days', v)}
                      suffix="days"
                    />
                    <NumberInput
                      label="Recurring Hold Days"
                      value={s.recurring_hold_days}
                      onChange={v => updateField(pt, 'recurring_hold_days', v)}
                      suffix="days"
                    />
                    <NumberInput
                      label="Minimum Payout Threshold"
                      value={s.minimum_payout_threshold}
                      onChange={v => updateField(pt, 'minimum_payout_threshold', v)}
                      suffix="$"
                    />

                    {/* Toggles */}
                    <ToggleRow
                      label="Setup Commissions"
                      desc="Enable one-time setup fee commissions"
                      enabled={s.setup_commissions_enabled}
                      onToggle={() => updateField(pt, 'setup_commissions_enabled', !s.setup_commissions_enabled)}
                    />
                    <ToggleRow
                      label="Recurring Commissions"
                      desc="Enable monthly recurring commissions"
                      enabled={s.recurring_commissions_enabled}
                      onToggle={() => updateField(pt, 'recurring_commissions_enabled', !s.recurring_commissions_enabled)}
                    />

                    {err && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{err}</div>
                    )}

                    <button
                      onClick={() => saveProgram(pt)}
                      disabled={isSaving}
                      className={`w-full text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                        wasSaved ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
                      } disabled:opacity-60`}
                    >
                      {isSaving ? (
                        <><Loader2 size={14} className="animate-spin" /> Saving…</>
                      ) : wasSaved ? (
                        <><CheckCircle size={14} /> Saved!</>
                      ) : (
                        <><Save size={14} /> Save {meta.label}</>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Global Deal Type Settings */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Settings size={18} className="text-indigo-600" /> Legacy Deal-Type Rules
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                Controls how historical referral-only and legacy closed deals are handled. New partner-assisted deals use the dedicated 80% setup / 20% recurring model.
              </p>

              {/* Rate Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-1">Legacy Partner Referral</p>
                  <p className="font-bold text-gray-900 text-sm">10% Setup · 10% Recurring</p>
                  <p className="text-xs text-gray-500 mt-1">Historical referral-only records where SourcifyLending closed the deal</p>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-1">Legacy Closed</p>
                  <p className="font-bold text-gray-900 text-sm">30% Setup · 30% Recurring</p>
                  <p className="text-xs text-gray-500 mt-1">Historical deals where the partner handled the full sales process</p>
                </div>
              </div>

              <ToggleRow
                label="Require Admin Approval for Legacy Closed Deals"
                desc="When ON: legacy closed records stay at 10% until an admin approves the designation. When OFF: the legacy 30% rate applies immediately."
                enabled={globalSettings.require_approval_for_affiliate_closed}
                onToggle={() => setGlobalSettings(g => ({ ...g, require_approval_for_affiliate_closed: !g.require_approval_for_affiliate_closed }))}
              />

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={saveGlobalSettings}
                  disabled={globalSaving}
                  className={`flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-colors ${
                    globalSaved ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
                  } disabled:opacity-60`}
                >
                  {globalSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                   : globalSaved ? <><CheckCircle size={14} /> Saved!</>
                   : <><Save size={14} /> Save Global Settings</>}
                </button>
              </div>
            </div>

            {/* Free Access Incentive Info */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Gift size={18} className="text-emerald-600" /> Free Access Incentive Rules
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  {
                    icon: '👥',
                    label: 'Threshold',
                    value: '5 Active Clients',
                    desc: 'Partner must maintain 5 simultaneously active client accounts',
                  },
                  {
                    icon: '📅',
                    label: 'Qualification Period',
                    value: '14 Consecutive Days',
                    desc: 'The threshold must be maintained for 14 consecutive days to qualify',
                  },
                  {
                    icon: '🎁',
                    label: 'Reward',
                    value: 'Program B Free Access',
                    desc: 'Partner receives complimentary Program B membership access',
                  },
                ].map(({ icon, label, value, desc }) => (
                  <div key={label} className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <div className="text-2xl mb-2">{icon}</div>
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">{label}</p>
                    <p className="font-bold text-gray-900 text-sm mb-1">{value}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                These rules are hardcoded in the system logic. To modify the thresholds or reward type, a developer change is required.
                The &quot;Run Free Access Check&quot; button on the main partners page manually triggers the eligibility check.
              </p>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
