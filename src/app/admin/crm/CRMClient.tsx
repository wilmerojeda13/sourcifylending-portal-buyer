'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Plus, Search, Phone, Building2, Calendar, ChevronRight,
  X, Loader2, AlertCircle, Users, PhoneCall, TrendingUp,
  CheckCircle2, XCircle, Upload, Zap, Filter,
  Trash2, Bot, CheckSquare, Square, MinusSquare,
  Archive, GripVertical,
} from 'lucide-react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable, type DragEndEvent } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import CRMWorkspaceNav from '@/components/crm/CRMWorkspaceNav'
import CRMSalesOverview from '@/components/crm/CRMSalesOverview'
import CRMParentNav from '@/components/crm/CRMParentNav'
import OfflineCRMSilentMirror from '@/components/offline-crm/OfflineCRMSilentMirror'
import toast from 'react-hot-toast'
import TagBadge, { type CRMTagBadge } from '@/components/admin/crm/TagBadge'
import BulkSelectionBar from '@/components/admin/crm/BulkSelectionBar'
import CRMDispositionForm from '@/components/admin/crm/CRMDispositionForm'
import { useBulkSelection } from '@/hooks/useBulkSelection'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearchMatch {
  primaryMatch: string
  score: number
  matchedField: string | null
}

interface OwnerOption {
  id: string
  name: string
}

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
  last_call_outcome?: string | null
  latest_call_note?: string | null
  assigned_to_user_id?: string | null
  assigned_to_name?: string | null
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
  tags?: CRMTagBadge[]
  // Search match metadata from unified search
  search_match?: SearchMatch | null
}

type DispositionTarget =
  | { mode: 'single'; lead: CRMLead }
  | { mode: 'bulk' }

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

// Disposition filter options - values MUST match crm_leads.last_call_outcome field
// which is set by applyCrmDisposition() from CRM_DISPOSITIONS.outcome
// See lib/crm-dispositions.ts for the canonical disposition definitions
const DISPOSITION_FILTER_OPTIONS = [
  { value: '', label: 'Any disposition' },
  { value: 'Interested', label: 'Interested' },
  { value: 'Appointment Set', label: 'Appointment Set' },
  { value: 'Booked Call', label: 'Booked Call' },
  { value: 'Follow Up', label: 'Follow Up' },
  { value: 'Call Back', label: 'Call Back' },
  { value: 'Call Back Later', label: 'Call Back Later' },
  { value: 'Voicemail', label: 'Voicemail' },
  { value: 'Left Voicemail', label: 'Left Voicemail' },
  { value: 'No Answer', label: 'No Answer' },
  { value: 'Busy', label: 'Busy' },
  { value: 'Bad Number', label: 'Bad Number' },
  { value: 'Not Interested', label: 'Not Interested' },
  { value: 'Do Not Call', label: 'DNC / Remove' },
  { value: 'Closed Won', label: 'Closed Won' },
  { value: 'Closed Lost', label: 'Closed Lost' },
] as const

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

