'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Plus, Search, Phone, Building2, Calendar, ChevronLeft, ChevronRight,
  X, Loader2, AlertCircle, Users, PhoneCall, TrendingUp,
  CheckCircle2, XCircle, Upload, Zap, Filter,
  LayoutList, Columns, Trash2, Bot, CheckSquare, Square, MinusSquare,
  Archive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import CRMWorkspaceNav from '@/components/crm/CRMWorkspaceNav'
import CRMSalesOverview from '@/components/crm/CRMSalesOverview'
import OfflineCRMSilentMirror from '@/components/offline-crm/OfflineCRMSilentMirror'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CRMLead {
  id: string
  first_name: string
  last_name: string
  phone: string
  phone_e164?: string | null
  email: string | null
  business_name: string | null
  stage: Stage
  program_interest: 'program_a' | 'program_b' | 'program_c' | null
  source: string
  notes: string | null
  follow_up_at: string | null
  last_contacted_at: string | null
  lead_temperature?: 'cold' | 'warm' | 'hot'
  acquisition_path?: 'self_serve' | 'partner_assisted' | null
  assigned_partner_affiliate_id?: string | null
  assigned_partner_name?: string | null
  partner_onboarding_status?: string | null
  callback_due_at?: string | null
  latest_call_note?: string | null
  strategy_call_booked?: boolean
  converted_to_client?: boolean
  close_probability?: number | null
  do_not_call: boolean
  is_archived: boolean
  likely_timezone?: string | null
  timezone_confidence?: 'high' | 'medium' | 'low' | 'unknown'
  timezone_source?: string | null
  timezone_source_label?: string | null
  timezone_reason?: string | null
  timezone_reason_label?: string | null
  last_timezone_checked_at?: string | null
  recipient_local_time?: string | null
  timezone_abbreviation?: string | null
  call_window_status?: 'callable_now' | 'blocked_by_timezone' | 'unknown_timezone'
  call_window_message?: string | null
  blocked_until_label?: string | null
  portal_invite_sent?: boolean
  portal_invite_last_sent_at?: string | null
  portal_invite_last_status?: string | null
  pre_analyzer_invite_sent?: boolean
  pre_analyzer_invite_last_sent_at?: string | null
  pre_analyzer_invite_last_status?: string | null
  account_created?: boolean
  account_created_at?: string | null
  analyzer_started?: boolean
  analyzer_started_at?: string | null
  analyzer_submitted?: boolean
  analyzer_submitted_at?: string | null
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

const BOARD_PAGE_SIZE = 20

function stageInfo(key: Stage) { return STAGES.find(s => s.key === key) ?? STAGES[0] }
function isPastDue(iso: string | null) { return !!iso && new Date(iso) < new Date() }
function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildCallabilityLabel(lead: CRMLead) {
  if (lead.call_window_status === 'callable_now') return 'Callable Now'
  if (lead.call_window_status === 'blocked_by_timezone') {
    return `Blocked Until ${lead.blocked_until_label ?? ''}`.trim()
  }
  return lead.timezone_reason_label ? `Unknown: ${lead.timezone_reason_label}` : 'Unknown Timezone'
}

function buildTimezoneMetaLabel(lead: CRMLead) {
  const source = lead.timezone_source_label ?? lead.timezone_source ?? null
  if (!source) return null
  if (lead.call_window_status === 'unknown_timezone' && lead.timezone_reason_label) {
    return `${source} • ${lead.timezone_reason_label}`
  }
  return source
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
      if (!res.ok) {
        if (res.status === 409 && json.duplicate_lead_id) {
          toast.error(`Duplicate phone — lead already exists. Opening existing record...`, { duration: 4000 })
          setTimeout(() => { window.location.href = `/admin/crm/${json.duplicate_lead_id}` }, 1500)
          return
        }
        toast.error(json.error ?? 'Failed')
        return
      }
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

// ─── Lead Row (compact) ───────────────────────────────────────────────────────
function LeadCard({ lead, selected, onToggle }: { lead: CRMLead; selected?: boolean; onToggle?: (id: string) => void }) {
  const stage = stageInfo(lead.stage)
  const pastDue = isPastDue(lead.follow_up_at)
  const callabilityLabel = buildCallabilityLabel(lead)
  const timezoneMetaLabel = buildTimezoneMetaLabel(lead)

  return (
    <div className="flex items-center gap-2">
      {onToggle && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(lead.id) }}
          className="shrink-0 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {selected ? (
            <CheckSquare size={18} className="text-green-600 dark:text-green-400" />
          ) : (
            <Square size={18} className="text-gray-300 dark:text-gray-600" />
          )}
        </button>
      )}
      <Link
        href={`/admin/crm/${lead.id}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-800 border rounded-xl hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/30 dark:hover:bg-green-950/20 transition-colors group flex-1 min-w-0",
          selected ? 'border-green-300 dark:border-green-700 bg-green-50/40 dark:bg-green-950/20' : 'border-gray-100 dark:border-gray-700'
        )}
      >
        <span className={cn('w-2 h-2 rounded-full shrink-0', stage.dot)}/>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
            {lead.first_name} {lead.last_name}
          </p>
          {lead.business_name && (
            <p className="text-xs text-gray-400 truncate hidden lg:block flex-1">{lead.business_name}</p>
          )}
        </div>
        <a
          href={`tel:${lead.phone}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-xs text-green-600 dark:text-green-400 shrink-0 hidden lg:block hover:underline"
        >
          {lead.phone}
        </a>
        <div className="flex items-center gap-1 shrink-0">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap', stage.color)}>{stage.label}</span>
          {lead.program_interest && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium hidden sm:inline', PROGRAM_BADGE[lead.program_interest])}>
              {PROGRAM_LABEL[lead.program_interest]}
            </span>
          )}
          {(lead.source === 'free_analyzer' || lead.source === 'analyzer') && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hidden sm:inline">
              Analyzer
            </span>
          )}
          {lead.acquisition_path === 'partner_assisted' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 hidden sm:inline">
              Partner Client
            </span>
          )}
          {pastDue && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium hidden sm:inline">Due</span>
          )}
          {lead.do_not_call && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">DNC</span>}
          {lead.call_window_status === 'callable_now' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium hidden sm:inline">
              Callable Now
            </span>
          )}
          {lead.call_window_status === 'blocked_by_timezone' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium hidden sm:inline">
              Blocked
            </span>
          )}
          {lead.call_window_status === 'unknown_timezone' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium hidden sm:inline">
              Unknown TZ
            </span>
          )}
          {lead.portal_invite_sent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium hidden sm:inline">
              Portal Invite
            </span>
          )}
          {lead.pre_analyzer_invite_sent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium hidden sm:inline">
              Analyzer Invite
            </span>
          )}
          {lead.account_created && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium hidden sm:inline">
              Account Created
            </span>
          )}
          {lead.analyzer_submitted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium hidden sm:inline">
              Analyzer Submitted
            </span>
          )}
        </div>
        <div className="hidden min-w-[150px] text-right text-[11px] leading-tight text-gray-500 xl:block">
          <div className="font-medium text-gray-600 dark:text-gray-300">{callabilityLabel}</div>
          {lead.recipient_local_time && <div>{lead.recipient_local_time}</div>}
          {timezoneMetaLabel && <div className="truncate">{timezoneMetaLabel}</div>}
        </div>
        <ChevronRight size={14} className="text-gray-300 group-hover:text-green-500 shrink-0 transition-colors"/>
      </Link>
    </div>
  )
}

