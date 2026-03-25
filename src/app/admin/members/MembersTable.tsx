'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ProgramId, SubscriptionStatus } from '@/types'
import { getProgramShortLabel } from '@/lib/utils'
import { Loader2, Plus, X } from 'lucide-react'

interface MemberRow {
  id: string
  full_name: string
  email: string
  business_name: string | null
  subscription_status: string
  assigned_program: ProgramId | null
  active_programs: string[]
  current_stage: string | null
  portal_blocked: boolean
  is_demo: boolean
  created_at: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  stripe_status: string | null
  current_period_end: string | null
}

const PROGRAM_BADGE: Record<string, string> = {
  program_a: 'bg-blue-100 text-blue-700 border border-blue-200',
  program_b: 'bg-purple-100 text-purple-700 border border-purple-200',
  program_c: 'bg-green-100 text-green-700 border border-green-200',
}

const PROGRAM_SHORT: Record<string, string> = {
  program_a: 'Program A',
  program_b: 'Program B',
  program_c: 'Program C',
}

const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'inactive']
const PROGRAM_OPTIONS: (ProgramId | '')[] = ['', 'program_a', 'program_b', 'program_c']

const statusColors: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-600',
  inactive: 'bg-gray-100 text-gray-500',
}

export default function MembersTable({ members }: { members: MemberRow[] }) {
  const [rows, setRows] = useState(members)
  const [saving, setSaving] = useState<string | null>(null)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [resendingInvite, setResendingInvite] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Create user modal
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', assigned_program: '', subscription_status: 'inactive' })
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
          subscription_status: createForm.subscription_status,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error || 'Failed to create user'); return }
      setCreateResult({ temp_password: data.temp_password })
      // Add new row to table
      setRows((prev) => [{
        id: data.user_id,
        full_name: createForm.full_name,
        email: createForm.email,
        business_name: null,
        subscription_status: createForm.subscription_status,
        assigned_program: (createForm.assigned_program as ProgramId) || null,
        active_programs: [],
        current_stage: null,
        portal_blocked: false,
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
    setCreateForm({ full_name: '', email: '', assigned_program: '', subscription_status: 'inactive' })
    setCreateResult(null)
    setCreateError('')
  }

  const filtered = rows.filter((m) => {
    const q = search.toLowerCase()
    const matchSearch = !q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.business_name ?? '').toLowerCase().includes(q)
    const matchStatus = !filterStatus || m.subscription_status === filterStatus
    return matchSearch && matchStatus
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

  return (
    <div className="space-y-4">
      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Create New User</h2>
              <button onClick={closeCreateModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {createResult ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-green-800 mb-1">Account created successfully!</p>
                  <p className="text-xs text-green-700">Share these credentials with the new member:</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">{createForm.email}</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs text-gray-500">Temporary Password</p>
                  <p className="text-sm font-mono font-semibold text-gray-900 select-all">{createResult.temp_password}</p>
                </div>
                <p className="text-xs text-amber-600">⚠ Copy this password now — it won&apos;t be shown again.</p>
                <button onClick={closeCreateModal} className="w-full text-sm px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-700">
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={createForm.full_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="John Smith"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Email *</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="john@example.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Program (optional)</label>
                  <select
                    value={createForm.assigned_program}
                    onChange={(e) => setCreateForm((f) => ({ ...f, assigned_program: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="">No program</option>
                    <option value="program_a">Program A — 0% Intro APR Advisory</option>
                    <option value="program_b">Program B — Business Credit Builder</option>
                    <option value="program_c">Program C — Capital Monitoring</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Subscription Status</label>
                  <select
                    value={createForm.subscription_status}
                    onChange={(e) => setCreateForm((f) => ({ ...f, subscription_status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {createError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{createError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={closeCreateModal} className="flex-1 text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
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
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400 self-center">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white transition-colors"
        >
          <Plus size={15} /> Create User
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Enrolled Programs</th>
              <th className="px-4 py-3 text-left">Stripe IDs</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((m) => (
              <tr key={m.id} className="bg-white hover:bg-gray-50 transition-colors">
                {/* Member info */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Link
                      href={`/admin/members/${m.id}`}
                      className="font-medium text-gray-900 hover:text-green-700 hover:underline"
                    >
                      {m.full_name}
                    </Link>
                    {m.is_demo && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full uppercase">
                        Demo
                      </span>
                    )}
                    {m.portal_blocked && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full uppercase">
                        Blocked
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs">{m.email}</div>
                  {m.business_name && <div className="text-gray-400 text-xs">{m.business_name}</div>}
                  <div className="text-gray-300 text-xs mt-0.5">Joined {new Date(m.created_at).toLocaleDateString()}</div>
                </td>

                {/* Status selector */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${statusColors[m.subscription_status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {m.subscription_status}
                    </span>
                    <select
                      value={m.subscription_status}
                      onChange={(e) => updateStatus(m.id, e.target.value as SubscriptionStatus)}
                      disabled={saving === m.id + '_status'}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </td>

                {/* Enrolled Programs */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    {m.active_programs.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {m.active_programs.map((code) => (
                          <span key={code} className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${PROGRAM_BADGE[code] ?? 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                            {PROGRAM_SHORT[code] ?? code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400">Not enrolled</span>
                    )}
                    {m.current_stage && (
                      <span className="text-[10px] text-gray-400 truncate max-w-[140px]">{m.current_stage}</span>
                    )}
                    <Link
                      href={`/admin/members/${m.id}`}
                      className="text-[10px] text-green-600 hover:text-green-700 font-medium underline underline-offset-2"
                    >
                      Manage →
                    </Link>
                  </div>
                </td>

                {/* Stripe IDs */}
                <td className="px-4 py-3 font-mono text-xs text-gray-500 space-y-1">
                  {m.stripe_customer_id ? (
                    <div title={m.stripe_customer_id} className="truncate max-w-[140px]">
                      <span className="text-gray-400">cus: </span>{m.stripe_customer_id}
                    </div>
                  ) : <div className="text-gray-300">No customer</div>}
                  {m.stripe_subscription_id ? (
                    <div title={m.stripe_subscription_id} className="truncate max-w-[140px]">
                      <span className="text-gray-400">sub: </span>{m.stripe_subscription_id}
                    </div>
                  ) : <div className="text-gray-300">No subscription</div>}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    {/* Quick Grant Access */}
                    {m.subscription_status !== 'active' && m.assigned_program && (
                      <button
                        onClick={() => grantAccess(m.id, m.assigned_program!)}
                        disabled={saving === m.id}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {saving === m.id ? 'Activating…' : 'Grant Active'}
                      </button>
                    )}
                    {m.subscription_status !== 'active' && !m.assigned_program && (
                      <div className="text-xs text-gray-400">Assign program first</div>
                    )}
                    {/* Cancel Stripe Sub */}
                    {m.stripe_subscription_id && m.subscription_status !== 'canceled' && (
                      <button
                        onClick={() => cancelSubscription(m.id, m.stripe_subscription_id)}
                        disabled={canceling === m.id}
                        className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg border border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {canceling === m.id ? 'Canceling…' : 'Cancel Stripe Sub'}
                      </button>
                    )}
                    {/* Already active badge */}
                    {m.subscription_status === 'active' && (
                      <span className="text-xs text-green-600 font-medium">✓ Active</span>
                    )}
                    {/* Resend Invite */}
                    <button
                      onClick={() => resendInvite(m.id)}
                      disabled={resendingInvite === m.id}
                      className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded-lg border border-blue-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {resendingInvite === m.id ? 'Sending…' : 'Resend Invite'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
