'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ProgramId, SubscriptionStatus } from '@/types'
import { Loader2, Plus, X, ChevronRight } from 'lucide-react'

interface MemberRow {
  id: string
  full_name: string
  email: string
  business_name: string | null
  business_count: number
  plan_tier: 'free' | 'paid' | null
  subscription_status: string
  assigned_program: ProgramId | null
  active_programs: string[]
  current_stage: string | null
  portal_blocked: boolean
  suspicious_signup: boolean
  suspicious_signup_reason: string | null
  signup_risk_score: number | null
  is_demo: boolean
  created_at: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  stripe_status: string | null
  current_period_end: string | null
}

const PROGRAM_BADGE: Record<string, string> = {
  program_a: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700',
  program_b: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-700',
  program_c: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-700',
}

const PROGRAM_SHORT: Record<string, string> = {
  program_a: 'Prog A',
  program_b: 'Prog B',
  program_c: 'Prog C',
}

const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'inactive']
const PROGRAM_OPTIONS: (ProgramId | '')[] = ['', 'program_a', 'program_b', 'program_c']
const PLAN_TIER_OPTIONS: ('free' | 'paid')[] = ['free', 'paid']

const STATUS_DOT: Record<string, string> = {
  active:   'bg-green-500',
  trialing: 'bg-blue-500',
  past_due: 'bg-amber-500',
  canceled: 'bg-red-500',
  inactive: 'bg-gray-400',
}

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  trialing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  past_due: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  canceled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  inactive: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