function ListBatchControls({
  hasPrev,
  hasMore,
  pageSize,
  page,
  total,
  selectedCount,
  visibleSelectedCount,
  onPrev,
  onNext,
}: {
  hasPrev: boolean
  hasMore: boolean
  pageSize: number
  page: number
  total: number
  selectedCount: number
  visibleSelectedCount: number
  onPrev: () => void
  onNext: () => void
}) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total)
  const visibleCount = total === 0 ? 0 : rangeEnd - rangeStart + 1

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white/90 px-3 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {rangeStart.toLocaleString()}-{rangeEnd.toLocaleString()} of {total.toLocaleString()}
        </p>
        <p className="text-xs text-gray-400">
          {selectedCount > 0
            ? `${selectedCount.toLocaleString()} selected across pages${visibleSelectedCount > 0 ? ` • ${visibleSelectedCount.toLocaleString()} on this page` : ''}`
            : `Showing ${visibleCount.toLocaleString()} leads in this batch`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-green-300 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:hover:border-green-700 sm:flex-none"
        >
          ← Prev {pageSize}
        </button>
        <button
          onClick={onNext}
          disabled={!hasMore}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-green-300 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:hover:border-green-700 sm:flex-none"
        >
          Next {pageSize} →
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CRMClient() {
  const searchParams = useSearchParams()
  const focus = searchParams.get('focus') === 'leads' ? 'leads' : 'overview'
  const [leads, setLeads]           = useState<CRMLead[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState(searchParams.get('search') ?? '')
  const [stageFilter, setStageFilter] = useState(searchParams.get('stage') ?? '')
  const [temperatureFilter, setTemperatureFilter] = useState(searchParams.get('temperature') ?? '')
  const [callabilityFilter, setCallabilityFilter] = useState(searchParams.get('callability') ?? '')
  const [openTasksOnly, setOpenTasksOnly] = useState(searchParams.get('open_tasks') === 'true')
  const [showNew, setShowNew]       = useState(false)
  const [showCleanup, setShowCleanup] = useState(false)
  const [view, setView]             = useState<'list' | 'board'>(searchParams.get('view') === 'board' ? 'board' : 'list')
  const [listPage, setListPage]     = useState(1)
  const [boardPages, setBoardPages] = useState<Record<string, number>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkStageOpen, setBulkStageOpen] = useState(false)

  useEffect(() => {
    setView(searchParams.get('view') === 'board' ? 'board' : 'list')
    setStageFilter(searchParams.get('stage') ?? '')
    setTemperatureFilter(searchParams.get('temperature') ?? '')
    setCallabilityFilter(searchParams.get('callability') ?? '')
    setOpenTasksOnly(searchParams.get('open_tasks') === 'true')
  }, [searchParams])

  useEffect(() => {
    setListPage(1)
    setBoardPages({})
  }, [search, stageFilter, temperatureFilter, callabilityFilter, openTasksOnly, view])

  // Version counter — cancels stale in-flight loads when a newer one starts
  const loadVersion = useRef(0)

  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '1000' })
      if (stageFilter && view !== 'board') p.set('stage', stageFilter)
      if (search) p.set('search', search)
      if (temperatureFilter) p.set('temperature', temperatureFilter)
      if (callabilityFilter) p.set('callability', callabilityFilter)
      if (openTasksOnly) p.set('open_tasks', 'true')

      let allLeads: CRMLead[] = []
      let page = 0
      let total = Infinity

      while (allLeads.length < total) {
        if (version !== loadVersion.current) return // newer load started — abort
        p.set('page', String(page))
        const res  = await fetch(`/api/admin/crm/leads?${p}`)
        const json = await res.json()
        const batch: CRMLead[] = json.leads ?? []
        total = json.total ?? batch.length
        allLeads = [...allLeads, ...batch]
        if (batch.length < 1000) break
        page++
      }

      if (version !== loadVersion.current) return // stale — discard
      setLeads(allLeads)
    } catch { if (version === loadVersion.current) toast.error('Failed to load leads') }
    finally { if (version === loadVersion.current) setLoading(false) }
  }, [stageFilter, search, view, temperatureFilter, callabilityFilter, openTasksOnly])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  function handleCreated(lead: CRMLead) { setLeads(p=>[lead,...p]); setShowNew(false) }

  // Paginated list — 50 per page
  const PAGE_SIZE = 50
  const totalPages = Math.max(Math.ceil(leads.length / PAGE_SIZE), 1)
  const safeListPage = Math.min(listPage, totalPages)
  const visibleLeads = leads.slice((safeListPage - 1) * PAGE_SIZE, safeListPage * PAGE_SIZE)
  const hasMore = safeListPage * PAGE_SIZE < leads.length
  const hasPrev = safeListPage > 1
  const visibleLeadIds = visibleLeads.map(lead => lead.id)
  const visibleSelectedCount = visibleLeadIds.filter(id => selectedIds.has(id)).length
  const allVisibleSelected = visibleLeads.length > 0 && visibleSelectedCount === visibleLeads.length
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected
  const isPipelineView = view === 'board'
  const isLeadsView = !isPipelineView && focus === 'leads'
  const isOverviewView = !isPipelineView && focus === 'overview'

  useEffect(() => {
    if (listPage !== safeListPage) {
      setListPage(safeListPage)
    }
  }, [listPage, safeListPage])

  // ── Selection helpers ──
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleLeadIds.forEach(id => next.delete(id))
      } else {
        visibleLeadIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  function selectAllLeads() {
    setSelectedIds(new Set(leads.map(l => l.id)))
  }

  function removeSelectedIds(idsToRemove: string[]) {
    if (idsToRemove.length === 0) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      idsToRemove.forEach(id => next.delete(id))
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setBulkStageOpen(false)
  }

  // ── Bulk actions ──
  async function bulkDelete() {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const ok = window.confirm(`Permanently delete ${ids.length} lead(s)? This cannot be undone.`)
    if (!ok) return
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/crm/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_ids', ids }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message)
        const processedIds = Array.isArray(json.processedIds) ? json.processedIds : ids
        setLeads(prev => prev.filter(l => !processedIds.includes(l.id)))
        removeSelectedIds(processedIds)
        if (json.partial) toast.error(`${json.failedCount ?? 0} lead(s) could not be deleted.`)
      } else {
        toast.error(json.error ?? 'Failed')
      }
    } catch { toast.error('Network error') }
    finally { setBulkLoading(false) }
  }

  async function bulkArchive() {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/crm/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive_ids', ids }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message)
        const processedIds = Array.isArray(json.processedIds) ? json.processedIds : ids
        setLeads(prev => prev.filter(l => !processedIds.includes(l.id)))
        removeSelectedIds(processedIds)
        if (json.partial) toast.error(`${json.failedCount ?? 0} lead(s) could not be archived.`)
      } else {
        toast.error(json.error ?? 'Failed')
      }
    } catch { toast.error('Network error') }
    finally { setBulkLoading(false) }
  }

  async function bulkUpdateStage(newStage: Stage) {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/crm/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_stage', ids, stage: newStage }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message)
        const processedIds = new Set<string>(Array.isArray(json.processedIds) ? (json.processedIds as string[]) : ids)
        setLeads(prev => prev.map(l => processedIds.has(l.id) ? { ...l, stage: newStage } : l))
        removeSelectedIds(Array.from(processedIds))
        if (json.partial) toast.error(`${json.failedCount ?? 0} lead(s) could not be updated.`)
      } else {
        toast.error(json.error ?? 'Failed')
      }
    } catch { toast.error('Network error') }
    finally { setBulkLoading(false); setBulkStageOpen(false) }
  }

  const total     = leads.length
  const followDue = leads.filter(l => isPastDue(l.follow_up_at)).length
  const wonCount  = leads.filter(l => l.stage === 'closed_won').length
  const activeCount = leads.filter(l => l.stage === 'active_client').length
  const inPipeline = leads.filter(l => !['closed_won','closed_lost','active_client'].includes(l.stage)).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <OfflineCRMSilentMirror />
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
              {/* Desktop-only action buttons */}
              <Link
                href="/admin/crm/campaign"
                target="_blank"
                className="btn-secondary text-xs px-3 py-2 hidden sm:flex items-center gap-1.5"
              >
                <Bot size={13}/> AI Campaign
              </Link>
              <button
                onClick={() => setShowCleanup(true)}
                className="btn-secondary text-xs px-3 py-2 hidden sm:flex items-center gap-1.5"
              >
                <Trash2 size={13}/> Cleanup
              </button>
              <Link href="/admin/crm/import" className="btn-secondary text-xs px-3 py-2 hidden sm:flex items-center gap-1.5">
                <Upload size={13}/> Import
              </Link>
              <button onClick={()=>setShowNew(true)} className="btn-primary h-9 px-3 sm:px-4 flex items-center gap-1.5 text-sm">
                <Plus size={15}/> <span>Add Lead</span>
              </button>
            </div>
          </div>

          <div className="mb-3">
            <CRMWorkspaceNav />
          </div>

          {(isLeadsView || isPipelineView) && (
            <>
              {/* Search + filter row */}
              <div className="flex flex-wrap items-center gap-2">
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
                    view === 'list' ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:text-green-700 dark:hover:text-green-300'
                    )}
                  ><LayoutList size={14}/> List</button>
                  <button
                    onClick={() => { setView('board'); setStageFilter('') }}
                    className={cn('h-10 px-3 flex items-center gap-1.5 text-xs font-medium transition-colors border-l border-gray-200 dark:border-gray-700',
                    view === 'board' ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:text-green-700 dark:hover:text-green-300'
                    )}
                  ><Columns size={14}/> Board</button>
                </div>
                {/* Filter toggle — mobile only */}
                <button
                  onClick={() => setShowFilters(p => !p)}
                  aria-label={showFilters ? 'Hide filters' : 'Show filters'}
                  title={showFilters ? 'Hide filters' : 'Show filters'}
                  className={cn('h-10 w-10 flex items-center justify-center rounded-xl border transition-colors shrink-0 sm:hidden',
                    showFilters || stageFilter
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                  )}
                >
                  <Filter size={15}/>
                </button>
                <select
                  value={temperatureFilter}
                  onChange={e => setTemperatureFilter(e.target.value)}
                  className="input-field h-10 w-[110px] text-sm shrink-0"
                >
                  <option value="">All temps</option>
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                </select>
                <select
                  value={callabilityFilter}
                  onChange={e => setCallabilityFilter(e.target.value)}
                  className="input-field h-10 w-[140px] text-sm shrink-0"
                >
                  <option value="">Call window</option>
                  <option value="callable_now">Callable now</option>
                  <option value="blocked_by_timezone">Blocked</option>
                  <option value="unknown_timezone">Unknown TZ</option>
                </select>
                <button
                  onClick={() => setOpenTasksOnly(value => !value)}
                  className={cn(
                    'h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 text-sm font-medium transition-colors',
                    openTasksOnly
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  )}
                >
                  Open Tasks
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
            </>
          )}
        </div>
      </div>

      {isOverviewView && (
        <div className="mx-auto max-w-screen-xl px-4 pt-4">
          <CRMSalesOverview />
        </div>
      )}

      {/* ── Body ── */}
      {(isLeadsView || isPipelineView) && (
        <div className={cn(
          'pt-4 pb-24',
          view === 'list' ? 'max-w-screen-xl mx-auto px-4 lg:flex lg:gap-6 lg:items-start' : 'px-4'
        )}>

        {/* ── Lead list (main column) ── */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* Stats strip */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mb-4">
            {[
              { label: 'Total',    value: total,       color: 'text-gray-900 dark:text-white' },
              { label: 'Due',      value: followDue,   color: followDue > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white' },
              { label: 'Active',   value: activeCount, color: 'text-teal-500' },
              { label: 'Won',      value: wonCount,    color: 'text-green-600' },
              { label: 'Pipeline', value: inPipeline,  color: 'text-amber-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-2 py-2.5 text-center">
                <p className={cn('text-lg font-bold', color)}>{value.toLocaleString()}</p>
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
            <div className="space-y-1">
              <ListBatchControls
                hasPrev={hasPrev}
                hasMore={hasMore}
                pageSize={PAGE_SIZE}
                page={safeListPage}
                total={leads.length}
                selectedCount={selectedIds.size}
                visibleSelectedCount={visibleSelectedCount}
                onPrev={() => setListPage(p => p - 1)}
                onNext={() => setListPage(p => p + 1)}
              />
              {/* Select-all row */}
              <div className="flex items-center gap-2 px-1 py-1.5">
                <button
                  onClick={toggleSelectAll}
                  className="shrink-0 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {allVisibleSelected ? (
                    <CheckSquare size={18} className="text-green-600 dark:text-green-400" />
                  ) : someVisibleSelected ? (
                    <MinusSquare size={18} className="text-green-600 dark:text-green-400" />
                  ) : (
                    <Square size={18} className="text-gray-300 dark:text-gray-600" />
                  )}
                </button>
                <span className="text-xs text-gray-400">
                  {selectedIds.size > 0 ? (
                    <>
                      {selectedIds.size} selected
                      {visibleSelectedCount > 0 && (
                        <span className="ml-2 text-gray-500 dark:text-gray-400">
                          {visibleSelectedCount} on this page
                        </span>
                      )}
                      {selectedIds.size < leads.length && (
                        <button onClick={selectAllLeads} className="ml-2 text-green-600 dark:text-green-400 hover:underline font-medium">
                          Select all {leads.length}
                        </button>
                      )}
                      <button onClick={clearSelection} className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:underline">
                        Clear
                      </button>
                    </>
                  ) : (
                    'Select this page'
                  )}
                </span>
              </div>
              {visibleLeads.map(lead => <LeadCard key={lead.id} lead={lead} selected={selectedIds.has(lead.id)} onToggle={toggleSelect}/>)}
              <ListBatchControls
                hasPrev={hasPrev}
                hasMore={hasMore}
                pageSize={PAGE_SIZE}
                page={safeListPage}
                total={leads.length}
                selectedCount={selectedIds.size}
                visibleSelectedCount={visibleSelectedCount}
                onPrev={() => setListPage(p => p - 1)}
                onNext={() => setListPage(p => p + 1)}
              />
            </div>
          ) : (
            /* ── Board view ── */
            <div
              className="flex gap-3 overflow-x-auto pb-2 scroll-smooth"
              style={{ WebkitOverflowScrolling: 'touch', height: 'calc(100vh - 260px)' }}
            >
              {STAGES.map(stage => {
                const stageLeads = leads.filter(l => l.stage === stage.key)
                const colPage = boardPages[stage.key] ?? 1
                const colHasPrev = colPage > 1
                const colHasNext = colPage * BOARD_PAGE_SIZE < stageLeads.length
                const visibleStageLeads = stageLeads.slice((colPage - 1) * BOARD_PAGE_SIZE, colPage * BOARD_PAGE_SIZE)
                const Icon = stage.icon
                function setColPage(n: number) {
                  setBoardPages(p => ({ ...p, [stage.key]: n }))
                }
                return (
                  <div key={stage.key} className="flex-shrink-0 w-64 flex flex-col h-full">
                    {/* Column header */}
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
                      {/* Per-column pagination */}
                      {stageLeads.length > BOARD_PAGE_SIZE && (
                        <div className="flex items-center justify-between gap-1 pt-1 pb-0.5 shrink-0">
                          <button
                            onClick={() => setColPage(colPage - 1)}
                            disabled={!colHasPrev}
                            className="flex-1 py-1.5 text-[11px] font-medium border border-gray-200 dark:border-gray-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 hover:text-green-600 hover:border-green-300 dark:hover:border-green-700"
                          >
                            ← Prev
                          </button>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap px-1">
                            {((colPage - 1) * BOARD_PAGE_SIZE + 1)}–{Math.min(colPage * BOARD_PAGE_SIZE, stageLeads.length)}
                          </span>
                          <button
                            onClick={() => setColPage(colPage + 1)}
                            disabled={!colHasNext}
                            className="flex-1 py-1.5 text-[11px] font-medium border border-gray-200 dark:border-gray-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 hover:text-green-600 hover:border-green-300 dark:hover:border-green-700"
                          >
                            Next →
                          </button>
                        </div>
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
      )}

      {/* ── Mobile bottom bar ── */}
      {(isLeadsView || isPipelineView) && (
        <div className="fixed bottom-0 left-0 right-0 sm:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex gap-2 z-20">
          <Link href="/admin/crm/import" className="btn-secondary h-11 flex-1 flex items-center justify-center gap-1.5 text-sm">
            <Upload size={14}/> Import
          </Link>
          <button onClick={()=>setShowNew(true)} className="btn-primary h-11 flex-1 flex items-center justify-center gap-1.5 text-sm">
            <Plus size={15}/> Add Lead
          </button>
        </div>
      )}

      {/* ── Bulk Action Bar ── */}
      {selectedIds.size > 0 && isLeadsView && (
        <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl border border-gray-700 px-5 py-3 flex items-center gap-3 max-w-lg w-[calc(100%-2rem)]">
          <span className="text-sm font-semibold shrink-0">
            {selectedIds.size} selected
          </span>
          <div className="flex-1" />
          {/* Move to stage */}
          <div className="relative">
            <button
              onClick={() => setBulkStageOpen(p => !p)}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              <TrendingUp size={13}/> Move Stage
            </button>
            {bulkStageOpen && (
              <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 w-44 max-h-60 overflow-y-auto z-40">
                {STAGES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => bulkUpdateStage(s.key)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                  >
                    <span className={cn('w-2 h-2 rounded-full', s.dot)} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Archive */}
          <button
            onClick={bulkArchive}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            <Archive size={13}/> Archive
          </button>
          {/* Delete */}
          <button
            onClick={bulkDelete}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {bulkLoading ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>} Delete
          </button>
          {/* Close */}
          <button
            onClick={clearSelection}
            aria-label="Close bulk actions"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={15}/>
          </button>
        </div>
      )}

      {showNew && <NewLeadModal onClose={()=>setShowNew(false)} onCreated={handleCreated}/>}
      {showCleanup && <CleanupModal onClose={()=>setShowCleanup(false)} onDone={() => { setShowCleanup(false); load() }}/>}
    </div>
  )
}
