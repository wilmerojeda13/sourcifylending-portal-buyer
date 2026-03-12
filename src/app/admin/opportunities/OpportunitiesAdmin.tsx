'use client'

import { useState } from 'react'
import type { AccountOpportunity, OpportunityCategory, OpportunityPG } from '@/types'
import { Plus, Edit2, EyeOff, Eye, Trash2, X, Save } from 'lucide-react'

interface Props {
  initialOpportunities: AccountOpportunity[]
}

const PROGRAMS = [
  { value: 'program_a', label: 'Program A' },
  { value: 'program_b', label: 'Program B' },
  { value: 'program_c', label: 'Program C' },
  { value: 'all', label: 'All Programs' },
]

const STAGES = [
  // Program A
  'Credit Readiness', 'Application Strategy', 'Card Acquisition', 'Optimization',
  // Program B
  'Foundation', 'Store Credit', 'Fleet & Gas', 'Cash & Revolving',
  // Program C
  'Monthly Review',
]

const CATEGORIES: OpportunityCategory[] = ['funding', 'vendor', 'store', 'fleet', 'cash', 'monitoring']

const PG_OPTIONS: OpportunityPG[] = ['yes', 'no', 'varies']

const PROGRAM_LABELS: Record<string, string> = {
  program_a: 'A', program_b: 'B', program_c: 'C', all: 'All',
}

const CATEGORY_COLORS: Record<OpportunityCategory, string> = {
  funding: 'bg-blue-100 text-blue-700',
  vendor: 'bg-purple-100 text-purple-700',
  store: 'bg-orange-100 text-orange-700',
  fleet: 'bg-yellow-100 text-yellow-700',
  cash: 'bg-green-100 text-green-700',
  monitoring: 'bg-gray-100 text-gray-600',
}

const EMPTY_FORM = {
  name: '',
  program: 'program_a',
  stage: 'Card Acquisition',
  category: 'funding' as OpportunityCategory,
  reports_to: '',
  terms: '',
  pg_required: 'yes' as OpportunityPG,
  description: '',
  learn_more_url: '',
  apply_url: '',
  priority_score: 50,
  is_active: true,
  notes: '',
}

