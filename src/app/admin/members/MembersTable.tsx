'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ProgramId, SubscriptionStatus } from '@/types'
import { getProgramShortLabel } from '@/lib/utils'

interface MemberRow {
  id: string
  full_name: string
  email: string
  business_name: string | null
  subscription_status: string
  assigned_program: ProgramId | null
  current_stage: string | null
  portal_blocked: boolean
  is_demo: boolean
  created_at: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  stripe_status: string | null
  current_period_end: string | null
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
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const filtered = rows.filter((m) => {
    const q = search.toLowerCase()
    const matchSearch = !q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.business_name ?? '').toLowerCase().includes(q)
    const matchStatus = !filterStatus || m.subscription_status === filterStatus
    return matchSearch && matchStatus
  })

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
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Primary Program / Stage</th>
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

                {/* Primary Program / Stage */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {m.assigned_program ? (
                        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit ${
                          m.assigned_program === 'program_a' ? 'bg-blue-100 text-blue-700' :
                          m.assigned_program === 'program_b' ? 'bg-purple-100 text-purple-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {getProgramShortLabel(m.assigned_program)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400">No program</span>
                      )}
                      {/* Multi-program indicator — shown when member has more than 1 program */}
                      {m.assigned_program && (
                        <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full" title="May have additional programs — see Billing tab">
                          +more?
                        </span>
                      )}
                    </div>
                    {m.current_stage && (
                      <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{m.current_stage}</span>
                    )}
                    <Link
                      href={`/admin/members/${m.id}`}
                      className="text-[10px] text-green-600 hover:text-green-700 font-medium underline underline-offset-2"
                    >
                      Manage programs →
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
