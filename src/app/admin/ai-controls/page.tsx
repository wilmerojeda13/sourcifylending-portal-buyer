'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Zap, Settings, Users, TrendingUp, AlertTriangle, RefreshCw,
  Loader2, ChevronDown, ChevronRight, CheckCircle, XCircle,
  DollarSign, Clock, Shield, Edit3, Save, X, WifiOff, Wifi,
  Package, ShoppingBag, Plus, ToggleLeft, ToggleRight, Gift
} from 'lucide-react'
import type { AIProgramLimits, AIActionCost, AICreditPack } from '@/types'

const PROGRAM_LABELS: Record<string, string> = {
  program_a: 'Program A — 0% Intro APR',
  program_b: 'Program B — Business Credit Builder',
  program_c: 'Program C — Capital Monitoring',
}

const ACTION_LABELS: Record<string, string> = {
  simple_chat: 'Simple Chat',
  guided_recommendation: 'Guided Recommendation',
  analyzer_interpretation: 'Analyzer Interpretation',
  dispute_letter_generation: 'Dispute Letter Generation',
  funding_strategy_response: 'Funding Strategy Response',
  document_review: 'Document Review',
  file_analysis: 'File Analysis',
  heavy_agent_workflow: 'Heavy Agent Workflow',
  underwriting_or_multi_step_deep_analysis: 'Deep Analysis / Underwriting',
}

interface UsageEvent {
  id: string
  user_id: string
  full_name: string
  email: string
  program: string
  action_type: string
  credits_charged: number
  estimated_cost_usd: number
  request_status: string
  created_at: string
}

interface TopUser {
  user_id: string
  full_name: string
  email: string
  program: string
  credits_used: number
  credits_remaining: number
  credits_allocated: number
}

interface PurchaseTransaction {
  id: string
  user_id: string
  credits_added: number
  amount_paid: number | null
  transaction_status: string
  adjusted_by: string | null
  adjustment_reason: string | null
  created_at: string
  profiles: { full_name: string | null; email: string | null; assigned_program: string | null } | null
  ai_credit_packs: { name: string; credits_amount: number; price_usd: number } | null
}

const BLANK_PACK = { name: '', description: '', credits_amount: 100, price_usd: 9.99, stripe_price_id: '', display_order: 99 }