export default function OpportunitiesAdmin({ initialOpportunities }: Props) {
  const [rows, setRows] = useState(initialOpportunities)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AccountOpportunity | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterProgram, setFilterProgram] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

  const filtered = rows.filter((r) => {
    if (filterProgram && r.program !== filterProgram) return false
    if (filterActive === 'active' && !r.is_active) return false
    if (filterActive === 'inactive' && r.is_active) return false
    return true
  })

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(opp: AccountOpportunity) {
    setEditing(opp)
    setForm({
      name: opp.name,
      program: opp.program,
      stage: opp.stage,
      category: opp.category,
      reports_to: opp.reports_to ?? '',
      terms: opp.terms ?? '',
      pg_required: opp.pg_required,
      description: opp.description ?? '',
      learn_more_url: opp.learn_more_url ?? '',
      apply_url: opp.apply_url ?? '',
      priority_score: opp.priority_score,
      is_active: opp.is_active,
      notes: opp.notes ?? '',
    })
    setShowForm(true)
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        ...form,
        reports_to: form.reports_to || null,
        terms: form.terms || null,
        description: form.description || null,
        learn_more_url: form.learn_more_url || null,
        apply_url: form.apply_url || null,
        notes: form.notes || null,
      }

      if (editing) {
        const res = await fetch('/api/admin/opportunities', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
        if (!res.ok) throw new Error('Failed')
        const { opportunity } = await res.json()
        setRows((prev) => prev.map((r) => r.id === editing.id ? opportunity : r))
      } else {
        const res = await fetch('/api/admin/opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed')
        const { opportunity } = await res.json()
        setRows((prev) => [opportunity, ...prev])
      }

      setShowForm(false)
    } catch {
      alert('Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(opp: AccountOpportunity) {
    try {
      const res = await fetch('/api/admin/opportunities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: opp.id, is_active: !opp.is_active }),
      })
      if (!res.ok) throw new Error('Failed')
      const { opportunity } = await res.json()
      setRows((prev) => prev.map((r) => r.id === opp.id ? opportunity : r))
    } catch {
      alert('Update failed')
    }
  }

  async function deleteOpp(opp: AccountOpportunity) {
    if (!confirm(`Delete "${opp.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/opportunities?id=${opp.id}&hard=true`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setRows((prev) => prev.filter((r) => r.id !== opp.id))
    } catch {
      alert('Delete failed')
    }
  }

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked
        : e.target.type === 'number' ? Number(e.target.value)
        : e.target.value
      setForm((prev) => ({ ...prev, [key]: val }))
    }
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterProgram}
          onChange={(e) => setFilterProgram(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">All Programs</option>
          {PROGRAMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="all">All</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <span className="text-sm text-gray-400">{filtered.length} records</span>
        <div className="ml-auto">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={16} />
            Add Opportunity
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Program / Stage</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">PG</th>
              <th className="px-4 py-3 text-left">Priority</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((opp) => (
              <tr key={opp.id} className={`bg-white hover:bg-gray-50 transition-colors ${!opp.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 text-sm">{opp.name}</p>
                  {opp.terms && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{opp.terms}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="font-bold text-gray-700 text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                    {PROGRAM_LABELS[opp.program] ?? opp.program}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">{opp.stage}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[opp.category]}`}>
                    {opp.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 capitalize">{opp.pg_required}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{opp.priority_score}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    opp.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {opp.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEdit(opp)}
                      title="Edit"
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => toggleActive(opp)}
                      title={opp.is_active ? 'Disable' : 'Enable'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        opp.is_active
                          ? 'text-gray-500 hover:bg-amber-50 hover:text-amber-600'
                          : 'text-gray-400 hover:bg-green-50 hover:text-green-600'
                      }`}
                    >
                      {opp.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => deleteOpp(opp)}
                      title="Delete"
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No opportunities found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? 'Edit Opportunity' : 'New Opportunity'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              {/* Row 1 */}
              <div>
                <label className="form-label">Name *</label>
                <input value={form.name} onChange={f('name')} className="form-input" placeholder="e.g. Capital One Spark Cash Select" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Program *</label>
                  <select value={form.program} onChange={f('program')} className="form-input">
                    {PROGRAMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Stage *</label>
                  <select value={form.stage} onChange={f('stage')} className="form-input">
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Category *</label>
                  <select value={form.category} onChange={f('category')} className="form-input">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">PG Required *</label>
                  <select value={form.pg_required} onChange={f('pg_required')} className="form-input">
                    {PG_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Priority Score (0–100)</label>
                  <input type="number" min={0} max={100} value={form.priority_score} onChange={f('priority_score')} className="form-input" />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={f('is_active')}
                    className="w-4 h-4 rounded accent-green-600"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Active (visible to members)</label>
                </div>
              </div>

              <div>
                <label className="form-label">Terms</label>
                <input value={form.terms} onChange={f('terms')} className="form-input" placeholder="e.g. Net-30 · No annual fee · 0% intro APR" />
              </div>

              <div>
                <label className="form-label">Reports To (bureaus)</label>
                <input value={form.reports_to} onChange={f('reports_to')} className="form-input" placeholder="e.g. D&B, Equifax Business, Experian Business" />
              </div>

              <div>
                <label className="form-label">Description</label>
                <textarea value={form.description} onChange={f('description')} rows={4} className="form-input resize-none" placeholder="Educational description shown to members..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Learn More URL</label>
                  <input value={form.learn_more_url} onChange={f('learn_more_url')} className="form-input" placeholder="https://..." />
                </div>
                <div>
                  <label className="form-label">Apply URL</label>
                  <input value={form.apply_url} onChange={f('apply_url')} className="form-input" placeholder="https://..." />
                </div>
              </div>

              <div>
                <label className="form-label">Admin Notes (internal only)</label>
                <input value={form.notes} onChange={f('notes')} className="form-input" placeholder="Internal notes not shown to members" />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-600 border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                <Save size={15} />
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