// ─── Kanban Board Sub-components ─────────────────────────────────────────────
function DraggableKanbanCard({
  lead,
  selectedIds,
  ghostId,
}: {
  lead: CRMLead
  selectedIds: Set<string>
  ghostId: string | null
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: 'relative' as const }
    : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        'rounded-xl border bg-white dark:bg-gray-800 transition-shadow',
        ghostId === lead.id ? 'opacity-30 shadow-none' : 'hover:shadow-md',
        selectedIds.has(lead.id)
          ? 'border-green-400 bg-green-50/60 dark:border-green-700 dark:bg-green-950/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-600',
      )}
    >
      <div className="flex items-start gap-1 p-3">
        <button
          {...listeners}
          className="mt-0.5 flex-shrink-0 cursor-grab touch-none text-gray-200 hover:text-gray-400 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
          title="Drag to move"
          aria-label="Drag handle"
        >
          <GripVertical size={13} />
        </button>
        <Link href={`/admin/crm/${lead.id}`} className="flex-1 min-w-0 block">
          <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight truncate">
            {lead.first_name} {lead.last_name}
          </p>
          {lead.business_name && (
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
              <Building2 size={9} className="flex-shrink-0" /> {lead.business_name}
            </p>
          )}
          {(lead.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {lead.tags?.slice(0, 2).map(tag => (
                <span
                  key={tag.id}
                  className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                  style={{ backgroundColor: tag.color ? `${tag.color}20` : '#e5e7eb', color: tag.color || '#374151' }}
                >
                  {tag.name}
                </span>
              ))}
              {(lead.tags?.length ?? 0) > 2 && (
                <span className="text-[10px] text-gray-400">+{lead.tags!.length - 2}</span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[80px]">
              {lead.assigned_to_name?.split(' ')[0] || 'Unassigned'}
            </span>
            {(lead.follow_up_at || lead.callback_due_at) && (
              <span className={cn(
                'text-[10px] flex items-center gap-0.5',
                isPastDue((lead.follow_up_at || lead.callback_due_at) ?? null)
                  ? 'font-semibold text-red-500'
                  : 'text-gray-400',
              )}>
                <Calendar size={9} />
                {formatDate((lead.follow_up_at || lead.callback_due_at) ?? null)}
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  )
}

function DroppableKanbanColumn({
  stageId,
  isEmpty,
  children,
}: {
  stageId: string
  isEmpty: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-2 overflow-y-auto flex-1 pb-2 rounded-xl transition-colors',
        isOver
          ? 'bg-green-50/60 ring-2 ring-inset ring-green-300 dark:bg-green-950/20 dark:ring-green-700'
          : '',
      )}
      style={{ maxHeight: 'calc(100vh - 260px)' }}
    >
      {isEmpty && !isOver && (
        <div className="flex items-center justify-center min-h-[80px] border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-400">
          Drop here
        </div>
      )}
      {children}
    </div>
  )
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="font-bold text-gray-900 text-sm">Add New Lead</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X size={15}/></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-2.5">
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
          <div className="flex gap-2 pt-0.5 pb-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 h-9 flex items-center justify-center gap-2 text-sm">
              {saving && <Loader2 size={14} className="animate-spin"/>}{saving ? 'Saving...' : 'Create Lead'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-4 h-9 text-sm">Cancel</button>
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Quick Lead Cleanup</h2>
            <p className="text-xs text-gray-500 mt-0.5">Archive leads you no longer need to contact</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X size={15}/>
          </button>
        </div>
        <div className="p-4 space-y-2">
          {actions.map(a => {
            const isRunning = running === a.action + (a.filter ?? '')
            return (
              <button
                key={a.id}
                onClick={() => runAction(a.action, a.filter)}
                disabled={!!running}
                className={cn(
                  'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors text-left disabled:opacity-60',
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
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-400 text-center">Archived leads are hidden from the CRM but not deleted unless you choose Delete Archived.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Lead Row (compact) ───────────────────────────────────────────────────────
function LeadCard({
  lead,
  selected,
  onToggle,
  onTagFilter,
}: {
  lead: CRMLead
  selected?: boolean
  onToggle?: (id: string) => void
  onTagFilter?: (tag: CRMTagBadge) => void
}) {
  const stage = stageInfo(lead.stage)
  const pastDue = isPastDue(lead.follow_up_at ?? null) || isPastDue(lead.callback_due_at ?? null)

  return (
    <div className="flex items-center gap-2 group">
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
          "flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 border rounded-xl hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/30 dark:hover:bg-green-950/20 transition-all flex-1 min-w-0",
          selected ? 'border-green-300 dark:border-green-700 bg-green-50/40 dark:bg-green-950/20 shadow-sm' : 'border-gray-200 dark:border-gray-700'
        )}
      >
        {/* Stage dot */}
        <span className={cn('w-2 h-2 rounded-full shrink-0', stage.dot)}/>
        
        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-gray-900 dark:text-white">
              {lead.first_name} {lead.last_name}
            </p>
            {lead.business_name && (
              <span className="text-xs text-gray-400">• {lead.business_name}</span>
            )}
          </div>
          
          {/* Tags row - prominent */}
          {(lead.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {lead.tags?.slice(0, 4).map((tag) => (
                <button
                  key={tag.id}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagFilter?.(tag) }}
                  className="text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors hover:opacity-80"
                  style={{ backgroundColor: tag.color ? `${tag.color}20` : '#e5e7eb', color: tag.color || '#374151' }}
                >
                  {tag.name}
                </button>
              ))}
              {(lead.tags?.length ?? 0) > 4 && (
                <span className="text-[10px] text-gray-400 py-0.5">+{lead.tags!.length - 4}</span>
              )}
            </div>
          )}
        </div>
        
        {/* Right side info */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Owner */}
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-[9px] font-medium text-gray-600 dark:text-gray-300">
              {(lead.assigned_to_name || 'U').charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-gray-500 hidden lg:block">
              {lead.assigned_to_name?.split(' ')[0] || 'Unassigned'}
            </span>
          </div>
          
          {/* Due date */}
          {(lead.follow_up_at || lead.callback_due_at) && (
            <span className={cn('text-xs flex items-center gap-1',
              pastDue ? 'text-red-500 font-medium' : 'text-gray-400'
            )}>
              <Calendar size={12}/> 
              {formatDate((lead.follow_up_at || lead.callback_due_at) ?? null)}
            </span>
          )}
          
          {/* Stage badge */}
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap hidden sm:block', stage.color)}>
            {stage.label}
          </span>
          
          <ChevronRight size={14} className="text-gray-300 group-hover:text-green-500 shrink-0 transition-colors"/>
        </div>
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
  const [tagFilters, setTagFilters] = useState<string[]>(searchParams.getAll('tag_id'))
  const [excludeTagFilters, setExcludeTagFilters] = useState<string[]>(searchParams.getAll('exclude_tag_id'))
  const [tagMode, setTagMode] = useState<'any' | 'all'>(searchParams.get('tag_mode') === 'all' ? 'all' : 'any')
  const [availableTags, setAvailableTags] = useState<CRMTagBadge[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [ownerFilter, setOwnerFilter] = useState(searchParams.get('owner') ?? '')
  const [dispositionFilter, setDispositionFilter] = useState(searchParams.get('disposition') ?? '')
  const [openTasksOnly, setOpenTasksOnly] = useState(searchParams.get('open_tasks') === 'true')
  const [followUpDueOnly, setFollowUpDueOnly] = useState(searchParams.get('follow_up_due') === 'true')
  const [callbackDueOnly, setCallbackDueOnly] = useState(searchParams.get('callback_due') === 'true')
  const [showNew, setShowNew]       = useState(false)
  const [showCleanup, setShowCleanup] = useState(false)
  const [view, setView]             = useState<'list' | 'board'>(searchParams.get('view') === 'board' ? 'board' : 'list')
  const [listPage, setListPage]     = useState(1)
  const [boardPages, setBoardPages] = useState<Record<string, number>>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkStageOpen, setBulkStageOpen] = useState(false)
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([])
  const [bulkOwnerId, setBulkOwnerId] = useState('')
  const [dispositionTarget, setDispositionTarget] = useState<DispositionTarget | null>(null)
  const [dispositionSubmitting, setDispositionSubmitting] = useState(false)
  const [dispositionError, setDispositionError] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    setView(searchParams.get('view') === 'board' ? 'board' : 'list')
    setStageFilter(searchParams.get('stage') ?? '')
    setTemperatureFilter(searchParams.get('temperature') ?? '')
    setCallabilityFilter(searchParams.get('callability') ?? '')
    setTagFilters(searchParams.getAll('tag_id'))
    setExcludeTagFilters(searchParams.getAll('exclude_tag_id'))
    setTagMode(searchParams.get('tag_mode') === 'all' ? 'all' : 'any')
    setOwnerFilter(searchParams.get('owner') ?? '')
    setDispositionFilter(searchParams.get('disposition') ?? '')
    setOpenTasksOnly(searchParams.get('open_tasks') === 'true')
    setFollowUpDueOnly(searchParams.get('follow_up_due') === 'true')
    setCallbackDueOnly(searchParams.get('callback_due') === 'true')
  }, [searchParams])

  useEffect(() => {
    setListPage(1)
    setBoardPages({})
  }, [search, stageFilter, temperatureFilter, callabilityFilter, tagFilters, excludeTagFilters, tagMode, ownerFilter, dispositionFilter, openTasksOnly, followUpDueOnly, callbackDueOnly, view])

  // Version counter — cancels stale in-flight loads when a newer one starts
  const loadVersion = useRef(0)

  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/admin/crm/tags', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (active) setAvailableTags(json.tags ?? [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/admin/crm/owners', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (active) setOwners(json.owners ?? [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '1000' })
      if (stageFilter) p.set('stage', stageFilter)
      if (search) p.set('search', search)
      if (temperatureFilter) p.set('temperature', temperatureFilter)
      if (callabilityFilter) p.set('callability', callabilityFilter)
      tagFilters.forEach((tagId) => p.append('tag_id', tagId))
      excludeTagFilters.forEach((tagId) => p.append('exclude_tag_id', tagId))
      if (tagFilters.length > 0) p.set('tag_mode', tagMode)
      if (ownerFilter) p.set('owner', ownerFilter)
      if (dispositionFilter) p.set('disposition', dispositionFilter)
      if (openTasksOnly) p.set('open_tasks', 'true')
      if (followUpDueOnly) p.set('follow_up_due', 'true')
      if (callbackDueOnly) p.set('callback_due', 'true')

      let allLeads: CRMLead[] = []
      let page = 0
      let total = Infinity

      while (allLeads.length < total) {
        if (version !== loadVersion.current) return // newer load started — abort
        p.set('page', String(page))
        const res  = await fetch(`/api/admin/crm/leads?${p}`, { cache: 'no-store' })
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
  }, [stageFilter, search, temperatureFilter, callabilityFilter, tagFilters, excludeTagFilters, tagMode, ownerFilter, dispositionFilter, openTasksOnly, followUpDueOnly, callbackDueOnly])

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
  const {
    selectedIds,
    selectedCount,
    visibleSelectedCount,
    allVisibleSelected,
    toggleOne,
    toggleVisible,
    selectAllFiltered,
    clearSelection,
    removeIds,
  } = useBulkSelection(leads.map((lead) => lead.id), visibleLeadIds)
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected
  const isPipelineView = view === 'board'
  const isLeadsView = !isPipelineView && focus === 'leads'
  const isOverviewView = !isPipelineView && focus === 'overview'

  useEffect(() => {
    if (listPage !== safeListPage) {
      setListPage(safeListPage)
    }
  }, [listPage, safeListPage])

  function clearBulkSelection() {
    clearSelection()
    setBulkStageOpen(false)
    setBulkOwnerId('')
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setDraggingId(null)
    if (!over) return
    const leadId = active.id as string
    const newStage = over.id as Stage
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.stage === newStage) return
    const prevStage = lead.stage
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l))
    try {
      const res = await fetch(`/api/admin/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Moved to ${stageInfo(newStage).label}`)
    } catch {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: prevStage } : l))
      toast.error('Stage update failed')
    }
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
        body: JSON.stringify({ module: 'leads', action: 'delete', ids }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message)
        const processedIds = Array.isArray(json.processedIds) ? json.processedIds : ids
        setLeads(prev => prev.filter(l => !processedIds.includes(l.id)))
        removeIds(processedIds)
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
        body: JSON.stringify({ module: 'leads', action: 'archive', ids }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message)
        const processedIds = Array.isArray(json.processedIds) ? json.processedIds : ids
        setLeads(prev => prev.filter(l => !processedIds.includes(l.id)))
        removeIds(processedIds)
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
        body: JSON.stringify({ module: 'leads', action: 'update_stage', ids, stage: newStage }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message)
        const processedIds = new Set<string>(Array.isArray(json.processedIds) ? (json.processedIds as string[]) : ids)
        setLeads(prev => prev.map(l => processedIds.has(l.id) ? { ...l, stage: newStage } : l))
        removeIds(Array.from(processedIds))
        if (json.partial) toast.error(`${json.failedCount ?? 0} lead(s) could not be updated.`)
      } else {
        toast.error(json.error ?? 'Failed')
      }
    } catch { toast.error('Network error') }
    finally { setBulkLoading(false); setBulkStageOpen(false) }
  }

  async function bulkUpdateTags(mode: 'add_tags' | 'remove_tags') {
    if (selectedIds.size === 0 || bulkTagIds.length === 0) {
      toast.error('Select leads and at least one tag first.')
      return
    }

    const ids = Array.from(selectedIds)
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/crm/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'leads', action: mode, ids, tag_ids: bulkTagIds }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update tags')
        return
      }

      const tagMap = new Map(availableTags.map((tag) => [tag.id, tag]))
      const tagRecords = bulkTagIds.map((tagId) => tagMap.get(tagId)).filter(Boolean) as CRMTagBadge[]

      setLeads((current) => current.map((lead) => {
        if (!ids.includes(lead.id)) return lead
        const currentTags = lead.tags ?? []
        const currentTagIds = new Set(currentTags.map((tag) => tag.id))
        const nextTags = mode === 'add_tags'
          ? [...currentTags, ...tagRecords.filter((tag) => !currentTagIds.has(tag.id))]
          : currentTags.filter((tag) => !bulkTagIds.includes(tag.id))
        return { ...lead, tags: nextTags.sort((left, right) => left.name.localeCompare(right.name)) }
      }))
      toast.success(json.message)
    } catch {
      toast.error('Network error')
    } finally {
      setBulkLoading(false)
    }
  }

  async function bulkAssignOwner() {
    if (selectedIds.size === 0 || !bulkOwnerId) {
      toast.error('Select contacts and an owner first.')
      return
    }

    const ids = Array.from(selectedIds)
    const owner = owners.find((item) => item.id === bulkOwnerId)
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/crm/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'leads',
          action: 'assign_owner',
          ids,
          owner_user_id: bulkOwnerId,
          owner_name: owner?.name ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to assign owner')
        return
      }

      setLeads((current) => current.map((lead) => ids.includes(lead.id)
        ? { ...lead, assigned_to_user_id: bulkOwnerId, assigned_to_name: owner?.name ?? null }
        : lead))
      toast.success(json.message)
      removeIds(ids)
    } catch {
      toast.error('Network error')
    } finally {
      setBulkLoading(false)
    }
  }

  async function bulkDisposition(value: { disposition_key: string; note: string; follow_up_at: string }) {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setDispositionSubmitting(true)
    setDispositionError(null)
    try {
      const res = await fetch('/api/admin/crm/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'leads',
          action: 'disposition',
          ids,
          disposition_key: value.disposition_key,
          note: value.note || null,
          follow_up_at: value.follow_up_at || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save disposition')
      toast.success(json.message)
      setDispositionTarget(null)
      clearBulkSelection()
      load()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save disposition'
      setDispositionError(message)
      toast.error(message)
    } finally {
      setDispositionSubmitting(false)
    }
  }

  async function saveSingleDisposition(value: { disposition_key: string; note: string; follow_up_at: string }) {
    if (!dispositionTarget || dispositionTarget.mode !== 'single') return
    setDispositionSubmitting(true)
    setDispositionError(null)
    try {
      const res = await fetch('/api/admin/crm/dispositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: dispositionTarget.lead.id,
          disposition_key: value.disposition_key,
          note: value.note || null,
          follow_up_at: value.follow_up_at || null,
          // Only create task for dispositions that require follow-up
          create_follow_up_task: ['follow_up', 'call_back', 'call_back_later', 'appointment_set', 'booked_call'].includes(value.disposition_key) && value.follow_up_at ? true : false,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save disposition')
      setLeads((current) => current.map((lead) => lead.id === dispositionTarget.lead.id ? { ...lead, ...json.lead } : lead))
      setDispositionTarget(null)
      toast.success('Disposition saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save disposition'
      setDispositionError(message)
      toast.error(message)
    } finally {
      setDispositionSubmitting(false)
    }
  }

  const total     = leads.length
  const tagMap = new Map(availableTags.map((tag) => [tag.id, tag]))
  const ownerMap = new Map(owners.map((owner) => [owner.id, owner.name]))
  const leadCountLabel = isPipelineView ? 'pipeline leads' : 'leads'
  const activeFilterCount = [
    stageFilter,
    temperatureFilter,
    callabilityFilter,
    ownerFilter,
    dispositionFilter,
    openTasksOnly ? 'open_tasks' : '',
    followUpDueOnly ? 'follow_up_due' : '',
    callbackDueOnly ? 'callback_due' : '',
    ...tagFilters,
    ...excludeTagFilters,
  ].filter(Boolean).length

  function clearAllFilters() {
    setStageFilter('')
    setTemperatureFilter('')
    setCallabilityFilter('')
    setOwnerFilter('')
    setDispositionFilter('')
    setOpenTasksOnly(false)
    setFollowUpDueOnly(false)
    setCallbackDueOnly(false)
    setTagFilters([])
    setExcludeTagFilters([])
    setTagMode('any')
  }

  const activeFilterChips = [
    ...(stageFilter ? [{
      key: `stage-${stageFilter}`,
      label: `Stage: ${stageInfo(stageFilter as Stage).label}`,
      onRemove: () => setStageFilter(''),
    }] : []),
    ...(temperatureFilter ? [{
      key: `temperature-${temperatureFilter}`,
      label: `Temperature: ${temperatureFilter[0].toUpperCase()}${temperatureFilter.slice(1)}`,
      onRemove: () => setTemperatureFilter(''),
    }] : []),
    ...(callabilityFilter ? [{
      key: `callability-${callabilityFilter}`,
      label: callabilityFilter === 'callable_now'
        ? 'Callable now'
        : callabilityFilter === 'blocked_by_timezone'
          ? 'Blocked by timezone'
          : 'Unknown timezone',
      onRemove: () => setCallabilityFilter(''),
    }] : []),
    ...(ownerFilter ? [{
      key: `owner-${ownerFilter}`,
      label: ownerFilter === 'unassigned' ? 'Owner: Unassigned' : `Owner: ${ownerMap.get(ownerFilter) ?? 'Unknown'}`,
      onRemove: () => setOwnerFilter(''),
    }] : []),
    ...(dispositionFilter ? [{
      key: `disposition-${dispositionFilter}`,
      label: `Disposition: ${DISPOSITION_FILTER_OPTIONS.find((option) => option.value === dispositionFilter)?.label ?? dispositionFilter}`,
      onRemove: () => setDispositionFilter(''),
    }] : []),
    ...(openTasksOnly ? [{
      key: 'open-tasks',
      label: 'Open tasks',
      onRemove: () => setOpenTasksOnly(false),
    }] : []),
    ...(followUpDueOnly ? [{
      key: 'follow-up-due',
      label: 'Follow-up due',
      onRemove: () => setFollowUpDueOnly(false),
    }] : []),
    ...(callbackDueOnly ? [{
      key: 'callback-due',
      label: 'Callback due',
      onRemove: () => setCallbackDueOnly(false),
    }] : []),
    ...tagFilters.map((tagId) => ({
      key: `tag-${tagId}`,
      label: `Tag: ${tagMap.get(tagId)?.name ?? 'Unknown'}`,
      onRemove: () => setTagFilters((current) => current.filter((id) => id !== tagId)),
    })),
    ...excludeTagFilters.map((tagId) => ({
      key: `exclude-tag-${tagId}`,
      label: `Exclude: ${tagMap.get(tagId)?.name ?? 'Unknown'}`,
      onRemove: () => setExcludeTagFilters((current) => current.filter((id) => id !== tagId)),
    })),
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <OfflineCRMSilentMirror />
      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-4 py-2 sm:py-2.5">
          {/* Parent navigation breadcrumb */}
          <div className="mb-2">
            <CRMParentNav crumbs={[{ label: 'Admin Hub', href: '/admin' }, { label: 'Sales CRM' }]} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2.5">
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight text-gray-900 dark:text-white sm:text-xl">Sales CRM</h1>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {total.toLocaleString()} {leadCountLabel}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setShowNew(true)} className="btn-primary h-8.5 px-3 sm:px-4 flex items-center gap-1.5 text-sm shrink-0">
                <Plus size={15}/> <span>Add Lead</span>
              </button>
            </div>
          </div>

          <div className="mt-2">
            <CRMWorkspaceNav />
          </div>

          {(isLeadsView || isPipelineView) && (
            <>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input
                    className="input-field h-9 pl-8 text-sm"
                    placeholder={isPipelineView ? 'Search pipeline...' : 'Search leads...'}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters(true)}
                  className={cn(
                    'h-9 shrink-0 rounded-xl border px-3 text-sm font-semibold transition-colors inline-flex items-center gap-2',
                    activeFilterCount > 0
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                  )}
                >
                  <Filter size={15}/>
                  <span>Filter</span>
                  {activeFilterCount > 0 && (
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                      activeFilterCount > 0 ? 'bg-white/20 text-current' : 'bg-gray-100 text-gray-600'
                    )}>
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {activeFilterChips.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {activeFilterChips.map((chip) => (
                    <div
                      key={chip.key}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    >
                      <span>{chip.label}</span>
                      <button
                        type="button"
                        onClick={chip.onRemove}
                        className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Clear all
                  </button>
                </div>
              )}
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
          isPipelineView ? 'px-2 sm:px-4 pt-2.5 pb-24' : 'max-w-screen-xl mx-auto px-4 pt-2.5 pb-24'
        )}>

        {/* ── Lead list / board (main column) ── */}
        <div className={cn('min-w-0', !isPipelineView && 'overflow-hidden')}>
          {loading ? (
            <div className="space-y-2">
              {/* Skeleton batch controls */}
              <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white/90 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/90 sm:flex-row sm:items-center sm:justify-between animate-pulse">
                <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700"/>
                <div className="flex gap-2">
                  <div className="h-9 w-24 rounded-xl border border-gray-200 dark:border-gray-700"/>
                  <div className="h-9 w-24 rounded-xl border border-gray-200 dark:border-gray-700"/>
                </div>
              </div>
              {/* Skeleton lead cards */}
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-900 animate-pulse">
                  <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700"/>
                  <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700"/>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700"/>
                    <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700"/>
                  </div>
                  <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700"/>
                  <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-gray-700"/>
                  <div className="h-6 w-20 rounded border border-gray-200 dark:border-gray-700"/>
                </div>
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users size={36} className="mx-auto mb-3 opacity-30"/>
              <p className="text-sm">{search || activeFilterCount > 0 ? 'No leads match your filters.' : 'No leads yet. Click + Add Lead to get started.'}</p>
            </div>
          ) : view === 'list' ? (
            <div className="space-y-1">
              <ListBatchControls
                hasPrev={hasPrev}
                hasMore={hasMore}
                pageSize={PAGE_SIZE}
                page={safeListPage}
                total={leads.length}
                selectedCount={selectedCount}
                visibleSelectedCount={visibleSelectedCount}
                onPrev={() => setListPage(p => p - 1)}
                onNext={() => setListPage(p => p + 1)}
              />
              {/* Select-all row */}
              <div className="flex items-center gap-2 px-1 py-1.5">
                <button
                  onClick={toggleVisible}
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
                  {selectedCount > 0 ? (
                    <>
                      {selectedCount} selected
                      {visibleSelectedCount > 0 && (
                        <span className="ml-2 text-gray-500 dark:text-gray-400">
                          {visibleSelectedCount} on this page
                        </span>
                      )}
                      {selectedCount < leads.length && (
                        <button onClick={selectAllFiltered} className="ml-2 text-green-600 dark:text-green-400 hover:underline font-medium">
                          Select all {leads.length}
                        </button>
                      )}
                      <button onClick={clearBulkSelection} className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:underline">
                        Clear
                      </button>
                    </>
                  ) : (
                    'Select this page'
                  )}
                </span>
              </div>
              {visibleLeads.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  selected={selectedIds.has(lead.id)}
                  onToggle={toggleOne}
                  onTagFilter={(tag) => setTagFilters((current) => current.includes(tag.id) ? current : [...current, tag.id])}
                />
              ))}
              <ListBatchControls
                hasPrev={hasPrev}
                hasMore={hasMore}
                pageSize={PAGE_SIZE}
                page={safeListPage}
                total={leads.length}
                selectedCount={selectedCount}
                visibleSelectedCount={visibleSelectedCount}
                onPrev={() => setListPage(p => p - 1)}
                onNext={() => setListPage(p => p + 1)}
              />
            </div>
          ) : (
            /* ── Board view — real kanban with drag-and-drop ── */
            <DndContext
              sensors={sensors}
              onDragStart={e => setDraggingId(e.active.id as string)}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setDraggingId(null)}
            >
              <div
                className="flex gap-3 overflow-x-auto pb-6 scroll-smooth"
                style={{ WebkitOverflowScrolling: 'touch' }}
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
                    <div key={stage.key} className="flex-shrink-0 w-[240px] flex flex-col">
                      {/* Column header */}
                      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl mb-2 shrink-0 shadow-sm', stage.color)}>
                        <Icon size={13} />
                        <span className="text-xs font-semibold">{stage.label}</span>
                        <span className="ml-auto text-[10px] font-bold opacity-75 px-1.5 py-0.5 bg-white/30 rounded-full">{stageLeads.length}</span>
                      </div>
                      {/* Droppable column — cards scroll independently */}
                      <DroppableKanbanColumn stageId={stage.key} isEmpty={stageLeads.length === 0}>
                        {visibleStageLeads.map(lead => (
                          <DraggableKanbanCard
                            key={lead.id}
                            lead={lead}
                            selectedIds={selectedIds}
                            ghostId={draggingId}
                          />
                        ))}
                      </DroppableKanbanColumn>
                      {/* Per-column pagination */}
                      {stageLeads.length > BOARD_PAGE_SIZE && (
                        <div className="flex items-center justify-between gap-1 pt-1 shrink-0">
                          <button
                            onClick={() => setColPage(colPage - 1)}
                            disabled={!colHasPrev}
                            className="flex-1 py-1 text-[11px] font-medium border border-gray-200 dark:border-gray-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 hover:text-green-600 hover:border-green-300"
                          >
                            ← Prev
                          </button>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap px-1">
                            {((colPage - 1) * BOARD_PAGE_SIZE + 1)}–{Math.min(colPage * BOARD_PAGE_SIZE, stageLeads.length)}
                          </span>
                          <button
                            onClick={() => setColPage(colPage + 1)}
                            disabled={!colHasNext}
                            className="flex-1 py-1 text-[11px] font-medium border border-gray-200 dark:border-gray-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 hover:text-green-600 hover:border-green-300"
                          >
                            Next →
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Floating drag overlay — professional drag UX */}
              <DragOverlay>
                {draggingId ? (() => {
                  const lead = leads.find(l => l.id === draggingId)
                  if (!lead) return null
                  return (
                    <div className="w-[232px] rounded-xl border-2 border-green-400 bg-white dark:bg-gray-800 shadow-2xl p-3 rotate-1 opacity-95">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">
                        {lead.first_name} {lead.last_name}
                      </p>
                      {lead.business_name && (
                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Building2 size={9} /> {lead.business_name}
                        </p>
                      )}
                    </div>
                  )
                })() : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        </div>
      )}

      {showFilters && (isLeadsView || isPipelineView) && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowFilters(false)}>
          <div className="flex h-full items-end justify-end md:items-stretch">
            <div
              className="flex h-[88vh] w-full max-w-none flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-gray-900 md:h-full md:max-w-md md:rounded-none"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Filters</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Keep the main view focused. Apply secondary filters here.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Stage</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Keep stage filtering inside the drawer instead of in the top bar.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[{ key: '', label: 'All stages' }, ...STAGES.map((stage) => ({ key: stage.key, label: stage.label }))].map((stage) => (
                      <button
                        key={stage.key || 'all-stages'}
                        type="button"
                        onClick={() => setStageFilter(stage.key)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          stageFilter === stage.key
                            ? 'border-green-600 bg-green-600 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                        )}
                      >
                        {stage.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Temperature</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Kept as an advanced filter only.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: '', label: 'All temperatures' },
                      { value: 'hot', label: 'Hot' },
                      { value: 'warm', label: 'Warm' },
                      { value: 'cold', label: 'Cold' },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setTemperatureFilter(option.value)}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-sm font-medium text-left transition-colors',
                          temperatureFilter === option.value
                            ? 'border-green-600 bg-green-600 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Call window</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Filter by calling eligibility.</p>
                  </div>
                  <div className="space-y-2">
                    {[
                      { value: '', label: 'Any call window' },
                      { value: 'callable_now', label: 'Callable now' },
                      { value: 'blocked_by_timezone', label: 'Blocked by timezone' },
                      { value: 'unknown_timezone', label: 'Unknown timezone' },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setCallabilityFilter(option.value)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                          callabilityFilter === option.value
                            ? 'border-green-600 bg-green-600 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                        )}
                      >
                        <span>{option.label}</span>
                        {callabilityFilter === option.value && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Owner</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Keep assignment filters off the main surface.</p>
                  </div>
                  <select
                    value={ownerFilter}
                    onChange={(event) => setOwnerFilter(event.target.value)}
                    className="input-field h-10 text-sm"
                  >
                    <option value="">Any owner</option>
                    <option value="unassigned">Unassigned</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>{owner.name}</option>
                    ))}
                  </select>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Disposition</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Filter by the latest call outcome when you need deeper triage.</p>
                  </div>
                  <select
                    value={dispositionFilter}
                    onChange={(event) => setDispositionFilter(event.target.value)}
                    className="input-field h-10 text-sm"
                  >
                    {DISPOSITION_FILTER_OPTIONS.map((option) => (
                      <option key={option.value || 'any-disposition'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Date-based filters</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Only surface due work when it matters.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setFollowUpDueOnly((value) => !value)}
                      className={cn(
                        'flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                        followUpDueOnly
                          ? 'border-green-600 bg-green-600 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      )}
                    >
                      <span>Follow-up due</span>
                      {followUpDueOnly && <CheckCircle2 size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCallbackDueOnly((value) => !value)}
                      className={cn(
                        'flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                        callbackDueOnly
                          ? 'border-green-600 bg-green-600 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      )}
                    >
                      <span>Callback due</span>
                      {callbackDueOnly && <CheckCircle2 size={14} />}
                    </button>
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Task state</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Only show leads with open follow-up work.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenTasksOnly((value) => !value)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                      openTasksOnly
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                    )}
                  >
                    <span>Open tasks only</span>
                    {openTasksOnly && <CheckCircle2 size={14} />}
                  </button>
                </section>

                {availableTags.length > 0 && (
                  <section className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tags</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Use include and exclude lists instead of always-visible tag controls.</p>
                    </div>
                    <div>
                      <label className="label">Included tags match</label>
                      <select
                        value={tagMode}
                        onChange={(event) => setTagMode(event.target.value as 'any' | 'all')}
                        className="input-field h-10 text-sm"
                      >
                        <option value="any">Match any selected tag</option>
                        <option value="all">Match all selected tags</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Include tags</p>
                      <div className="flex flex-wrap gap-2">
                        {availableTags.map((tag) => {
                          const selected = tagFilters.includes(tag.id)
                          return (
                            <button
                              key={`include-${tag.id}`}
                              type="button"
                              onClick={() => setTagFilters((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}
                              className={cn(
                                'rounded-full border px-2 py-1 transition-colors',
                                selected
                                  ? 'border-green-600 bg-green-50 dark:bg-green-950/30'
                                  : 'border-transparent bg-transparent'
                              )}
                            >
                              <TagBadge tag={tag} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Exclude tags</p>
                      <div className="flex flex-wrap gap-2">
                        {availableTags.map((tag) => {
                          const selected = excludeTagFilters.includes(tag.id)
                          return (
                            <button
                              key={`exclude-${tag.id}`}
                              type="button"
                              onClick={() => setExcludeTagFilters((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}
                              className={cn(
                                'rounded-full border px-2 py-1 transition-colors',
                                selected
                                  ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                                  : 'border-transparent bg-transparent'
                              )}
                            >
                              <TagBadge tag={tag} className={selected ? 'opacity-80' : ''} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                )}

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Other actions</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Link href="/admin/crm/import" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:text-gray-200">
                      <Upload size={14} />
                      Import
                    </Link>
                    <Link href="/admin/crm/campaign" target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:text-gray-200">
                      <Bot size={14} />
                      AI Campaign
                    </Link>
                    <button type="button" onClick={() => { setShowCleanup(true); setShowFilters(false) }} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:text-gray-200">
                      <Trash2 size={14} />
                      Cleanup
                    </button>
                  </div>
                </section>
              </div>

              <div className="border-t border-gray-100 px-4 py-2.5 dark:border-gray-800">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:text-gray-200"
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilters(false)}
                    className="btn-primary h-9 px-4 text-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Action Bar ── */}
      {selectedCount > 0 && (isLeadsView || isPipelineView) && (
        <div className="fixed bottom-16 sm:bottom-6 left-1/2 z-30 w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2">
          <BulkSelectionBar selectedCount={selectedCount} onSelectAll={selectAllFiltered} onClear={clearBulkSelection}>
            <div className="relative">
              <button
                onClick={() => setBulkStageOpen((current) => !current)}
                disabled={bulkLoading}
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Move stage
              </button>
              {bulkStageOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                  {STAGES.map((stage) => (
                    <button
                      key={stage.key}
                      type="button"
                      onClick={() => bulkUpdateStage(stage.key)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span className={cn('h-2 w-2 rounded-full', stage.dot)} />
                      {stage.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDispositionTarget({ mode: 'bulk' })}
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Disposition
            </button>
            <select
              value={bulkOwnerId}
              onChange={(event) => setBulkOwnerId(event.target.value)}
              className="rounded-xl border border-green-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">Select owner</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>{owner.name}</option>
              ))}
            </select>
            <button type="button" onClick={bulkAssignOwner} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Assign owner
            </button>
            <select
              value={bulkTagIds[0] ?? ''}
              onChange={(event) => setBulkTagIds(event.target.value ? [event.target.value] : [])}
              className="rounded-xl border border-green-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">Select tag</option>
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            <button type="button" onClick={() => bulkUpdateTags('add_tags')} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Add tag
            </button>
            <button type="button" onClick={() => bulkUpdateTags('remove_tags')} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Remove tag
            </button>
            <button type="button" onClick={bulkArchive} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Archive
            </button>
            <button type="button" onClick={bulkDelete} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">
              Delete
            </button>
          </BulkSelectionBar>
        </div>
      )}

      {dispositionTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setDispositionTarget(null)}>
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {dispositionTarget.mode === 'bulk' ? `Bulk disposition (${selectedCount})` : `Disposition: ${dispositionTarget.lead.first_name} ${dispositionTarget.lead.last_name}`}
                </h2>
                <p className="text-sm text-gray-500">Uses the same shared disposition workflow as the dialer and contact page.</p>
              </div>
              <button type="button" onClick={() => setDispositionTarget(null)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
                Close
              </button>
            </div>
            <CRMDispositionForm
              onSubmit={dispositionTarget.mode === 'bulk' ? bulkDisposition : saveSingleDisposition}
              submitting={dispositionSubmitting}
              error={dispositionError}
              lastDisposition={dispositionTarget.mode === 'bulk' ? null : {
                label: dispositionTarget.lead.last_call_outcome || dispositionTarget.lead.stage,
                at: dispositionTarget.lead.last_contacted_at ? formatDate(dispositionTarget.lead.last_contacted_at) : null,
                note: dispositionTarget.lead.latest_call_note || null,
              }}
            />
          </div>
        </div>
      )}

      {showNew && <NewLeadModal onClose={()=>setShowNew(false)} onCreated={handleCreated}/>}
      {showCleanup && <CleanupModal onClose={()=>setShowCleanup(false)} onDone={() => { setShowCleanup(false); load() }}/>}
    </div>
  )
}
