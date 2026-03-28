'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Phone, Building2, Calendar, ChevronLeft, ChevronRight,
  X, Loader2, AlertCircle, Users, PhoneCall, TrendingUp,
  CheckCircle2, XCircle, Upload, Zap, Filter, RefreshCw,
  LayoutList, Columns, Trash2, Bot,
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

type Stage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'demo_held' | 'follow_up' | 'closed_won' | 'closed_lost' | 'active_client'

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGES: { key: Stage; label: string; color: string; dot: string; icon: React.ElementType }[] = [
  { key: 'new',            label: 'New',            color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',           dot: 'bg-gray-400',   icon: Users },
  { key: 'contacted',      label: 'Contacted',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',        dot: 'bg-blue-500',   icon: PhoneCall },
  { key: 'qualified',      label: 'Qualified',      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',    dot: 'bg-amber-500',  icon: TrendingUp },
  { key: 'demo_scheduled', label: 'Demo Scheduled', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',dot: 'bg-purple-500', icon: Calendar },
  { key: 'demo_held',      label: 'Demo Held',      color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',  dot: 'bg-indigo-500',  icon: CheckCircle2 },
  { key: 'follow_up',      label: 'Follow Up',      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',  dot: 'bg-orange-500',  icon: PhoneCall },
  { key: 'active_client',  label: 'Active Client',  color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',         dot: 'bg-teal-500',    icon: CheckCircle2 },
  { key: 'closed_won',     label: 'Closed Won',     color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',      dot: 'bg-green-500',   icon: CheckCircle2 },
  { key: 'closed_lost',    label: 'Closed Lost',    color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',            dot: 'bg-red-400',    icon: XCircle },
]

const PROGRAM_BADGE: Record<string, string> = {
  program_a: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  program_b: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  program_c: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
}
const PROGRAM_LABEL: Record<string, string> = { program_a: 'Prog A', program_b: 'Prog B', program_c: 'Prog C' }

const BOARD_CAP = 40

function stageInfo(key: Stage) { return STAGES.find(s => s.key === key) ?? STAGES[0] }
function isPastDue(iso: string | null) { return !!iso && new Date(iso) < new Date() }
function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── New Lead Modal ───────────────────────────────────────────────────────────
const EMPTY = { first_name:'', last_name:'', phone:'', email:'', business_name:'', stage:'new' as Stage, program_interest:'' as ''|'program_a'|'program_b'|'program_c', source:'manual', notes:'', follow_up_at:'' }

function NewLeadModal({ onClose, onCreated }: { onClose:()=>void; onCreated:(l:CRMLead)=>void }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  function set<K extends keyof typeof form>(k:K,v:typeof form[K]){ setForm(p=>({...p,[k]:v})) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.phone.trim()) { toast.error('First name and phone required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/crm/leads', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, program_interest: form.program_interest||null, follow_up_at: form.follow_up_at||null, email: form.email||null, business_name: form.business_name||null }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed'); return }
      toast.success('Lead created!')
      onCreated(json.lead)
    } catch { toast.error('Network error') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="font-bold text-gray-900">Add New Lead</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X size={16}/></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">First Name *</label><input className="input-field" value={form.first_name} onChange={e=>set('first_name',e.target.value)} placeholder="John"/></div>
            <div><label className="label">Last Name</label><input className="input-field" value={form.last_name} onChange={e=>set('last_name',e.target.value)} placeholder="Smith"/></div>
          </div>
          <div><label className="label">Phone *</label><input className="input-field" type="tel" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+1 (555) 000-0000"/></div>
          <div><label className="label">Email</label><input className="input-field" type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="john@example.com"/></div>
          <div><label className="label">Business Name</label><input className="input-field" value={form.business_name} onChange={e=>set('business_name',e.target.value)} placeholder="Acme LLC"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Stage</label><select className="input-field" value={form.stage} onChange={e=>set('stage',e.target.value as Stage)}>{STAGES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
            <div><label className="label">Program</label><select className="input-field" value={form.program_interest} onChange={e=>set('program_interest',e.target.value as typeof form.program_interest)}><option value="">Unknown</option><option value="program_a">Program A</option><option value="program_b">Program B</option><option value="program_c">Program C</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Source</label><select className="input-field" value={form.source} onChange={e=>set('source',e.target.value)}>{['manual','analyzer','affiliate','facebook','purchased','referral','inbound','other'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></div>
            <div><label className="label">Follow-up</label><input className="input-field" type="datetime-local" value={form.follow_up_at} onChange={e=>set('follow_up_at',e.target.value)}/></div>
          </div>
          <div><label className="label">Notes</label><textarea className="input-field min-h-[72px] resize-none" value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Any notes..."/></div>
          <div className="flex gap-3 pt-1 pb-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 h-12 flex items-center justify-center gap-2 text-base">
              {saving && <Loader2 size={15} className="animate-spin"/>}{saving ? 'Saving...' : 'Create Lead'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5 h-12">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Cleanup Modal ────────────────────────────────────────────────────────────
function CleanupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [running, setRunning] = useState<string | null>(null)

  async function runAction(action: string, filter?: string) {
    if (action === 'delete_archived') {
      const ok = window.confirm('Permanently delete ALL archived leads? This cannot be undone.')
      if (!ok) return
    }
    setRunning(action + (filter ?? ''))
    try {
      const body: Record<string, string> = { action }
      if (filter) body.filter = filter
      const res = await fetch('/api/admin/crm/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(`${json.count} ${json.message}`)
        onDone()
      } else {
        toast.error(json.error ?? 'Failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setRunning(null)
    }
  }

  const actions = [
    {
      id: 'archive_closed_lost',
      label: 'Archive Closed Lost',
      desc: 'leads marked closed_lost',
      action: 'archive',
      filter: 'closed_lost',
      red: false,
    },
    {
      id: 'archive_dnc',
      label: 'Archive DNC Leads',
      desc: 'do not call leads',
      action: 'archive',
      filter: 'dnc',
      red: false,
    },
    {
      id: 'delete_archived',
      label: 'Delete Archived',
      desc: 'permanently remove all archived leads',
      action: 'delete_archived',
      filter: undefined,
      red: true,
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Quick Lead Cleanup</h2>
            <p className="text-xs text-gray-500 mt-0.5">Archive leads you no longer need to contact</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X size={16}/>
          </button>
        </div>
        <div className="p-5 space-y-3">
          {actions.map(a => {
            const isRunning = running === a.action + (a.filter ?? '')
            return (
              <button
                key={a.id}
                onClick={() => runAction(a.action, a.filter)}
                disabled={!!running}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-colors text-left disabled:opacity-60',
                  a.red
                    ? 'border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200'
                )}
              >
                <div>
                  <p className="font-semibold text-sm">{a.label}</p>
                  <p className={cn('text-xs mt-0.5', a.red ? 'text-red-400' : 'text-gray-400')}>{a.desc}</p>
                </div>
                {isRunning && <Loader2 size={16} className="animate-spin shrink-0"/>}
              </button>
            )
          })}
        </div>
        <div className="px-5 pb-5">
          <p className="text-xs text-gray-400 text-center">Archived leads are hidden from the CRM but not deleted unless you choose Delete Archived.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Lead Card (mobile-first) ─────────────────────────────────────────────────
function LeadCard({ lead }: { lead: CRMLead }) {
  const stage = stageInfo(lead.stage)
  const pastDue = isPastDue(lead.follow_up_at)
  return (
    <Link href={`/admin/crm/${lead.id}`} className="block bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 active:scale-[0.99] transition-all hover:shadow-md hover:border-green-200 dark:hover:border-green-700 group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn('w-2 h-2 rounded-full shrink-0', stage.dot)}/>
            <p className="font-semibold text-sm text-gray-900 truncate">{lead.first_name} {lead.last_name}</p>
          </div>
          {lead.business_name && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mb-1 ml-4">
              <Building2 size={10}/> {lead.business_name}
            </p>
          )}
          <a
            href={`tel:${lead.phone}`}
            onClick={e => e.stopPropagation()}
            className="text-sm font-medium text-green-600 flex items-center gap-1.5 ml-4 hover:text-green-700"
          >
            <Phone size={13}/> {lead.phone}
          </a>
        </div>
        <ChevronRight size={16} className="text-gray-300 group-hover:text-green-500 shrink-0 mt-1 transition-colors"/>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-3">
        <span className={cn('badge text-[10px] px-2 py-0.5', stage.color)}>{stage.label}</span>
        {lead.program_interest && (
          <span className={cn('badge text-[10px] px-2 py-0.5', PROGRAM_BADGE[lead.program_interest])}>{PROGRAM_LABEL[lead.program_interest]}</span>
        )}
        {lead.follow_up_at && (
          <span className={cn('badge text-[10px] px-2 py-0.5 flex items-center gap-1', pastDue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')}>
            <Calendar size={9}/> {formatDate(lead.follow_up_at)}{pastDue && ' ⚠'}
          </span>
        )}
        {lead.do_not_call && <span className="badge text-[10px] px-2 py-0.5 bg-red-100 text-red-600">DNC</span>}
      </div>
    </Link>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CRMClient() {
  const [leads, setLeads]           = useState<CRMLead[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showNew, setShowNew]       = useState(false)
  const [showCleanup, setShowCleanup] = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [view, setView]             = useState<'list' | 'board'>('list')
  const [listPage, setListPage]     = useState(1)

  // Reset list page whenever leads change
  useEffect(() => setListPage(1), [leads])

  async function syncNotion() {
    setSyncing(true)
    try {
      const res  = await fetch('/api/admin/crm/sync/notion', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Sync failed'); return }
      toast.success(json.message)
      load()
    } catch { toast.error('Sync failed') }
    finally { setSyncing(false) }
  }
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '1000' })
      // In board view always load all stages — columns ARE the stages
      if (stageFilter && view !== 'board') p.set('stage', stageFilter)
      if (search) p.set('search', search)

      // Paginate through all records
      let allLeads: CRMLead[] = []
      let page = 0
      let total = Infinity

      while (allLeads.length < total) {
        p.set('page', String(page))
        const res  = await fetch(`/api/admin/crm/leads?${p}`)
        const json = await res.json()
        const batch: CRMLead[] = json.leads ?? []
        total = json.total ?? batch.length
        allLeads = [...allLeads, ...batch]
        if (batch.length < 1000) break
        page++
      }

      setLeads(allLeads)
    } catch { toast.error('Failed to load leads') }
    finally { setLoading(false) }
  }, [stageFilter, search, view])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  function handleCreated(lead: CRMLead) { setLeads(p=>[lead,...p]); setShowNew(false) }

  const total     = leads.length
  const followDue = leads.filter(l => isPastDue(l.follow_up_at)).length
  const wonCount  = leads.filter(l => l.stage === 'closed_won').length
  const activeCount = leads.filter(l => l.stage === 'active_client').length
  const inPipeline = leads.filter(l => !['closed_won','closed_lost','active_client'].includes(l.stage)).length

  // Paginated list
  const visibleLeads = leads.slice(0, listPage * 100)
  const hasMore = leads.length > listPage * 100

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <Link href="/admin" className="text-xs text-gray-400 hover:text-green-600 font-medium mb-0.5 inline-flex items-center gap-1">
                <ChevronLeft size={13}/> Admin Portal
              </Link>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sales CRM</h1>
              <p className="text-xs text-gray-500">{total.toLocaleString()} leads</p>
            </div>
            <div className="flex items-center gap-2">

              <Link
                href="/admin/crm/campaign"
                target="_blank"
                className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
              >
                <Bot size={13}/> AI Campaign
              </Link>
              <button
                onClick={() => setShowCleanup(true)}
                className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
              >
                <Trash2 size={13}/> Cleanup
              </button>
              <Link href="/admin/crm/import" className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5">
                <Upload size={13}/> Import
              </Link>
              <button onClick={()=>setShowNew(true)} className="btn-primary h-9 px-4 flex items-center gap-1.5 text-sm">
                <Plus size={15}/> Add Lead
              </button>
            </div>
          </div>

          {/* Search + filter row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                className="input-field pl-8 h-10 text-sm"
                placeholder="Search leads..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* View toggle */}
            <div className="hidden sm:flex items-center rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
              <button
                onClick={() => setView('list')}
                className={cn('h-10 px-3 flex items-center gap-1.5 text-xs font-medium transition-colors',
                  view === 'list' ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
                )}
              ><LayoutList size={14}/> List</button>
              <button
                onClick={() => { setView('board'); setStageFilter('') }}
                className={cn('h-10 px-3 flex items-center gap-1.5 text-xs font-medium transition-colors border-l border-gray-200 dark:border-gray-700',
                  view === 'board' ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
                )}
              ><Columns size={14}/> Board</button>
            </div>
            {/* Filter toggle — mobile only */}
            <button
              onClick={() => setShowFilters(p => !p)}
              className={cn('h-10 w-10 flex items-center justify-center rounded-xl border transition-colors shrink-0 sm:hidden',
                showFilters || stageFilter
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
              )}
            >
              <Filter size={15}/>
            </button>
          </div>

          {/* Stage filter tabs — always on desktop, collapsible on mobile */}
          <div className={cn('flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-none', view === 'board' ? 'hidden' : showFilters ? 'flex' : 'hidden sm:flex')}>
            {[{key:'',label:'All'},...STAGES.map(s=>({key:s.key,label:s.label}))].map(s=>(
              <button
                key={s.key}
                onClick={() => { setStageFilter(s.key); setShowFilters(false) }}
                className={cn(
                  'shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
                  stageFilter === s.key
                    ? 'bg-green-600 border-green-600 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={cn(
        'pt-4 pb-24',
        view === 'list' ? 'max-w-screen-xl mx-auto px-4 lg:flex lg:gap-6 lg:items-start' : 'px-4'
      )}>

        {/* ── Lead list (main column) ── */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* Stats strip — desktop inline row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total',    value: total,       color: 'text-gray-900 dark:text-white' },
              { label: 'Due',      value: followDue,   color: followDue > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white' },
              { label: 'Active',   value: activeCount, color: 'text-teal-500' },
              { label: 'Won',      value: wonCount,    color: 'text-green-600' },
              { label: 'Pipeline', value: inPipeline,  color: 'text-amber-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-3 py-3 text-center">
                <p className={cn('text-xl font-bold', color)}>{value.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Dialer CTA — mobile only (desktop shows in sidebar) */}
          <div className="mb-4 lg:hidden">
            <Link
              href="/admin/crm/dialer"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-2xl px-4 py-3.5 text-white transition-colors"
            >
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Zap size={18}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Dialer Mode</p>
                <p className="text-green-200 text-xs">Dial through {inPipeline.toLocaleString()} pipeline leads fast</p>
              </div>
              <ChevronRight size={18} className="text-green-300"/>
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={22} className="animate-spin mr-2"/> Loading...
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users size={36} className="mx-auto mb-3 opacity-30"/>
              <p className="text-sm">{search || stageFilter ? 'No leads match your filters.' : 'No leads yet. Click + Add Lead to get started.'}</p>
            </div>
          ) : view === 'list' ? (
            <div className="space-y-2.5">
              {visibleLeads.map(lead => <LeadCard key={lead.id} lead={lead}/>)}
              {hasMore && (
                <button
                  onClick={() => setListPage(p => p + 1)}
                  className="w-full py-3 text-sm text-gray-500 hover:text-green-600 font-medium border border-gray-200 dark:border-gray-700 rounded-2xl mt-2 transition-colors"
                >
                  Load {Math.min(100, leads.length - listPage * 100).toLocaleString()} more · Showing {Math.min(listPage * 100, leads.length).toLocaleString()} of {leads.length.toLocaleString()}
                </button>
              )}
            </div>
          ) : (
            /* ── Board view ── */
            <div
              className="flex gap-3 overflow-x-auto pb-2 scroll-smooth"
              style={{ WebkitOverflowScrolling: 'touch', height: 'calc(100vh - 260px)' }}
            >
              {STAGES.map(stage => {
                const stageLeads = leads.filter(l => l.stage === stage.key)
                const visibleStageLeads = stageLeads.slice(0, BOARD_CAP)
                const Icon = stage.icon
                return (
                  <div key={stage.key} className="flex-shrink-0 w-64 flex flex-col h-full">
                    {/* Column header — sticky within column */}
                    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl mb-2 shrink-0', stage.color)}>
                      <Icon size={13}/>
                      <span className="text-xs font-semibold">{stage.label}</span>
                      <span className="ml-auto text-xs font-bold opacity-70">{stageLeads.length}</span>
                    </div>
                    {/* Cards — each column scrolls independently */}
                    <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5 min-h-[80px]">
                      {stageLeads.length === 0 ? (
                        <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                          No leads
                        </div>
                      ) : visibleStageLeads.map(lead => (
                        <Link
                          key={lead.id}
                          href={`/admin/crm/${lead.id}`}
                          className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3 hover:shadow-md hover:border-green-200 dark:hover:border-green-700 transition-all group block"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                              {lead.first_name} {lead.last_name}
                            </p>
                            {lead.program_interest && (
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', PROGRAM_BADGE[lead.program_interest])}>
                                {PROGRAM_LABEL[lead.program_interest]}
                              </span>
                            )}
                          </div>
                          {lead.business_name && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1 truncate">
                              <Building2 size={10}/> {lead.business_name}
                            </p>
                          )}
                          <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <Phone size={10}/> {lead.phone}
                          </p>
                          {lead.follow_up_at && (
                            <p className={cn('text-[10px] flex items-center gap-1 mt-1.5',
                              isPastDue(lead.follow_up_at) ? 'text-red-500' : 'text-gray-400'
                            )}>
                              <Calendar size={9}/> {formatDate(lead.follow_up_at)}
                            </p>
                          )}
                        </Link>
                      ))}
                      {stageLeads.length > BOARD_CAP && (
                        <Link
                          href={`/admin/crm?stage=${stage.key}`}
                          className="text-[10px] text-center text-gray-500 hover:text-green-500 py-1.5 transition-colors"
                        >
                          +{(stageLeads.length - BOARD_CAP).toLocaleString()} more — view all →
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Sidebar — desktop only, list view only ── */}
        <div className={cn('lg:flex lg:flex-col gap-4 w-72 shrink-0', view === 'board' ? 'hidden' : 'hidden lg:flex')}>
          {/* Dialer Mode card */}
          <Link
            href="/admin/crm/dialer"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-green-600 hover:bg-green-700 rounded-2xl px-4 py-4 text-white transition-colors"
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <Zap size={20}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">Dialer Mode</p>
              <p className="text-green-200 text-xs mt-0.5">Dial {inPipeline.toLocaleString()} pipeline leads</p>
            </div>
            <ChevronRight size={18} className="text-green-300"/>
          </Link>

          {/* Quick actions */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</p>
            <button
              onClick={syncNotion}
              disabled={syncing}
              className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 py-1.5 transition-colors w-full text-left disabled:opacity-50"
            >
              {syncing ? <Loader2 size={15} className="text-gray-400 animate-spin"/> : <RefreshCw size={15} className="text-gray-400"/>}
              {syncing ? 'Syncing from Notion...' : 'Sync from Notion'}
            </button>
            <Link href="/admin/crm/import" className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 py-1.5 transition-colors">
              <Upload size={15} className="text-gray-400"/> Import CSV
            </Link>
            <button onClick={()=>setShowNew(true)} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 py-1.5 transition-colors w-full text-left">
              <Plus size={15} className="text-gray-400"/> Add Lead Manually
            </button>
            <button onClick={()=>setShowCleanup(true)} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 py-1.5 transition-colors w-full text-left">
              <Trash2 size={15} className="text-gray-400"/> Cleanup Leads
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile bottom bar ── */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 py-3 flex gap-2 z-20">
        <button onClick={syncNotion} disabled={syncing} className="btn-secondary h-11 px-3 flex items-center justify-center gap-1.5 text-sm disabled:opacity-50">
          {syncing ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
        </button>
        <Link href="/admin/crm/import" className="btn-secondary flex-1 h-11 flex items-center justify-center gap-1.5 text-sm">
          <Upload size={15}/> Import
        </Link>
        <button onClick={()=>setShowNew(true)} className="btn-primary flex-1 h-11 flex items-center justify-center gap-1.5 text-sm">
          <Plus size={15}/> Add Lead
        </button>
      </div>

      {showNew && <NewLeadModal onClose={()=>setShowNew(false)} onCreated={handleCreated}/>}
      {showCleanup && <CleanupModal onClose={()=>setShowCleanup(false)} onDone={() => { setShowCleanup(false); load() }}/>}
    </div>
  )
}