export default function MembersTable({ members }: { members: MemberRow[] }) {
  const [rows, setRows] = useState(members)
  const [saving, setSaving] = useState<string | null>(null)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [resendingInvite, setResendingInvite] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRisk, setFilterRisk] = useState('')

  // Create user modal
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<{ full_name: string; email: string; assigned_program: string; plan_tier: 'free' | 'paid'; subscription_status: string }>({ full_name: '', email: '', assigned_program: '', plan_tier: 'paid', subscription_status: 'inactive' })
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<{ temp_password: string } | null>(null)
  const [createError, setCreateError] = useState('')

  async function createUser() {
    if (!createForm.full_name.trim() || !createForm.email.trim()) { setCreateError('Name and email are required'); return }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: createForm.full_name,
          email: createForm.email,
          plan_tier: createForm.plan_tier,
          assigned_program: createForm.assigned_program || null,
          subscription_status: createForm.subscription_status,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error || 'Failed to create user'); return }
      setCreateResult({ temp_password: data.temp_password })
        setRows((prev) => [{
          id: data.user_id,
          full_name: createForm.full_name,
          email: createForm.email,
          business_name: null,
          business_count: 1,
          plan_tier: createForm.plan_tier,
          subscription_status: createForm.subscription_status,
        assigned_program: (createForm.assigned_program as ProgramId) || null,
        active_programs: [],
        current_stage: null,
        portal_blocked: false,
        suspicious_signup: false,
        suspicious_signup_reason: null,
        signup_risk_score: null,
        is_demo: false,
        created_at: new Date().toISOString(),
        stripe_subscription_id: null,
        stripe_customer_id: null,
        stripe_status: null,
        current_period_end: null,
      }, ...prev])
    } catch {
      setCreateError('Something went wrong. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  function closeCreateModal() {
    setShowCreate(false)
    setCreateForm({ full_name: '', email: '', assigned_program: '', plan_tier: 'paid', subscription_status: 'inactive' })
    setCreateResult(null)
    setCreateError('')
  }

  const filtered = rows.filter((m) => {
    const q = search.toLowerCase()
    const matchSearch = !q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.business_name ?? '').toLowerCase().includes(q)
    const matchStatus = !filterStatus || m.subscription_status === filterStatus
    const matchRisk =
      !filterRisk ||
      (filterRisk === 'suspicious' && m.suspicious_signup) ||
      (filterRisk === 'blocked' && m.portal_blocked)
    return matchSearch && matchStatus && matchRisk
  })

  async function resendInvite(userId: string) {
    setResendingInvite(userId)
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, resend: true }),
      })
      if (!res.ok) throw new Error('Failed')
      alert('Invite sent!')
    } catch {
      alert('Failed to send invite')
    } finally {
      setResendingInvite(null)
    }
  }

  async function grantAccess(userId: string, program: ProgramId) {
    setSaving(userId)
    try {
      const res = await fetch('/api/admin/update-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, subscription_status: 'active', assigned_program: program }),
      })
      if (!res.ok) throw new Error('Failed')
      setRows((prev) => prev.map((r) => r.id === userId ? { ...r, subscription_status: 'active', assigned_program: program } : r))
    } catch {
      alert('Failed to grant access')
    } finally {
      setSaving(null)
    }
  }

  async function updateStatus(userId: string, status: SubscriptionStatus) {
    setSaving(userId + '_status')
    try {
      const res = await fetch('/api/admin/update-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, subscription_status: status }),
      })
      if (!res.ok) throw new Error('Failed')
      setRows((prev) => prev.map((r) => r.id === userId ? { ...r, subscription_status: status } : r))
    } catch {
      alert('Status update failed')
    } finally {
      setSaving(null)
    }
  }

  async function updateProgram(userId: string, program: ProgramId | null) {
    setSaving(userId + '_program')
    try {
      const res = await fetch('/api/admin/update-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, assigned_program: program }),
      })
      if (!res.ok) throw new Error('Failed')
      setRows((prev) => prev.map((r) => r.id === userId ? { ...r, assigned_program: program } : r))
    } catch {
      alert('Program update failed')
    } finally {
      setSaving(null)
    }
  }

  async function updatePlanTier(userId: string, planTier: 'free' | 'paid') {
    setSaving(userId + '_tier')
    try {
      const res = await fetch('/api/admin/update-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, plan_tier: planTier }),
      })
      if (!res.ok) throw new Error('Failed')
      setRows((prev) => prev.map((r) => r.id === userId ? { ...r, plan_tier: planTier } : r))
    } catch {
      alert('Plan tier update failed')
    } finally {
      setSaving(null)
    }
  }

  async function cancelSubscription(userId: string, stripeSubId: string | null) {
    if (!confirm('Cancel this subscription? This cannot be undone.')) return
    setCanceling(userId)
    try {
      const res = await fetch('/api/admin/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, stripe_subscription_id: stripeSubId }),
      })
      if (!res.ok) throw new Error('Failed')
      setRows((prev) => prev.map((r) => r.id === userId ? { ...r, subscription_status: 'canceled', stripe_status: 'canceled' } : r))
    } catch {
      alert('Cancellation failed')
    } finally {
      setCanceling(null)
    }
  }

  async function updateSecurityFlags(
    userId: string,
    updates: {
      portal_blocked?: boolean
      suspicious_signup?: boolean
      suspicious_signup_reason?: string | null
    },
  ) {
    setSaving(userId + '_security')
    try {
      const res = await fetch('/api/admin/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...updates }),
      })
      if (!res.ok) throw new Error('Failed')
      setRows((prev) => prev.map((row) => row.id === userId ? { ...row, ...updates } : row))
    } catch {
      alert('Failed to update account security flags')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Create New User</h2>
              <button onClick={closeCreateModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
            </div>
            {createResult ? (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-1">Account created successfully!</p>
                  <p className="text-xs text-green-700 dark:text-green-400">Share these credentials with the new member:</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                  <p className="text-sm font-mono font-semibold text-gray-900 dark:text-white">{createForm.email}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Temporary Password</p>
                  <p className="text-sm font-mono font-semibold text-gray-900 dark:text-white select-all">{createResult.temp_password}</p>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400">⚠ Copy this password now — it won&apos;t be shown again.</p>
                <button onClick={closeCreateModal} className="w-full text-sm px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-600 text-white font-semibold hover:bg-gray-700 dark:hover:bg-gray-500">
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={createForm.full_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="John Smith"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block mb-1">Email *</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="john@example.com"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block mb-1">Plan Tier</label>
                  <select
                    value={createForm.plan_tier}
                    onChange={(e) => setCreateForm((f) => ({ ...f, plan_tier: e.target.value as 'free' | 'paid' }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="paid">Paid</option>
                    <option value="free">Free</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block mb-1">Program (optional)</label>
                  <select
                    value={createForm.assigned_program}
                    onChange={(e) => setCreateForm((f) => ({ ...f, assigned_program: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="">No program</option>
                    <option value="program_a">Program A — 0% Intro APR Advisory</option>
                    <option value="program_b">Program B — Business Credit Builder</option>
                    <option value="program_c">Program C — Capital Monitoring</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block mb-1">Subscription Status</label>
                  <select
                    value={createForm.subscription_status}
                    onChange={(e) => setCreateForm((f) => ({ ...f, subscription_status: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {createError && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{createError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={closeCreateModal} className="flex-1 text-sm px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    Cancel
                  </button>
                  <button
                    onClick={createUser}
                    disabled={creating}
                    className="flex-1 text-sm px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {creating ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create User'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search name, email, business…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm w-64 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All risk states</option>
          <option value="suspicious">Suspicious</option>
          <option value="blocked">Blocked</option>
        </select>
        <span className="text-sm text-gray-400 dark:text-gray-500 self-center">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white transition-colors"
        >
          <Plus size={15} /> Create User
        </button>
      </div>

      {/* Card List */}
      <div className="space-y-2">
        {filtered.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/30 dark:hover:bg-green-950/20 transition-colors"
          >
            {/* Status dot */}
            <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[m.subscription_status] ?? 'bg-gray-400'}`} />

            {/* Member info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link
                  href={`/admin/members/${m.id}`}
                  className="text-sm font-semibold text-gray-900 dark:text-white hover:text-green-700 dark:hover:text-green-400 hover:underline"
                >
                  {m.full_name}
                </Link>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  — {m.business_count} {m.business_count === 1 ? 'business' : 'businesses'}
                </span>
                {m.is_demo && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full uppercase">Demo</span>
                )}
                {m.portal_blocked && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-full uppercase">Blocked</span>
                )}
                {m.suspicious_signup && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full uppercase">Suspicious</span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.email}</div>
              {m.business_name && <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{m.business_name}</div>}
              {m.suspicious_signup_reason && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400 truncate">
                  {m.suspicious_signup_reason}{m.signup_risk_score !== null ? ` · risk ${m.signup_risk_score}` : ''}
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[m.subscription_status] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                {m.subscription_status}
              </span>
              {m.active_programs.length > 0 && m.active_programs.map((code) => (
                <span key={code} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PROGRAM_BADGE[code] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  {PROGRAM_SHORT[code] ?? code}
                </span>
              ))}
              {m.active_programs.length === 0 && m.assigned_program && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PROGRAM_BADGE[m.assigned_program] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  {PROGRAM_SHORT[m.assigned_program] ?? m.assigned_program}
                </span>
              )}
            </div>

            {/* Plan Tier selector */}
            <select
              value={m.plan_tier || ''}
              onChange={(e) => updatePlanTier(m.id, e.target.value as 'free' | 'paid')}
              disabled={saving === m.id + '_tier'}
              className="hidden md:block text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
            >
              <option value="">Unset</option>
              <option value="paid">Paid</option>
              <option value="free">Free</option>
            </select>

            {/* Status selector */}
            <select
              value={m.subscription_status}
              onChange={(e) => updateStatus(m.id, e.target.value as SubscriptionStatus)}
              disabled={saving === m.id + '_status'}
              className="hidden md:block text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {m.subscription_status !== 'active' && m.assigned_program && (
                <button
                  onClick={() => grantAccess(m.id, m.assigned_program!)}
                  disabled={saving === m.id}
                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {saving === m.id ? 'Activating…' : 'Grant Active'}
                </button>
              )}
              {m.subscription_status === 'active' && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium whitespace-nowrap">✓ Active</span>
              )}
              {m.stripe_subscription_id && m.subscription_status !== 'canceled' && (
                <button
                  onClick={() => cancelSubscription(m.id, m.stripe_subscription_id)}
                  disabled={canceling === m.id}
                  className="hidden sm:block text-xs bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-1 rounded-lg border border-red-200 dark:border-red-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {canceling === m.id ? 'Canceling…' : 'Cancel Sub'}
                </button>
              )}
              <button
                onClick={() => resendInvite(m.id)}
                disabled={resendingInvite === m.id}
                className="text-xs bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {resendingInvite === m.id ? 'Sending…' : 'Resend'}
              </button>
              <button
                onClick={() => updateSecurityFlags(m.id, {
                  suspicious_signup: !m.suspicious_signup,
                  suspicious_signup_reason: m.suspicious_signup ? null : (m.suspicious_signup_reason ?? 'Marked suspicious by admin review'),
                })}
                disabled={saving === m.id + '_security'}
                className="hidden sm:block text-xs bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {m.suspicious_signup ? 'Clear Flag' : 'Mark Suspicious'}
              </button>
              <button
                onClick={() => updateSecurityFlags(m.id, { portal_blocked: !m.portal_blocked })}
                disabled={saving === m.id + '_security'}
                className="hidden sm:block text-xs bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {m.portal_blocked ? 'Unblock' : 'Block'}
              </button>
              <Link href={`/admin/members/${m.id}`} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            No members found.
          </div>
        )}
      </div>
    </div>
  )
}
