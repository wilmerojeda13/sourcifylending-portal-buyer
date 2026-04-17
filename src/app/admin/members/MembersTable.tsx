'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ProgramId, SubscriptionStatus } from '@/types'
import { Loader2, Plus, X } from 'lucide-react'

interface MemberRow {
  id: string
  full_name: string
  email: string
  business_name: string | null
  business_count: number
  plan_tier: string
  subscription_status: string
  assigned_program: ProgramId | null
  active_programs: string[]
  current_stage: string | null
  account_state: string
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

const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'inactive']

const STATUS_DOT: Record<string, string> = {
  active: 'bg-green-500',
  trialing: 'bg-blue-500',
  past_due: 'bg-amber-500',
  canceled: 'bg-red-500',
  inactive: 'bg-gray-400',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  trialing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  past_due: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  canceled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  inactive: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

const PLAN_BADGE: Record<string, string> = {
  free: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  unset: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

export default function MembersTable({ members }: { members: MemberRow[] }) {
  const [rows, setRows] = useState(members)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRisk, setFilterRisk] = useState('')

  // Create user modal
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<{ full_name: string; email: string; assigned_program: string; plan_tier: 'free' | 'paid'; subscription_status: string }>({ full_name: '', email: '', assigned_program: '', plan_tier: 'free', subscription_status: 'inactive' })
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
          assigned_program: createForm.assigned_program || null,
          plan_tier: createForm.plan_tier,
          subscription_status: createForm.subscription_status,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error || 'Failed to create user'); return }
      setCreateResult({ temp_password: data.temp_password })
      setRows((prev) => [
        {
          id: data.user_id,
          full_name: createForm.full_name,
          email: createForm.email,
          business_name: null,
          business_count: 1,
          plan_tier: 'free',
          account_state: 'prospect',
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
        },
        ...prev,
      ])
    } catch {
      setCreateError('Something went wrong. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  function closeCreateModal() {
    setShowCreate(false)
    setCreateForm({ full_name: '', email: '', assigned_program: '', plan_tier: 'free', subscription_status: 'inactive' })
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
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block mb-1">Plan Tier</label>
                  <select
                    value={createForm.plan_tier}
                    onChange={(e) => setCreateForm((f) => ({ ...f, plan_tier: e.target.value as 'free' | 'paid' }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
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
          <Link
            key={m.id}
            href={`/admin/members/${m.id}`}
            aria-label={`Open member ${m.full_name}`}
            className="group block rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 transition-colors hover:border-green-300 hover:bg-green-50/30 dark:hover:border-green-700 dark:hover:bg-green-950/20 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <div className="flex items-start gap-3">
              <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[m.subscription_status] ?? 'bg-gray-400'}`} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-green-700 dark:group-hover:text-green-300">
                    {m.full_name}
                  </div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {m.business_count} {m.business_count === 1 ? 'business' : 'businesses'}
                  </span>
                  {m.is_demo && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Demo
                    </span>
                  )}
                </div>

                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{m.email}</div>
              </div>

              <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5 sm:mt-0 sm:justify-end">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_BADGE[m.plan_tier] ?? PLAN_BADGE.unset}`}>
                  {m.plan_tier === 'paid' ? 'Paid' : m.plan_tier === 'free' ? 'Free' : 'Unset'}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[m.subscription_status] ?? STATUS_BADGE.inactive}`}>
                  {m.subscription_status === 'active' || m.subscription_status === 'trialing' ? 'Active' : m.subscription_status === 'past_due' ? 'Past due' : m.subscription_status === 'canceled' ? 'Canceled' : 'Inactive'}
                </span>
                {m.portal_blocked && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    Blocked
                  </span>
                )}
                {m.suspicious_signup && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    Suspicious
                  </span>
                )}
              </div>
            </div>
          </Link>
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
