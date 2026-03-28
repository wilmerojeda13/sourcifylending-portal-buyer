'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Save, ExternalLink, Trash2, UserPlus, X, Loader2 } from 'lucide-react'
import { getProgramShortLabel } from '@/lib/utils'

interface ClientRow {
  id: string
  full_name: string
  email: string
  business_name: string | null
  subscription_status: string
  assigned_program: string | null
  current_stage: string | null
  progress: number
  last_activity: string | null
  funding_total: number
  health_status: 'good' | 'needs_attention' | 'at_risk'
  portal_blocked: boolean
  is_demo: boolean
  created_at: string
}

interface AssignmentRow {
  client_user_id: string
  assigned_to_name: string | null
  support_notes: string | null
}

interface Props {
  clients: ClientRow[]
  assignments: AssignmentRow[]
}

function formatCurrency(n: number): string {
  if (n === 0) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  if (days >= 7) return `${days}+ days`
  return `${days}d ago`
}

const HEALTH_CONFIG = {
  good:             { label: 'Good',             dot: 'bg-green-500', badge: 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40' },
  needs_attention:  { label: 'Needs Attention',  dot: 'bg-amber-400', badge: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40' },
  at_risk:          { label: 'At Risk',           dot: 'bg-red-500',   badge: 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40' },
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  trialing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  past_due: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  canceled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  inactive: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

function SupportCell({
  client,
  assignment,
  onSave,
}: {
  client: ClientRow
  assignment: AssignmentRow | undefined
  onSave: (clientId: string, name: string, notes: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(assignment?.assigned_to_name ?? '')
  const [notes, setNotes] = useState(assignment?.support_notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(client.id, name, notes)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-left w-full">
        {assignment?.assigned_to_name ? (
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate block max-w-[120px]">
            {assignment.assigned_to_name}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic">Unassigned</span>
        )}
        <span className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline">Edit</span>
      </button>
    )
  }

  return (
    <div className="space-y-1.5 min-w-[180px]">
      <input
        type="text"
        placeholder="Assigned to..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
      />
      <textarea
        placeholder="Notes..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full resize-none"
      />
      <div className="flex gap-1.5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1"
        >
          <Save size={11} />
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ClientTableRow({
  client,
  assignment,
  onSaveAssignment,
  onDelete,
}: {
  client: ClientRow
  assignment: AssignmentRow | undefined
  onSaveAssignment: (clientId: string, name: string, notes: string) => Promise<void>
  onDelete: (clientId: string, name: string) => void
}) {
  const health = HEALTH_CONFIG[client.health_status]

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      {/* Name / Email */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
              {(client.full_name || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[160px]">
              {client.full_name || 'Unknown'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[160px]">{client.email}</p>
            {client.business_name && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">{client.business_name}</p>
            )}
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${STATUS_COLORS[client.subscription_status] ?? 'bg-gray-100 text-gray-500'}`}>
                {client.subscription_status}
              </span>
              {client.portal_blocked && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-red-100 text-red-600">Blocked</span>
              )}
              {client.is_demo && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-purple-100 text-purple-600">Demo</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Health */}
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${health.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
          {health.label}
        </span>
      </td>

      {/* Program / Stage */}
      <td className="px-4 py-3">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {client.assigned_program ? getProgramShortLabel(client.assigned_program) : '—'}
        </p>
        {client.current_stage && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{client.current_stage}</p>
        )}
      </td>

      {/* Progress */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full min-w-[60px]">
            <div
              className="h-1.5 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(client.progress, 100)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 shrink-0">{client.progress}%</span>
        </div>
      </td>

      {/* Last Activity */}
      <td className="px-4 py-3">
        <span className={`text-xs ${
          client.last_activity && (Date.now() - new Date(client.last_activity).getTime()) < 86400000
            ? 'text-green-600 font-medium'
            : 'text-gray-500'
        }`}>
          {relativeTime(client.last_activity)}
        </span>
      </td>

      {/* Funding */}
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold ${client.funding_total > 0 ? 'text-green-700' : 'text-gray-400'}`}>
          {formatCurrency(client.funding_total)}
        </span>
      </td>

      {/* Support */}
      <td className="px-4 py-3">
        <SupportCell
          client={client}
          assignment={assignment}
          onSave={onSaveAssignment}
        />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/admin/members/${client.id}`}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            View Profile
          </Link>
          <a
            href={`/admin/client-view/${client.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <ExternalLink size={11} />
            Portal
          </a>
          <button
            onClick={() => onDelete(client.id, client.full_name || client.email)}
            className="text-xs border border-red-200 hover:bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
            title="Delete member"
          >
            <Trash2 size={11} />
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Create Member Modal ──────────────────────────────────────────────────────
function CreateMemberModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (member: ClientRow) => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [program, setProgram] = useState('')
  const [accountState, setAccountState] = useState('prospect')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          assigned_program: program || null,
          account_state: accountState,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create member'); return }
      onCreate(data.member)
      onClose()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UserPlus size={18} className="text-green-600" />
            Create New Member
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              required
              className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Program</label>
              <select
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">None</option>
                <option value="program_a">Program A</option>
                <option value="program_b">Program B</option>
                <option value="program_c">Program C</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Account Type</label>
              <select
                value={accountState}
                onChange={(e) => setAccountState(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="prospect">Prospect</option>
                <option value="active_member">Active Member</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-700 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              {loading ? 'Creating…' : 'Create Member'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteConfirmModal({ name, onConfirm, onCancel, loading }: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 border border-gray-200 dark:border-gray-700">
        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-600 dark:text-red-400" />
        </div>
        <h2 className="font-bold text-gray-900 dark:text-white text-center text-lg mb-2">Delete Member?</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 leading-relaxed">
          This will permanently delete <strong className="text-gray-800 dark:text-gray-200">{name}</strong> and all their data. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {loading ? 'Deleting…' : 'Yes, Delete'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors py-2.5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Table ───────────────────────────────────────────────────────────────
export default function ClientManagementTable({ clients, assignments }: Props) {
  const [clientsList, setClientsList] = useState<ClientRow[]>(clients)
  const [search, setSearch] = useState('')
  const [filterHealth, setFilterHealth] = useState<'' | 'good' | 'needs_attention' | 'at_risk'>('')
  const [filterProgram, setFilterProgram] = useState('')
  const [assignmentState, setAssignmentState] = useState<Map<string, AssignmentRow>>(
    () => new Map(assignments.map((a) => [a.client_user_id, a]))
  )
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const saveAssignment = useCallback(async (clientId: string, name: string, notes: string) => {
    const res = await fetch('/api/admin/support-assignment', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_user_id: clientId, assigned_to_name: name || null, support_notes: notes || null }),
    })
    if (!res.ok) throw new Error('Failed to save assignment')
    const { assignment } = await res.json()
    setAssignmentState((prev) => {
      const next = new Map(prev)
      next.set(clientId, {
        client_user_id: assignment.client_user_id,
        assigned_to_name: assignment.assigned_to_name ?? null,
        support_notes: assignment.support_notes ?? null,
      })
      return next
    })
  }, [])

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: deleteTarget.id }),
      })
      if (res.ok) {
        setClientsList((prev) => prev.filter((c) => c.id !== deleteTarget.id))
        setDeleteTarget(null)
      }
    } finally {
      setDeleting(false)
    }
  }

  const programs = Array.from(new Set(clientsList.map((c) => c.assigned_program).filter(Boolean))) as string[]

  const filtered = clientsList.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      c.full_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.business_name ?? '').toLowerCase().includes(q)
    const matchHealth = !filterHealth || c.health_status === filterHealth
    const matchProgram = !filterProgram || c.assigned_program === filterProgram
    return matchSearch && matchHealth && matchProgram
  })

  const atRiskAndAttention = filtered.filter(
    (c) => c.health_status === 'at_risk' || c.health_status === 'needs_attention'
  )

  return (
    <>
      {showCreateModal && (
        <CreateMemberModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(member) => setClientsList((prev) => [member, ...prev])}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      <div className="space-y-6">
        {/* Clients Needing Attention */}
        {atRiskAndAttention.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-amber-200 dark:border-amber-700 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Clients Needing Attention
              <span className="text-xs font-medium text-gray-400 ml-1">({atRiskAndAttention.length})</span>
            </h2>
            <div className="space-y-2">
              {atRiskAndAttention.map((c) => {
                const health = HEALTH_CONFIG[c.health_status]
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${health.dot}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate block">{c.full_name || 'Unknown'}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate block">{c.email}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${health.badge}`}>{health.label}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{relativeTime(c.last_activity)}</span>
                    <Link href={`/admin/members/${c.id}`} className="text-xs text-green-600 hover:underline shrink-0">View →</Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Full Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Filters + Create Button */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, email, or business..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-lg pl-8 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
            <select
              value={filterHealth}
              onChange={(e) => setFilterHealth(e.target.value as typeof filterHealth)}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Health</option>
              <option value="good">Good</option>
              <option value="needs_attention">Needs Attention</option>
              <option value="at_risk">At Risk</option>
            </select>
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Programs</option>
              {programs.map((p) => (
                <option key={p} value={p}>{getProgramShortLabel(p)}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="ml-auto flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              <UserPlus size={14} />
              New Member
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name / Email</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Health</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Program / Stage</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Progress</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Activity</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Funding</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Support</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <ClientTableRow
                    key={client.id}
                    client={client}
                    assignment={assignmentState.get(client.id)}
                    onSaveAssignment={saveAssignment}
                    onDelete={(id, name) => setDeleteTarget({ id, name })}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                      No clients match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