export default function AIControlsPage() {
  const [limits, setLimits] = useState<AIProgramLimits[]>([])
  const [costs, setCosts] = useState<AIActionCost[]>([])
  const [topUsers, setTopUsers] = useState<TopUser[]>([])
  const [blockedAttempts, setBlockedAttempts] = useState<UsageEvent[]>([])
  const [recentEvents, setRecentEvents] = useState<UsageEvent[]>([])
  const [byProgram, setByProgram] = useState<Record<string, { total_credits: number; total_cost_usd: number; request_count: number }>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'limits' | 'costs' | 'users' | 'status' | 'packs' | 'purchases'>('overview')

  // Edit states
  const [editingLimit, setEditingLimit] = useState<string | null>(null)
  const [editingCost, setEditingCost] = useState<string | null>(null)
  const [limitDraft, setLimitDraft] = useState<Partial<AIProgramLimits>>({})
  const [costDraft, setCostDraft] = useState<Partial<AIActionCost>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // ── System Status (maintenance mode) ──
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false)
  const [maintenanceNote, setMaintenanceNote] = useState('')
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)

  // ── Credit Packs ──
  const [packs, setPacks] = useState<AICreditPack[]>([])
  const [packsLoading, setPacksLoading] = useState(false)
  const [editingPack, setEditingPack] = useState<string | null>(null) // pack id or 'new'
  const [packDraft, setPackDraft] = useState<typeof BLANK_PACK>(BLANK_PACK)
  const [packSaving, setPackSaving] = useState(false)
  const [packMsg, setPackMsg] = useState('')

  // ── Purchases ──
  const [purchases, setPurchases] = useState<PurchaseTransaction[]>([])
  const [purchasesTotal, setPurchasesTotal] = useState(0)
  const [purchasesLoading, setPurchasesLoading] = useState(false)
  const [grantUserId, setGrantUserId] = useState('')
  const [grantCredits, setGrantCredits] = useState('')
  const [grantSourceType, setGrantSourceType] = useState<'admin_grant' | 'promo'>('admin_grant')
  const [grantReason, setGrantReason] = useState('')
  const [grantSaving, setGrantSaving] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')

  const loadMaintenance = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await fetch('/api/admin/ai-maintenance')
      if (res.ok) {
        const d = await res.json()
        setMaintenanceEnabled(d.enabled ?? false)
        setMaintenanceNote(d.note ?? '')
      }
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const saveMaintenance = async (enabled: boolean) => {
    setStatusSaving(true)
    try {
      const res = await fetch('/api/admin/ai-maintenance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, note: maintenanceNote }),
      })
      if (res.ok) {
        setMaintenanceEnabled(enabled)
        setSaveMsg(enabled ? 'AI maintenance mode ENABLED' : 'AI maintenance mode disabled')
        setTimeout(() => setSaveMsg(''), 4000)
      } else {
        setSaveMsg('Error updating status')
      }
    } finally {
      setStatusSaving(false)
    }
  }

  const saveMaintenanceNote = async () => {
    setStatusSaving(true)
    try {
      const res = await fetch('/api/admin/ai-maintenance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: maintenanceEnabled, note: maintenanceNote }),
      })
      if (res.ok) {
        setSaveMsg('Note saved')
        setTimeout(() => setSaveMsg(''), 3000)
      }
    } finally {
      setStatusSaving(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [limitsRes, costsRes, overviewRes, recentRes] = await Promise.all([
      fetch('/api/admin/ai-limits'),
      fetch('/api/admin/ai-action-costs'),
      fetch('/api/admin/ai-usage?view=overview'),
      fetch('/api/admin/ai-usage?view=recent'),
    ])

    if (limitsRes.ok) { const d = await limitsRes.json(); setLimits(d.limits ?? []) }
    if (costsRes.ok) { const d = await costsRes.json(); setCosts(d.costs ?? []) }
    if (overviewRes.ok) {
      const d = await overviewRes.json()
      setTopUsers(d.top_users ?? [])
      setBlockedAttempts(d.blocked_attempts ?? [])
      setByProgram(d.by_program ?? {})
    }
    if (recentRes.ok) { const d = await recentRes.json(); setRecentEvents(d.events ?? []) }
    setLoading(false)
  }, [])

  const loadPacks = useCallback(async () => {
    setPacksLoading(true)
    try {
      const res = await fetch('/api/admin/ai-credit-packs')
      if (res.ok) { const d = await res.json(); setPacks(d.packs ?? []) }
    } finally {
      setPacksLoading(false)
    }
  }, [])

  const loadPurchases = useCallback(async () => {
    setPurchasesLoading(true)
    try {
      const res = await fetch('/api/admin/ai-credit-purchases?limit=100')
      if (res.ok) {
        const d = await res.json()
        setPurchases(d.transactions ?? [])
        setPurchasesTotal(d.total ?? 0)
      }
    } finally {
      setPurchasesLoading(false)
    }
  }, [])

  useEffect(() => { load(); loadMaintenance() }, [load, loadMaintenance])

  useEffect(() => {
    if (activeTab === 'packs') loadPacks()
    if (activeTab === 'purchases') loadPurchases()
  }, [activeTab, loadPacks, loadPurchases])

  // ── Save program limit ──
  const saveLimit = async (program: string) => {
    setSaving(true)
    const res = await fetch('/api/admin/ai-limits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program, ...limitDraft }),
    })
    setSaving(false)
    if (res.ok) {
      setEditingLimit(null)
      setSaveMsg('Limits updated!')
      setTimeout(() => setSaveMsg(''), 3000)
      load()
    } else {
      setSaveMsg('Error saving — check console')
    }
  }

  // ── Save action cost ──
  const saveCost = async (action_type: string) => {
    setSaving(true)
    const res = await fetch('/api/admin/ai-action-costs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type, ...costDraft }),
    })
    setSaving(false)
    if (res.ok) {
      setEditingCost(null)
      setSaveMsg('Action cost updated!')
      setTimeout(() => setSaveMsg(''), 3000)
      load()
    } else {
      setSaveMsg('Error saving — check console')
    }
  }

  // ── Credit Pack CRUD ──
  const savePack = async () => {
    setPackSaving(true)
    const isNew = editingPack === 'new'
    try {
      const res = await fetch('/api/admin/ai-credit-packs', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? packDraft : { id: editingPack, ...packDraft }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setPackMsg(isNew ? 'Pack created!' : 'Pack updated!')
      setTimeout(() => setPackMsg(''), 3000)
      setEditingPack(null)
      setPackDraft(BLANK_PACK)
      loadPacks()
    } catch (e) {
      setPackMsg((e as Error).message)
    } finally {
      setPackSaving(false)
    }
  }

  const togglePackActive = async (pack: AICreditPack) => {
    const res = await fetch('/api/admin/ai-credit-packs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pack.id, is_active: !pack.is_active }),
    })
    if (res.ok) loadPacks()
  }

  const deletePack = async (id: string) => {
    if (!confirm('Deactivate this pack? It will no longer appear to users but purchase history is preserved.')) return
    await fetch(`/api/admin/ai-credit-packs?id=${id}`, { method: 'DELETE' })
    loadPacks()
  }

  // ── Manual Credit Grant ──
  const submitGrant = async () => {
    if (!grantUserId.trim() || !grantCredits) return
    setGrantSaving(true)
    setGrantMsg('')
    try {
      const res = await fetch('/api/admin/ai-credit-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: grantUserId.trim(),
          credits_amount: Number(grantCredits),
          source_type: grantSourceType,
          reason: grantReason.trim() || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setGrantMsg(`✅ ${grantCredits} credits granted successfully.`)
      setGrantUserId(''); setGrantCredits(''); setGrantReason('')
      loadPurchases()
    } catch (e) {
      setGrantMsg(`❌ ${(e as Error).message}`)
    } finally {
      setGrantSaving(false)
    }
  }

  const tabs = [
    { id: 'overview',   label: 'Overview',       icon: TrendingUp },
    { id: 'limits',     label: 'Program Limits',  icon: Settings },
    { id: 'costs',      label: 'Action Costs',    icon: Zap },
    { id: 'users',      label: 'Top Users',        icon: Users },
    { id: 'packs',      label: 'Credit Packs',     icon: Package },
    { id: 'purchases',  label: 'Purchases',        icon: ShoppingBag },
    { id: 'status',     label: 'System Status',    icon: maintenanceEnabled ? WifiOff : Wifi },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Zap size={22} className="text-green-500" /> AI Usage Controls
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage program AI limits, credit weights, and user overrides</p>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span className="text-sm text-green-600 font-medium">{saveMsg}</span>
            )}
            <button onClick={load} disabled={loading} className="btn-secondary text-xs px-3 py-2">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2">
              ← Admin
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-green-700'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {loading && activeTab !== 'packs' && activeTab !== 'purchases' ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={24} className="animate-spin text-green-400" />
          </div>
        ) : (
          <>
            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Program credit stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['program_a', 'program_b', 'program_c'].map((prog) => {
                    const stats = byProgram[prog]
                    return (
                      <div key={prog} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                          {PROGRAM_LABELS[prog]}
                        </p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Requests</span>
                            <span className="font-bold text-gray-900">{stats?.request_count ?? 0}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Credits Used</span>
                            <span className="font-bold text-gray-900">{stats?.total_credits ?? 0}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Est. Cost (USD)</span>
                            <span className="font-bold text-green-700">
                              ${(stats?.total_cost_usd ?? 0).toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Blocked attempts */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    <h2 className="font-bold text-gray-900 text-sm">Recent Blocked Requests</h2>
                    <span className="ml-auto text-xs text-gray-400">{blockedAttempts.length} records</span>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                    {blockedAttempts.length === 0 ? (
                      <div className="px-5 py-6 text-center text-gray-400 text-sm">No blocked requests</div>
                    ) : blockedAttempts.map((evt) => (
                      <div key={evt.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                        <div className="w-2 h-2 bg-red-400 rounded-full shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-700 truncate">{ACTION_LABELS[evt.action_type] ?? evt.action_type}</p>
                          <p className="text-xs text-gray-400">{evt.program ?? 'unknown program'}</p>
                        </div>
                        <span className="text-xs text-gray-400">{new Date(evt.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent events */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    <h2 className="font-bold text-gray-900 text-sm">Recent AI Events (All Users)</h2>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                    {recentEvents.map((evt) => (
                      <div key={evt.id} className="flex items-center gap-4 px-5 py-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          evt.request_status === 'success' ? 'bg-green-400'
                          : evt.request_status === 'blocked' ? 'bg-red-400'
                          : 'bg-gray-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">
                            {evt.full_name || evt.email || 'Unknown'} — {ACTION_LABELS[evt.action_type] ?? evt.action_type}
                          </p>
                          <p className="text-xs text-gray-400">{evt.program ?? '—'} · {evt.request_status}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-gray-700">-{evt.credits_charged} cr</p>
                          <p className="text-[10px] text-gray-400">${(evt.estimated_cost_usd ?? 0).toFixed(4)}</p>
                        </div>
                        <span className="text-xs text-gray-300 shrink-0">{new Date(evt.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                    {recentEvents.length === 0 && (
                      <div className="px-5 py-6 text-center text-gray-400 text-sm">No events yet</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── PROGRAM LIMITS TAB ── */}
            {activeTab === 'limits' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Edit program-level AI credit limits. Changes take effect immediately for new requests.</p>
                {limits.map((limit) => (
                  <div key={limit.program} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900">{PROGRAM_LABELS[limit.program] ?? limit.program}</h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${limit.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {limit.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {editingLimit === limit.program ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveLimit(limit.program)}
                            disabled={saving}
                            className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                          </button>
                          <button
                            onClick={() => { setEditingLimit(null); setLimitDraft({}) }}
                            className="flex items-center gap-1 text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                          >
                            <X size={12} /> Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingLimit(limit.program); setLimitDraft(limit) }}
                          className="flex items-center gap-1 text-xs text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { field: 'monthly_credits', label: 'Monthly Credits' },
                        { field: 'daily_credit_cap', label: 'Daily Cap' },
                        { field: 'max_requests_per_hour', label: 'Max Req/Hour' },
                        { field: 'max_heavy_actions_per_day', label: 'Heavy Actions/Day' },
                      ].map(({ field, label }) => (
                        <div key={field}>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{label}</label>
                          {editingLimit === limit.program ? (
                            <input
                              type="number"
                              min={0}
                              value={(limitDraft as Record<string, number>)[field] ?? (limit as Record<string, number>)[field]}
                              onChange={(e) => setLimitDraft((prev) => ({ ...prev, [field]: parseInt(e.target.value) || 0 }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                          ) : (
                            <p className="text-xl font-bold text-gray-900">{(limit as Record<string, number>)[field]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── ACTION COSTS TAB ── */}
            {activeTab === 'costs' && (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900 text-sm">Credit Costs by Action Type</h2>
                  <p className="text-xs text-gray-500 mt-1">Heavier actions cost more credits. Changes take effect immediately.</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {costs.map((cost) => (
                    <div key={cost.action_type} className="flex items-center gap-4 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {ACTION_LABELS[cost.action_type] ?? cost.action_type}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {cost.is_heavy && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full uppercase">Heavy</span>
                          )}
                          {!cost.is_active && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full uppercase">Disabled</span>
                          )}
                          <span className="text-xs text-gray-400">{cost.description}</span>
                        </div>
                      </div>

                      {editingCost === cost.action_type ? (
                        <div className="flex items-center gap-3">
                          <div>
                            <label className="text-[10px] text-gray-400 block">Credits</label>
                            <input
                              type="number"
                              min={1}
                              value={costDraft.credit_cost ?? cost.credit_cost}
                              onChange={(e) => setCostDraft((prev) => ({ ...prev, credit_cost: parseInt(e.target.value) || 1 }))}
                              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={costDraft.is_heavy ?? cost.is_heavy}
                              onChange={(e) => setCostDraft((prev) => ({ ...prev, is_heavy: e.target.checked }))}
                              className="w-4 h-4 rounded"
                            />
                            Heavy
                          </label>
                          <button
                            onClick={() => saveCost(cost.action_type)}
                            disabled={saving}
                            className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                          </button>
                          <button
                            onClick={() => { setEditingCost(null); setCostDraft({}) }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                            cost.credit_cost <= 2 ? 'bg-green-50 text-green-700'
                            : cost.credit_cost <= 4 ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-red-50 text-red-600'
                          }`}>
                            {cost.credit_cost} cr
                          </span>
                          <button
                            onClick={() => { setEditingCost(cost.action_type); setCostDraft(cost) }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── CREDIT PACKS TAB ── */}
            {activeTab === 'packs' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-gray-900">Purchasable AI Credit Packs</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Define the extra credit packs available for purchase in the AI Usage page.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {packMsg && <span className="text-sm font-medium text-green-600">{packMsg}</span>}
                    <button
                      onClick={() => { setEditingPack('new'); setPackDraft(BLANK_PACK) }}
                      disabled={editingPack === 'new'}
                      className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                    >
                      <Plus size={14} /> New Pack
                    </button>
                    <button onClick={loadPacks} disabled={packsLoading} className="btn-secondary text-xs px-3 py-2">
                      {packsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                  </div>
                </div>

                {/* New pack form */}
                {editingPack === 'new' && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-4">
                    <h3 className="font-bold text-green-800 text-sm flex items-center gap-2"><Plus size={14} /> New Credit Pack</h3>
                    <PackForm draft={packDraft} onChange={setPackDraft} />
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={savePack}
                        disabled={packSaving}
                        className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {packSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Create Pack
                      </button>
                      <button
                        onClick={() => { setEditingPack(null); setPackDraft(BLANK_PACK) }}
                        className="text-xs text-gray-500 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {packsLoading ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 size={20} className="animate-spin text-green-400" />
                  </div>
                ) : packs.length === 0 ? (
                  <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-400 text-sm">
                    No credit packs yet. Click <strong>New Pack</strong> to create one.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {packs.map((pack) => (
                      <div
                        key={pack.id}
                        className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-colors ${pack.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
                      >
                        {editingPack === pack.id ? (
                          <div className="p-5 space-y-4">
                            <PackForm draft={packDraft} onChange={setPackDraft} />
                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={savePack}
                                disabled={packSaving}
                                className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                              >
                                {packSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                              </button>
                              <button
                                onClick={() => { setEditingPack(null); setPackDraft(BLANK_PACK) }}
                                className="text-xs text-gray-500 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-900 text-sm">{pack.name}</p>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pack.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {pack.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              {pack.description && (
                                <p className="text-xs text-gray-400 mt-0.5">{pack.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                                <span className="font-bold text-green-700">{pack.credits_amount} credits</span>
                                <span>·</span>
                                <span className="font-bold text-gray-800">${Number(pack.price_usd).toFixed(2)}</span>
                                {pack.stripe_price_id && (
                                  <><span>·</span><span className="font-mono text-gray-400">{pack.stripe_price_id}</span></>
                                )}
                                <span>·</span>
                                <span>Order: {pack.display_order}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => togglePackActive(pack)}
                                title={pack.is_active ? 'Deactivate' : 'Activate'}
                                className={`p-1.5 rounded-lg transition-colors ${pack.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                              >
                                {pack.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                              </button>
                              <button
                                onClick={() => { setEditingPack(pack.id); setPackDraft({ name: pack.name, description: pack.description ?? '', credits_amount: pack.credits_amount, price_usd: Number(pack.price_usd), stripe_price_id: pack.stripe_price_id ?? '', display_order: pack.display_order }) }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                onClick={() => deletePack(pack.id)}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
                  <strong>Stripe Price ID (optional):</strong> If you create a Price in your Stripe dashboard, paste its ID here (e.g. <code>price_xxx</code>) for faster checkout. If left blank, a dynamic price_data object is used automatically — both work fine.
                </div>
              </div>
            )}

            {/* ── PURCHASES TAB ── */}
            {activeTab === 'purchases' && (
              <div className="space-y-6">

                {/* Manual Grant Card */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-1">
                    <Gift size={15} className="text-green-500" /> Manual Credit Grant
                  </h2>
                  <p className="text-xs text-gray-500 mb-4">Grant extra purchased-bucket credits to any user. They receive an in-app notification.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">User ID</label>
                      <input
                        type="text"
                        value={grantUserId}
                        onChange={(e) => setGrantUserId(e.target.value)}
                        placeholder="UUID from profiles table"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Credits</label>
                      <input
                        type="number"
                        min={1}
                        value={grantCredits}
                        onChange={(e) => setGrantCredits(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Type</label>
                      <select
                        value={grantSourceType}
                        onChange={(e) => setGrantSourceType(e.target.value as 'admin_grant' | 'promo')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      >
                        <option value="admin_grant">Admin Grant</option>
                        <option value="promo">Promo / Bonus</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Reason (optional — shown to user)</label>
                    <input
                      type="text"
                      value={grantReason}
                      onChange={(e) => setGrantReason(e.target.value)}
                      placeholder="e.g. Beta tester bonus, Customer support resolution…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={submitGrant}
                      disabled={grantSaving || !grantUserId.trim() || !grantCredits}
                      className="flex items-center gap-1.5 text-sm bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                    >
                      {grantSaving ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                      Grant Credits
                    </button>
                    {grantMsg && <span className="text-sm font-medium text-gray-700">{grantMsg}</span>}
                  </div>
                </div>

                {/* Transaction History */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <ShoppingBag size={15} className="text-gray-400" />
                    <h2 className="font-bold text-gray-900 text-sm">Purchase Transaction History</h2>
                    <span className="ml-auto text-xs text-gray-400">{purchasesTotal} total</span>
                    <button onClick={loadPurchases} disabled={purchasesLoading} className="ml-2 text-gray-400 hover:text-gray-600">
                      {purchasesLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-[32rem] overflow-y-auto">
                    {purchasesLoading ? (
                      <div className="flex items-center justify-center h-24">
                        <Loader2 size={20} className="animate-spin text-green-400" />
                      </div>
                    ) : purchases.length === 0 ? (
                      <div className="px-5 py-8 text-center text-gray-400 text-sm">No purchases yet</div>
                    ) : purchases.map((txn) => {
                      const isGrant = !txn.ai_credit_packs
                      const statusColor = txn.transaction_status === 'completed' ? 'bg-green-400'
                        : txn.transaction_status === 'failed' ? 'bg-red-400'
                        : txn.transaction_status === 'reversed' ? 'bg-amber-400'
                        : 'bg-gray-300'
                      return (
                        <div key={txn.id} className="flex items-center gap-4 px-5 py-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {txn.profiles?.full_name || 'Unknown'}
                              {' '}
                              <span className="text-gray-400 font-normal">
                                {txn.profiles?.email ? `· ${txn.profiles.email}` : ''}
                              </span>
                            </p>
                            <p className="text-xs text-gray-400">
                              {isGrant
                                ? `Admin ${txn.adjusted_by ? 'grant' : 'grant'}${txn.adjustment_reason ? `: "${txn.adjustment_reason}"` : ''}`
                                : `Pack: ${txn.ai_credit_packs?.name ?? 'Unknown'}`}
                              {' · '}
                              {txn.transaction_status}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-900">+{txn.credits_added} cr</p>
                            <p className="text-xs text-gray-400">
                              {txn.amount_paid != null && txn.amount_paid > 0
                                ? `$${Number(txn.amount_paid).toFixed(2)}`
                                : isGrant ? 'Free' : '$0.00'}
                            </p>
                          </div>
                          <span className="text-xs text-gray-300 shrink-0 ml-2">
                            {new Date(txn.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── SYSTEM STATUS TAB ── */}
            {activeTab === 'status' && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500">
                  Manually enable maintenance mode to block all AI requests platform-wide.
                  When enabled, users will see a friendly message instead of errors.
                </p>

                {/* Current status card */}
                <div className={`rounded-2xl border-2 p-6 ${maintenanceEnabled ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {maintenanceEnabled
                        ? <WifiOff size={28} className="text-red-500 shrink-0" />
                        : <Wifi size={28} className="text-green-500 shrink-0" />
                      }
                      <div>
                        <p className={`text-base font-bold ${maintenanceEnabled ? 'text-red-800' : 'text-green-800'}`}>
                          {maintenanceEnabled ? 'Maintenance Mode ON — AI Blocked' : 'AI Assistant Online'}
                        </p>
                        <p className={`text-xs mt-0.5 ${maintenanceEnabled ? 'text-red-600' : 'text-green-600'}`}>
                          {maintenanceEnabled
                            ? 'All AI requests are currently blocked and will return the maintenance message.'
                            : 'All users have normal AI access (subject to their credit limits).'}
                        </p>
                      </div>
                    </div>

                    {statusLoading ? (
                      <Loader2 size={20} className="animate-spin text-gray-400 shrink-0" />
                    ) : (
                      <button
                        onClick={() => saveMaintenance(!maintenanceEnabled)}
                        disabled={statusSaving}
                        className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                          maintenanceEnabled
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                      >
                        {statusSaving
                          ? 'Saving…'
                          : maintenanceEnabled
                          ? 'Disable Maintenance Mode'
                          : 'Enable Maintenance Mode'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Maintenance note */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                  <h3 className="font-bold text-gray-900 text-sm mb-1">Internal Maintenance Note</h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Optional. This note is logged internally and is NOT shown to users.
                  </p>
                  <textarea
                    rows={3}
                    value={maintenanceNote}
                    onChange={(e) => setMaintenanceNote(e.target.value)}
                    placeholder="e.g. OpenAI rate limit hit — resuming at 3pm. Or: Upgrading model from gpt-4o-mini to gpt-4o."
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  />
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={saveMaintenanceNote}
                      disabled={statusSaving}
                      className="flex items-center gap-1.5 text-xs bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {statusSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Save Note
                    </button>
                  </div>
                </div>

                {/* What users see */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <h3 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-2">
                    <WifiOff size={14} className="text-amber-600" /> Message shown to users when maintenance is ON
                  </h3>
                  <p className="text-xs text-amber-700 leading-relaxed italic">
                    &ldquo;The AI assistant is temporarily unavailable due to maintenance, upgrades, or a temporary service issue.
                    We&apos;re actively working to restore access as quickly as possible. Please try again shortly.&rdquo;
                  </p>
                </div>

                {/* What triggers platform maintenance automatically */}
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                  <h3 className="font-bold text-blue-800 text-sm mb-2">Automatic platform-level triggers</h3>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>• OpenAI quota exhausted (insufficient_quota)</li>
                    <li>• OpenAI rate limit exceeded</li>
                    <li>• Provider service overload (503 / 529)</li>
                    <li>• Network timeout / connection refused</li>
                    <li>• Missing OPENAI_API_KEY environment variable</li>
                    <li>• Unexpected orchestration failure in the agent route</li>
                  </ul>
                  <p className="text-xs text-blue-600 mt-3">
                    These are automatically logged to server console. The maintenance toggle above only controls the <strong>manual</strong> admin-initiated block.
                  </p>
                </div>
              </div>
            )}

            {/* ── TOP USERS TAB ── */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Users ranked by AI credits consumed this month. Click a user to view their full AI usage in their member profile.</p>
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {topUsers.length === 0 && (
                      <div className="px-5 py-8 text-center text-gray-400 text-sm">No usage data yet</div>
                    )}
                    {topUsers.map((u, idx) => {
                      const pct = u.credits_allocated > 0
                        ? Math.min(100, Math.round((u.credits_used / u.credits_allocated) * 100))
                        : 0
                      return (
                        <Link
                          key={u.user_id}
                          href={`/admin/members/${u.user_id}`}
                          className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                        >
                          <span className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{u.full_name || 'Unknown'}</p>
                            <p className="text-xs text-gray-400 truncate">{u.email} · {PROGRAM_LABELS[u.program] ?? u.program}</p>
                            <div className="mt-2 h-1.5 bg-gray-100 rounded-full w-full">
                              <div
                                className={`h-full rounded-full ${pct >= 85 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-green-400'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-900">{u.credits_used} used</p>
                            <p className="text-xs text-gray-400">{u.credits_remaining} left / {u.credits_allocated} total</p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Per-User Overrides</p>
                  <p className="text-xs text-blue-600">
                    To suspend a user's AI access or set custom credit limits, open their profile in{' '}
                    <Link href="/admin/members" className="underline font-semibold">Member Management</Link>{' '}
                    → AI Controls tab.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Pack Form (shared for create & edit) ────────────────────────────────────
function PackForm({
  draft,
  onChange,
}: {
  draft: typeof BLANK_PACK
  onChange: (d: typeof BLANK_PACK) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <div className="sm:col-span-2 md:col-span-1">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Pack Name *</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="e.g. Starter Pack"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Credits *</label>
        <input
          type="number"
          min={1}
          value={draft.credits_amount}
          onChange={(e) => onChange({ ...draft, credits_amount: parseInt(e.target.value) || 0 })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Price (USD) *</label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={draft.price_usd}
          onChange={(e) => onChange({ ...draft, price_usd: parseFloat(e.target.value) || 0 })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Description</label>
        <input
          type="text"
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          placeholder="Short description shown to users"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Display Order</label>
        <input
          type="number"
          min={0}
          value={draft.display_order}
          onChange={(e) => onChange({ ...draft, display_order: parseInt(e.target.value) || 0 })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Stripe Price ID (optional)</label>
        <input
          type="text"
          value={draft.stripe_price_id}
          onChange={(e) => onChange({ ...draft, stripe_price_id: e.target.value })}
          placeholder="price_xxx — leave blank to use dynamic pricing"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>
    </div>
  )
}
