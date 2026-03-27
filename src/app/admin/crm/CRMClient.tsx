'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Search, LayoutGrid, List, Phone, Mail, Building2,
  Calendar, ChevronRight, X, Loader2, AlertCircle, Users,
  PhoneCall, TrendingUp, CheckCircle2, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CRMLead {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  business_name: string | null
  stage: Stage
  program_interest: 'program_a' | 'program_b' | 'program_c' | null
  source: string
  notes: string | null
  follow_up_at: string | null
  last_contacted_at: string | null
  do_not_call: boolean
  is_archived: boolean
  created_at: string
}

type Stage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'closed_won' | 'closed_lost'

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGES: { key: Stage; label: string; color: string; icon: React.ElementType }[] = [
  { key: 'new',           label: 'New',           color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',        icon: Users },
  { key: 'contacted',     label: 'Contacted',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',     icon: PhoneCall },
  { key: 'qualified',     label: 'Qualified',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: TrendingUp },
  { key: 'demo_scheduled',label: 'Demo Scheduled',color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: Calendar },
  { key: 'closed_won',    label: 'Closed Won',    color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle2 },
  { key: 'closed_lost',   label: 'Closed Lost',   color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',         icon: XCircle },
]

const SOURCES = ['manual','analyzer','affiliate','facebook','purchased','referral','inbound','other']
const PROGRAMS = [
  { value: 'program_a', label: 'Program A' },
  { value: 'program_b', label: 'Program B' },
  { value: 'program_c', label: 'Program C' },
]

const PROGRAM_BADGE: Record<string, string> = {
  program_a: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  program_b: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  program_c: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
}
const PROGRAM_LABEL: Record<string, string> = { program_a: 'Prog A', program_b: 'Prog B', program_c: 'Prog C' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stageInfo(key: Stage) {
  return STAGES.find(s => s.key === key) ?? STAGES[0]
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isPastDue(iso: string | null) {
  if (!iso) return false
  return new Date(iso) < new Date()
}

// ─── New Lead Form ─────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  first_name: '', last_name: '', phone: '', email: '',
  business_name: '', stage: 'new' as Stage,
  program_interest: '' as '' | 'program_a' | 'program_b' | 'program_c',
  source: 'manual', notes: '', follow_up_at: '',
}

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (lead: CRMLead) => void }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.phone.trim()) {
      toast.error('First name and phone are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          program_interest: form.program_interest || null,
          follow_up_at: form.follow_up_at || null,
          email: form.email || null,
          business_name: form.business_name || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to create lead'); return }
      toast.success('Lead created!')
      onCreated(json.lead)
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-gray-900">Add New Lead</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name *</label>
              <input className="input-field" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="John" />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input-field" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Smith" />
            </div>
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input-field" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input-field" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
          </div>
          <div>
            <label className="label">Business Name</label>
            <input className="input-field" value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="Acme LLC" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Stage</label>
              <select className="input-field" value={form.stage} onChange={e => set('stage', e.target.value as Stage)}>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Program Interest</label>
              <select className="input-field" value={form.program_interest} onChange={e => set('program_interest', e.target.value as typeof form.program_interest)}>
                <option value="">Unknown</option>
                {PROGRAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Source</label>
              <select className="input-field" value={form.source} onChange={e => set('source', e.target.value)}>
                {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Follow-up Date</label>
              <input className="input-field" type="datetime-local" value={form.follow_up_at} onChange={e => set('follow_up_at', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input-field min-h-[80px] resize-y" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes about this lead..." />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving...' : 'Create Lead'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Lead Card (Kanban) ────────────────────────────────────────────────────────
function LeadCard({ lead }: { lead: CRMLead }) {
  const pastDue = isPastDue(lead.follow_up_at)
  return (
    <Link
      href={`/admin/crm/${lead.id}`}
      className="block bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3.5 hover:shadow-md hover:border-green-200 dark:hover:border-green-700 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-sm text-gray-900 leading-snug">
          {lead.first_name} {lead.last_name}
        </p>
        <ChevronRight size={14} className="text-gray-300 group-hover:text-green-500 shrink-0 mt-0.5 transition-colors" />
      </div>
      {lead.business_name && (
        <p className="text-xs text-gray-500 flex items-center gap-1 mb-2">
          <Building2 size={11} /> {lead.business_name}
        </p>
      )}
      <p className="text-xs text-gray-500 flex items-center gap-1 mb-2.5">
        <Phone size={11} /> {lead.phone}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {lead.program_interest && (
          <span className={cn('badge text-[10px] px-2 py-0.5', PROGRAM_BADGE[lead.program_interest])}>
            {PROGRAM_LABEL[lead.program_interest]}
          </span>
        )}
        <span className="badge text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 capitalize">
          {lead.source}
        </span>
        {lead.follow_up_at && (
          <span className={cn('badge text-[10px] px-2 py-0.5 flex items-center gap-1', pastDue ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400')}>
            <Calendar size={9} /> {formatDate(lead.follow_up_at)}
          </span>
        )}
      </div>
    </Link>
  )
}

// ─── List Row ─────────────────────────────────────────────────────────────────
function LeadRow({ lead }: { lead: CRMLead }) {
  const info = stageInfo(lead.stage)
  const pastDue = isPastDue(lead.follow_up_at)
  return (
    <tr className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/admin/crm/${lead.id}`} className="font-semibold text-sm text-gray-900 hover:text-green-600 transition-colors">
          {lead.first_name} {lead.last_name}
        </Link>
        {lead.business_name && <p className="text-xs text-gray-400">{lead.business_name}</p>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{lead.phone}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{lead.email ?? '—'}</td>
      <td className="px-4 py-3">
        <span className={cn('badge text-xs px-2 py-1', info.color)}>{info.label}</span>
      </td>
      <td className="px-4 py-3">
        {lead.program_interest
          ? <span className={cn('badge text-xs px-2 py-1', PROGRAM_BADGE[lead.program_interest])}>{PROGRAM_LABEL[lead.program_interest]}</span>
          : <span className="text-gray-400 text-xs">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 capitalize">{lead.source}</td>
      <td className="px-4 py-3 text-xs">
        {lead.follow_up_at
          ? <span className={pastDue ? 'text-red-500 font-medium' : 'text-gray-500'}>{formatDate(lead.follow_up_at)}</span>
          : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3">
        <Link href={`/admin/crm/${lead.id}`} className="text-xs text-green-600 hover:underline font-medium">View</Link>
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CRMClient() {
  const [leads, setLeads]       = useState<CRMLead[]>([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState<'kanban' | 'list'>('kanban')
  const [search, setSearch]     = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showNew, setShowNew]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (stageFilter) params.set('stage', stageFilter)
      if (search)       params.set('search', search)
      const res  = await fetch(`/api/admin/crm/leads?${params}`)
      const json = await res.json()
      setLeads(json.leads ?? [])
    } catch {
      toast.error('Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [stageFilter, search])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  function handleCreated(lead: CRMLead) {
    setLeads(p => [lead, ...p])
    setShowNew(false)
  }

  // Stats
  const total     = leads.length
  const followDue = leads.filter(l => isPastDue(l.follow_up_at)).length
  const wonCount  = leads.filter(l => l.stage === 'closed_won').length

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pre-portal leads pipeline</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary gap-2">
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Leads', value: total, icon: Users, color: 'text-blue-600' },
          { label: 'Follow-ups Due', value: followDue, icon: AlertCircle, color: followDue > 0 ? 'text-red-500' : 'text-gray-400' },
          { label: 'Closed Won', value: wonCount, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'In Pipeline', value: leads.filter(l => !['closed_won','closed_lost'].includes(l.stage)).length, icon: TrendingUp, color: 'text-amber-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3">
            <Icon size={20} className={color} />
            <div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + view toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field pl-8 text-sm"
            placeholder="Search leads..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field text-sm w-44" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ml-auto">
          <button
            onClick={() => setView('kanban')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'kanban' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600')}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setView('list')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600')}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading leads...
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Users size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search || stageFilter ? 'No leads match your filters.' : 'No leads yet. Add your first lead to get started.'}</p>
        </div>
      ) : view === 'kanban' ? (
        // Kanban
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {STAGES.map(stage => {
            const col = leads.filter(l => l.stage === stage.key)
            const Icon = stage.icon
            return (
              <div key={stage.key} className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Icon size={13} className="text-gray-400" />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{stage.label}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">{col.length}</span>
                </div>
                {col.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl h-20 flex items-center justify-center">
                    <span className="text-xs text-gray-300">Empty</span>
                  </div>
                ) : (
                  col.map(lead => <LeadCard key={lead.id} lead={lead} />)
                )}
              </div>
            )
          })}
        </div>
      ) : (
        // List
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  {['Name','Phone','Email','Stage','Program','Source','Follow-up',''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => <LeadRow key={lead.id} lead={lead} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && <NewLeadModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </div>
  )
}
