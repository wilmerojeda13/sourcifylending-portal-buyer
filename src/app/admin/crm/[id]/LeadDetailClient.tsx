'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Phone, Mail, Building2, Calendar, Edit3, Save,
  X, Loader2, MessageSquare, PhoneCall, CheckCircle2,
  Megaphone, Trash2, Ban, CalendarPlus, ExternalLink, Globe, MapPin,
  Copy, MessageCircle, Send, User, Tag, Clock, TrendingUp, AlertTriangle,
  Star, Zap, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import AnalyzerLivePanel from '@/components/admin/crm/AnalyzerLivePanel'

// ─── Types ────────────────────────────────────────────────────────────────────
type Stage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'demo_held' | 'follow_up' | 'closed_won' | 'closed_lost' | 'active_client'

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
  strategy_call_booked?: boolean
  converted_to_client?: boolean
  close_probability?: number | null
  last_call_outcome?: string | null
  last_call_at?: string | null
  callback_due_at?: string | null
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
  readiness_score?: number | null
  readiness_status?: string | null
  assigned_program?: 'program_a' | 'program_b' | 'program_c' | null
  estimated_funding_range?: string | null
  risk_flags?: string[] | null
  analyzer_summary?: string | null
  analyzer_answers?: Record<string, unknown> | null
  analyzer_score_breakdown?: Record<string, unknown> | null
  duplicate_review_required?: boolean
  duplicate_review_reason?: string | null
  assigned_to_name?: string | null
  assigned_to_user_id?: string | null
  sms_sent_count?: number
  sms_delivered_count?: number
  sms_clicked_count?: number
  inbound_reply_count?: number
  unread_conversation_count?: number
  last_sms_sent_at?: string | null
  last_sms_status?: string | null
  last_sms_clicked_at?: string | null
  last_inbound_reply_at?: string | null
  sms_account_created?: boolean
  sms_account_created_at?: string | null
  do_not_call: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
}

interface SmsMessage {
  id: string
  lead_id: string
  phone_number: string
  message_body: string
  direction: 'outbound' | 'inbound'
  status: string
  delivery_status: string | null
  clicked: boolean
  unread: boolean
  parent_sms_id: string | null
  sent_at: string | null
  delivered_at: string | null
  clicked_at: string | null
  read_at: string | null
  created_at: string
  updated_at: string
}

interface Activity {
  id: string
  lead_id: string
  type: string
  body: string | null
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
}

interface CallRecord {
  id: string
  call_started_at: string
  duration_seconds: number | null
  call_outcome: string
  notes: string | null
  next_follow_up_at: string | null
  lead_temperature: string | null
  strategy_call_booked: boolean
  converted_to_client: boolean
}

interface TaskRecord {
  id: string
  title: string
  task_type: string
  priority: string
  status: string
  due_at: string | null
  notes: string | null
}

interface Props {
  lead: CRMLead
  activities: Activity[]
  calls: CallRecord[]
  tasks: TaskRecord[]
  invites: Array<{
    id: string
    invite_type: 'portal' | 'pre_analyzer'
    status: string
    email: string
    sent_at: string | null
    opened_at: string | null
    clicked_at: string | null
    account_created_at: string | null
      analyzer_started_at: string | null
      analyzer_submitted_at: string | null
  }>
  smsMessages: SmsMessage[]
  adminEmail: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const STAGES: { key: Stage; label: string; color: string; bgColor: string }[] = [
  { key: 'new',            label: 'New',           color: 'text-gray-700 dark:text-gray-300', bgColor: 'bg-gray-100 dark:bg-gray-800' },
  { key: 'contacted',      label: 'Contacted',     color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/40' },
  { key: 'qualified',      label: 'Qualified',     color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/40' },
  { key: 'demo_scheduled', label: 'Demo Scheduled',color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-100 dark:bg-purple-900/40' },
  { key: 'demo_held',      label: 'Demo Held',     color: 'text-indigo-700 dark:text-indigo-300', bgColor: 'bg-indigo-100 dark:bg-indigo-900/40' },
  { key: 'follow_up',      label: 'Follow Up',     color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-900/40' },
  { key: 'active_client',  label: 'Active Client', color: 'text-teal-700 dark:text-teal-300', bgColor: 'bg-teal-100 dark:bg-teal-900/40' },
  { key: 'closed_won',     label: 'Closed Won',    color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/40' },
  { key: 'closed_lost',    label: 'Closed Lost',   color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/40' },
]

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  note:         MessageSquare,
  call:         PhoneCall,
  stage_change: CheckCircle2,
  email:        Mail,
  sms:          MessageCircle,
  voicemail:    Phone,
  follow_up_set: Calendar,
}

const ACTIVITY_COLORS: Record<string, string> = {
  note:          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  call:          'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  stage_change:  'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
  email:         'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  sms:           'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  voicemail:     'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  follow_up_set: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400',
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatDateTimeLocal(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatAnswerValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  if (value == null || value === '') return '—'
  return String(value)
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success('Copied to clipboard')
  }).catch(() => {
    toast.error('Failed to copy')
  })
}

function buildCallabilityLabel(lead: CRMLead) {
  if (lead.call_window_status === 'callable_now') return 'Callable Now'
  if (lead.call_window_status === 'blocked_by_timezone') {
    return `Blocked Until ${lead.blocked_until_label ?? ''}`.trim()
  }
  return lead.timezone_reason_label ? `Unknown: ${lead.timezone_reason_label}` : 'Unknown Timezone'
}

// ─── Send Email Modal ──────────────────────────────────────────────────────────
function SendEmailModal({ lead, onClose, onSent }: { lead: CRMLead; onClose: () => void; onSent: (subject: string) => void }) {
  const program = lead.program_interest
    ? { program_a: 'Program A', program_b: 'Program B', program_c: 'Program C' }[lead.program_interest]
    : null

  const [subject, setSubject] = useState(`Following up — SourcifyLending`)
  const [body, setBody]       = useState(
    `Hi ${lead.first_name},\n\nI wanted to follow up regarding your interest in ${program ? `our ${program}` : 'our credit fulfillment program'}.\n\nWould you have 20–30 minutes this week for a quick demo?\n\nBest,\nSourcifyLending Team`
  )

  function openGmail() {
    if (!lead.email) return
    const params = new URLSearchParams({ view: 'cm', to: lead.email, su: subject, body })
    window.open(`https://mail.google.com/mail/?${params}`, '_blank')
    onSent(subject)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Mail size={17} className="text-blue-500" />
            <h2 className="font-bold text-gray-900">Send Email</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5 text-sm">
            <span className="text-gray-400 text-xs font-medium">To: </span>
            <span className="text-gray-900 font-medium">{lead.first_name} {lead.last_name}</span>
            <span className="text-gray-400 ml-2">{'<'}{lead.email}{'>'}</span>
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input-field" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="label">Body</label>
            <textarea className="input-field min-h-[180px] resize-y text-sm" value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex gap-2 text-xs text-blue-700 dark:text-blue-300">
            <ExternalLink size={13} className="shrink-0 mt-0.5" />
            <span>Opens Gmail in a new tab with this email pre-filled.</span>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={openGmail} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Mail size={15} /> Open in Gmail
            </button>
            <button onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Book Demo Modal ───────────────────────────────────────────────────────────
function BookDemoModal({ lead, onClose, onBooked }: { lead: CRMLead; onClose: () => void; onBooked: () => void }) {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const defaultDT = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`

  const [dateTime, setDateTime] = useState(defaultDT)
  const [duration, setDuration] = useState(30)
  const [notes, setNotes]       = useState('')

  function buildGCalUrl(startIso: string, durationMins: number): string {
    function toGCal(iso: string) {
      return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('Z', '')
    }
    const start = new Date(startIso)
    const end   = new Date(start.getTime() + durationMins * 60 * 1000)
    const program = lead.program_interest
      ? { program_a: 'Program A', program_b: 'Program B', program_c: 'Program C' }[lead.program_interest]
      : null
    const details = [
      `Lead: ${lead.first_name} ${lead.last_name}`,
      `Phone: ${lead.phone}`,
      lead.email        ? `Email: ${lead.email}`          : null,
      lead.business_name? `Business: ${lead.business_name}` : null,
      program           ? `Program Interest: ${program}`  : null,
      notes             ? `\nNotes: ${notes}`             : null,
    ].filter(Boolean).join('\n')
    const params = new URLSearchParams({
      action:  'TEMPLATE',
      text:    `Demo: ${lead.first_name} ${lead.last_name}${lead.business_name ? ` — ${lead.business_name}` : ''} | SourcifyLending`,
      dates:   `${toGCal(start.toISOString())}/${toGCal(end.toISOString())}`,
      details,
      sf:      'true',
      ...(lead.email ? { add: lead.email } : {}),
    })
    return `https://calendar.google.com/calendar/render?${params}`
  }

  function confirm() {
    if (!dateTime) { toast.error('Please pick a date and time'); return }
    const startIso = new Date(dateTime).toISOString()
    const url = buildGCalUrl(startIso, duration)
    window.open(url, '_blank')
    onBooked()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <CalendarPlus size={18} className="text-green-600" />
            <h2 className="font-bold text-gray-900">Book Demo</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-sm">
            <p className="font-semibold text-gray-900">{lead.first_name} {lead.last_name}</p>
            {lead.business_name && <p className="text-gray-500 text-xs">{lead.business_name}</p>}
            <p className="text-gray-500 text-xs mt-0.5">{lead.phone}</p>
          </div>
          <div>
            <label className="label">Date & Time *</label>
            <input className="input-field" type="datetime-local" value={dateTime} onChange={e => setDateTime(e.target.value)} />
          </div>
          <div>
            <label className="label">Duration</label>
            <select className="input-field" value={duration} onChange={e => setDuration(Number(e.target.value))}>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={confirm} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <CalendarPlus size={15} /> Open Google Calendar
            </button>
            <button onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function LeadDetailClient({ lead: initialLead, activities: initialActivities, calls: initialCalls, tasks: initialTasks, invites, smsMessages: initialSmsMessages, adminEmail }: Props) {
  const router = useRouter()
  const [lead, setLead]               = useState(initialLead)
  const [activities, setActivities]   = useState(initialActivities)
  const [calls, setCalls]             = useState(initialCalls)
  const [tasks, setTasks]             = useState(initialTasks)
  const [smsMessages, setSmsMessages] = useState(initialSmsMessages)
  const [editing, setEditing]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [noteText, setNoteText]       = useState('')
  const [addingNote, setAddingNote]   = useState(false)
  const [noteType, setNoteType]       = useState<'note' | 'call' | 'email' | 'sms' | 'voicemail'>('note')
  const [showBookDemo, setShowBookDemo]   = useState(false)
  const [showEmail, setShowEmail]         = useState(false)
  const [taskTitle, setTaskTitle]         = useState('')
  const [taskDueAt, setTaskDueAt]         = useState('')
  const [taskPriority, setTaskPriority]   = useState('High')
  const [taskSaving, setTaskSaving]       = useState(false)
  const [authorizingCall, setAuthorizingCall] = useState(false)
  const [smsReplyBody, setSmsReplyBody] = useState('')
  const [sendingSmsReply, setSendingSmsReply] = useState(false)
  const [duplicateLeads, setDuplicateLeads] = useState<{id: string, first_name: string, last_name: string, stage: string}[]>([])
  const [editForm, setEditForm]         = useState({
    first_name:       lead.first_name,
    last_name:        lead.last_name,
    phone:            lead.phone,
    email:            lead.email ?? '',
    business_name:    lead.business_name ?? '',
    program_interest: lead.program_interest ?? '',
    source:           lead.source,
    notes:            lead.notes ?? '',
    follow_up_at:     formatDateTimeLocal(lead.follow_up_at),
  })

  const latestPortalInvite = invites.find(invite => invite.invite_type === 'portal') ?? null
  const latestPreAnalyzerInvite = invites.find(invite => invite.invite_type === 'pre_analyzer') ?? null
  const stageInfo = STAGES.find(s => s.key === lead.stage) ?? STAGES[0]
  const pastDue = lead.follow_up_at && new Date(lead.follow_up_at) < new Date()

  function setEF<K extends keyof typeof editForm>(k: K, v: typeof editForm[K]) {
    setEditForm(p => ({ ...p, [k]: v }))
  }

  // Check for duplicate phone leads
  useEffect(() => {
    if (!lead.phone) return
    fetch(`/api/admin/crm/leads?search=${encodeURIComponent(lead.phone)}&limit=10`)
      .then(r => r.json())
      .then(json => {
        const dupes = (json.leads ?? []).filter((l: { id: string }) => l.id !== lead.id)
        setDuplicateLeads(dupes)
      })
      .catch(() => {})
  }, [lead.phone, lead.id])

  async function sendSmsReply() {
    if (!smsReplyBody.trim() || sendingSmsReply) return
    setSendingSmsReply(true)
    try {
      const latestThreadMessage = smsMessages[0] ?? null
      const res = await fetch(`/api/admin/crm/leads/${lead.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_body: smsReplyBody.trim(),
          template_key: 'reply',
          parent_sms_id: latestThreadMessage?.id ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to send text reply')
        return
      }
      if (json.sms) setSmsMessages(current => [json.sms, ...current])
      if (json.sms_summary) setLead(current => ({ ...current, ...json.sms_summary }))
      const activityRes = await fetch(`/api/admin/crm/activities?lead_id=${lead.id}`)
      const activityJson = await activityRes.json()
      setActivities(activityJson.activities ?? [])
      setSmsReplyBody('')
      toast.success('Text reply sent')
    } catch {
      toast.error('Failed to send text reply')
    } finally {
      setSendingSmsReply(false)
    }
  }

  async function authorizeDial() {
    setAuthorizingCall(true)
    try {
      const res = await fetch('/api/admin/crm/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.allowed) {
        if (json.call_window_message) {
          setLead(prev => ({ ...prev, ...json }))
        }
        toast.error(json.error ?? 'This number is blocked.')
        return
      }
      setLead(prev => ({ ...prev, ...json }))
      window.open(`tel:${json.phone_e164 || lead.phone}`, '_blank')
    } catch {
      toast.error('Unable to verify the calling window.')
    } finally {
      setAuthorizingCall(false)
    }
  }

  async function refreshTasks() {
    const res = await fetch(`/api/admin/crm/tasks?lead_id=${lead.id}`)
    const json = await res.json()
    setTasks(json.tasks ?? [])
  }

  async function changeStage(newStage: Stage) {
    if (newStage === lead.stage) return
    const oldLabel = STAGES.find(s => s.key === lead.stage)?.label
    const newLabel = STAGES.find(s => s.key === newStage)?.label
    const res = await fetch(`/api/admin/crm/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
    if (!res.ok) { toast.error('Failed to update stage'); return }
    const { lead: updated } = await res.json()
    setLead(updated)
    await fetch('/api/admin/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: lead.id,
        type: 'stage_change',
        body: `Stage changed from ${oldLabel} → ${newLabel}`,
        created_by: adminEmail,
      }),
    })
    const actRes = await fetch(`/api/admin/crm/activities?lead_id=${lead.id}`)
    const actJson = await actRes.json()
    setActivities(actJson.activities ?? [])
    toast.success(`Moved to ${newLabel}`)
  }

  async function createTask() {
    if (!taskTitle.trim()) { toast.error('Task title is required'); return }
    setTaskSaving(true)
    const res = await fetch('/api/admin/crm/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: lead.id,
        title: taskTitle,
        task_type: 'Follow-Up',
        priority: taskPriority,
        due_at: taskDueAt || null,
        pipeline_stage: lead.stage,
      }),
    })
    setTaskSaving(false)
    if (!res.ok) { toast.error('Unable to create task'); return }
    setTaskTitle('')
    setTaskDueAt('')
    toast.success('Task created')
    refreshTasks()
  }

  async function completeTask(taskId: string) {
    const res = await fetch(`/api/admin/crm/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Done' }),
    })
    if (!res.ok) { toast.error('Unable to complete task'); return }
    toast.success('Task completed')
    refreshTasks()
  }

  async function saveEdits() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          email:            editForm.email || null,
          business_name:    editForm.business_name || null,
          program_interest: editForm.program_interest || null,
          follow_up_at:     editForm.follow_up_at || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Save failed'); return }
      setLead(json.lead)
      setEditing(false)
      toast.success('Lead updated')
    } finally {
      setSaving(false)
    }
  }

  async function addActivity() {
    if (!noteText.trim()) return
    setAddingNote(true)
    try {
      const res = await fetch('/api/admin/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, type: noteType, body: noteText }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to log activity'); return }
      setActivities(p => [json.activity, ...p])
      setNoteText('')
      toast.success('Activity logged')
    } finally {
      setAddingNote(false)
    }
  }

  async function toggleDNC() {
    const res = await fetch(`/api/admin/crm/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ do_not_call: !lead.do_not_call }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error('Failed'); return }
    setLead(json.lead)
    toast.success(json.lead.do_not_call ? 'Marked as Do Not Call' : 'DNC removed')
  }

  async function deleteLead() {
    if (!confirm(`Delete ${lead.first_name} ${lead.last_name}? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/crm/leads/${lead.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Delete failed'); return }
    toast.success('Lead deleted')
    router.push('/admin/crm')
  }

  async function handleEmailSent(subject: string) {
    await fetch('/api/admin/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, type: 'email', body: `Email sent — Subject: "${subject}"`, created_by: adminEmail }),
    })
    const actRes = await fetch(`/api/admin/crm/activities?lead_id=${lead.id}`)
    const actJson = await actRes.json()
    setActivities(actJson.activities ?? [])
    toast.success('Email opened in Gmail')
  }

  async function handleDemoBooked() {
    if (lead.stage !== 'demo_scheduled') {
      const res = await fetch(`/api/admin/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'demo_scheduled' }),
      })
      if (res.ok) {
        const { lead: updated } = await res.json()
        setLead(updated)
      }
    }
    await fetch('/api/admin/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, type: 'stage_change', body: 'Demo booked — Google Calendar event created', created_by: adminEmail }),
    })
    const actRes = await fetch(`/api/admin/crm/activities?lead_id=${lead.id}`)
    const actJson = await actRes.json()
    setActivities(actJson.activities ?? [])
    toast.success('Demo booked! Check your Google Calendar.')
  }

  const openTasks = tasks.filter(t => t.status !== 'Done')
  const recentCalls = calls.slice(0, 5)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 px-3 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-4 sm:py-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/admin/crm" className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-700 font-medium shrink-0">
              <ChevronLeft size={18}/> <span className="hidden sm:inline">Leads</span>
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleDNC} className={cn('flex h-8 items-center justify-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors', lead.do_not_call ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 dark:border-gray-700 text-gray-500')}>
              <Ban size={12}/><span className="hidden sm:inline">DNC</span>
            </button>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="btn-secondary flex h-8 items-center gap-1 px-2.5 text-xs sm:px-3">
                <Edit3 size={13}/> <span className="hidden sm:inline">Edit</span>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={saveEdits} disabled={saving} className="btn-primary flex h-8 items-center gap-1 px-2.5 text-xs sm:px-3">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} <span className="hidden sm:inline">Save</span>
                </button>
                <button onClick={() => setEditing(false)} className="btn-secondary flex h-8 w-8 items-center justify-center px-0 text-xs"><X size={13}/></button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Duplicate Warning ── */}
      {duplicateLeads.length > 0 && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-900/20">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              ⚠️ Duplicate phone — {duplicateLeads.length} other lead{duplicateLeads.length > 1 ? 's' : ''} share this number:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {duplicateLeads.map(d => (
                <Link key={d.id} href={`/admin/crm/${d.id}`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-800/40 dark:text-amber-200">
                  {d.first_name} {d.last_name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Header Section ── */}
      <div className="mx-auto max-w-6xl px-4 py-4">
        {/* Header: Name, Business, Stage, Owner, Source, Last Activity */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 text-green-700 font-bold text-xl">
            {lead.first_name[0]}{lead.last_name?.[0] ?? ''}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {lead.first_name} {lead.last_name}
              </h1>
              {lead.do_not_call && <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">DNC</span>}
            </div>
            {lead.business_name && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <Building2 size={13}/> {lead.business_name}
              </p>
            )}
            {/* Header metadata row */}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
              <span className={cn('px-2 py-0.5 rounded-full font-medium', stageInfo.bgColor, stageInfo.color)}>
                {stageInfo.label}
              </span>
              {lead.assigned_to_name && (
                <span className="flex items-center gap-1"><User size={11}/> {lead.assigned_to_name}</span>
              )}
              <span className="flex items-center gap-1"><Tag size={11}/> {lead.source}</span>
              <span className="flex items-center gap-1"><Clock size={11}/> Added {formatDateTime(lead.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Stage quick-switcher */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-4">
          {STAGES.map(s => (
            <button key={s.key} onClick={() => changeStage(s.key)}
              className={cn('shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap',
                lead.stage === s.key ? cn(s.bgColor, s.color, 'border-current') : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400')}>
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Primary Contact Bar ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Contact Info */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-3">
                <a href={`tel:${lead.phone}`} className="text-base font-semibold text-green-600 hover:text-green-700 flex items-center gap-2">
                  <Phone size={18}/> {lead.phone}
                </a>
                <button onClick={() => copyToClipboard(lead.phone)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                  <Copy size={14}/>
                </button>
              </div>
              {lead.email && (
                <div className="flex items-center gap-3">
                  <a href={`mailto:${lead.email}`} className="text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 flex items-center gap-2">
                    <Mail size={16}/> {lead.email}
                  </a>
                  <button onClick={() => lead.email && copyToClipboard(lead.email)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                    <Copy size={14}/>
                  </button>
                </div>
              )}
              {lead.likely_timezone && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin size={14}/> {lead.likely_timezone} {lead.timezone_abbreviation && `(${lead.timezone_abbreviation})`}
                  <span className={cn('ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                    lead.call_window_status === 'callable_now' ? 'bg-green-100 text-green-700' :
                    lead.call_window_status === 'blocked_by_timezone' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600')}>
                    {buildCallabilityLabel(lead)}
                  </span>
                </div>
              )}
            </div>
            {/* Quick Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={authorizeDial} disabled={authorizingCall || lead.call_window_status === 'blocked_by_timezone' || lead.call_window_status === 'unknown_timezone'}
                className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors',
                  authorizingCall ? 'bg-gray-300 text-gray-600 cursor-not-allowed' :
                  'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white')}>
                {authorizingCall ? <Loader2 size={16} className="animate-spin"/> : <Phone size={16}/>} Call
              </button>
              {lead.email && (
                <button onClick={() => setShowEmail(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                  <Mail size={16}/> Email
                </button>
              )}
              <button onClick={() => setShowBookDemo(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors">
                <CalendarPlus size={16}/> Demo
              </button>
            </div>
          </div>
        </div>

        {/* ── Two-Column Layout ── */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left Column: Analyzer, Notes, Activity */}
          <div className="lg:col-span-2 space-y-4">
            {/* Live Analyzer Panel */}
            <AnalyzerLivePanel leadId={lead.id} sourceContext="lead_detail" />

            {/* Notes Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <h2 className="font-bold text-gray-900 dark:text-white mb-3 text-sm">Notes</h2>
              {!editing ? (
                lead.notes ? (
                  <p className="text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded-xl p-3 leading-relaxed">{lead.notes}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">No notes yet</p>
                )
              ) : (
                <textarea className="input-field min-h-[100px] resize-y text-sm" value={editForm.notes} onChange={e => setEF('notes', e.target.value)} placeholder="Add notes..." />
              )}
            </div>

            {/* Activity Timeline */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <h2 className="font-bold text-gray-900 dark:text-white mb-3 text-sm">Activity</h2>
              {/* Quick add */}
              <div className="space-y-2 mb-4">
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {(['note','call','email','sms','voicemail'] as const).map(t => (
                    <button key={t} onClick={() => setNoteType(t)}
                      className={cn('shrink-0 text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors',
                        noteType === t ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400')}>{t}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <textarea className="input-field flex-1 min-h-[60px] resize-none text-sm" placeholder={`Log a ${noteType}...`} value={noteText} onChange={e => setNoteText(e.target.value)}/>
                  <button onClick={addActivity} disabled={!noteText.trim() || addingNote} className="btn-primary px-4 self-end text-sm flex items-center gap-1">
                    {addingNote && <Loader2 size={13} className="animate-spin"/>} Log
                  </button>
                </div>
              </div>
              {/* Timeline */}
              {activities.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {activities.map(act => {
                    const Icon = ACTIVITY_ICONS[act.type] ?? MessageSquare
                    const colorClass = ACTIVITY_COLORS[act.type] ?? ACTIVITY_COLORS.note
                    return (
                      <div key={act.id} className="flex gap-3">
                        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5', colorClass)}><Icon size={13}/></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-gray-700 capitalize">{act.type.replace('_',' ')}</span>
                            <span className="text-xs text-gray-400">{formatDateTime(act.created_at)}</span>
                          </div>
                          {act.body && <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{act.body}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Recent Calls */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">Recent Calls</h2>
                <Link href="/admin/crm/calls" className="text-xs font-medium text-green-600 hover:text-green-700">View all</Link>
              </div>
              {recentCalls.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No calls logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentCalls.map(call => (
                    <div key={call.id} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                      <div>
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{call.call_outcome}</p>
                        <p className="text-xs text-gray-500">{formatDateTime(call.call_started_at)}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        {call.duration_seconds && <p>{Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</p>}
                        <p className="capitalize">{call.lead_temperature || 'cold'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-4">
            {/* Follow-up Status */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Follow-up</h3>
              {lead.follow_up_at ? (
                <div className="space-y-2">
                  <div className={cn('flex items-center gap-2 text-sm', pastDue ? 'text-red-600' : 'text-gray-700 dark:text-gray-200')}>
                    <Clock size={14}/> {formatDateTime(lead.follow_up_at)}
                    {pastDue && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">OVERDUE</span>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No follow-up scheduled</p>
              )}
            </div>

            {/* Readiness Score */}
            {typeof lead.readiness_score === 'number' && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Readiness</h3>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{lead.readiness_score}</div>
                  <div className="flex-1">
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${lead.readiness_score}%` }}/>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{lead.readiness_status || 'No status'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Program Status */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Program</h3>
              {lead.assigned_program ? (
                <div className="space-y-2">
                  <span className={cn('badge text-sm px-3 py-1',
                    lead.assigned_program === 'program_a' ? 'bg-green-100 text-green-700' :
                    lead.assigned_program === 'program_b' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-blue-100 text-blue-700')}>
                    {lead.assigned_program.replace('_', ' ').replace('program', 'Program ').toUpperCase()}
                  </span>
                  {lead.estimated_funding_range && <p className="text-sm text-gray-600">Est: {lead.estimated_funding_range}</p>}
                </div>
              ) : lead.program_interest ? (
                <span className="badge bg-gray-100 text-gray-600 text-sm px-3 py-1">
                  Interest: {lead.program_interest.replace('_', ' ')}
                </span>
              ) : (
                <p className="text-sm text-gray-400">No program assigned</p>
              )}
            </div>

            {/* Tasks */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tasks</h3>
              <div className="space-y-2 mb-3">
                <input className="input-field text-sm" placeholder="New task..." value={taskTitle} onChange={e => setTaskTitle(e.target.value)}/>
                <div className="flex gap-2">
                  <input className="input-field text-sm flex-1" type="datetime-local" value={taskDueAt} onChange={e => setTaskDueAt(e.target.value)} placeholder="Due"/>
                  <button onClick={createTask} disabled={taskSaving} className="btn-primary px-3 text-sm">{taskSaving ? '...' : '+'}</button>
                </div>
              </div>
              {openTasks.length === 0 ? (
                <p className="text-sm text-gray-400">No open tasks</p>
              ) : (
                <div className="space-y-2">
                  {openTasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700 dark:text-gray-200 truncate">{task.title}</span>
                      <button onClick={() => completeTask(task.id)} className="text-green-600 hover:text-green-700 font-medium shrink-0">Done</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Risk Flags */}
            {(lead.risk_flags?.length ?? 0) > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-amber-200 dark:border-amber-800 p-4">
                <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-1">
                  <AlertTriangle size={12}/> Risk Flags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {lead.risk_flags?.map(flag => (
                    <span key={flag} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{flag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Facts / Tags */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Facts</h3>
              <div className="space-y-2 text-sm">
                {lead.lead_temperature && (
                  <div className="flex justify-between"><span className="text-gray-500">Temperature</span><span className={cn('font-medium capitalize',
                    lead.lead_temperature === 'hot' ? 'text-red-500' :
                    lead.lead_temperature === 'warm' ? 'text-amber-500' : 'text-blue-500')}>{lead.lead_temperature}</span></div>
                )}
                {lead.close_probability != null && (
                  <div className="flex justify-between"><span className="text-gray-500">Close Prob.</span><span className="font-medium">{lead.close_probability}%</span></div>
                )}
                {lead.strategy_call_booked && <div className="text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={12}/> Strategy Call Booked</div>}
                {lead.converted_to_client && <div className="text-teal-600 font-medium flex items-center gap-1"><CheckCircle2 size={12}/> Converted to Client</div>}
                {lead.last_contacted_at && <div className="flex justify-between"><span className="text-gray-500">Last Contact</span><span className="text-gray-700">{formatDateTime(lead.last_contacted_at)}</span></div>}
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        {editing && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 mt-4">
            <h2 className="font-bold text-gray-900 dark:text-white mb-4 text-sm">Edit Contact</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">First Name</label><input className="input-field" value={editForm.first_name} onChange={e => setEF('first_name', e.target.value)}/></div>
              <div><label className="label">Last Name</label><input className="input-field" value={editForm.last_name} onChange={e => setEF('last_name', e.target.value)}/></div>
              <div><label className="label">Phone</label><input className="input-field" type="tel" value={editForm.phone} onChange={e => setEF('phone', e.target.value)}/></div>
              <div><label className="label">Email</label><input className="input-field" type="email" value={editForm.email} onChange={e => setEF('email', e.target.value)}/></div>
              <div className="col-span-2"><label className="label">Business Name</label><input className="input-field" value={editForm.business_name} onChange={e => setEF('business_name', e.target.value)}/></div>
              <div><label className="label">Source</label><select className="input-field" value={editForm.source} onChange={e => setEF('source', e.target.value)}>{['manual','analyzer','affiliate','facebook','purchased','referral','inbound','other'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></div>
              <div><label className="label">Program</label><select className="input-field" value={editForm.program_interest} onChange={e => setEF('program_interest', e.target.value)}><option value="">Unknown</option><option value="program_a">Program A</option><option value="program_b">Program B</option><option value="program_c">Program C</option></select></div>
              <div className="col-span-2"><label className="label">Follow-up Date</label><input className="input-field" type="datetime-local" value={editForm.follow_up_at} onChange={e => setEF('follow_up_at', e.target.value)}/></div>
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <button onClick={deleteLead} className="w-full text-xs text-red-400 hover:text-red-600 py-4 mt-4 flex items-center justify-center gap-1.5 transition-colors">
          <Trash2 size={13}/> Delete this lead
        </button>
      </div>

      {/* ── Sticky Bottom Actions (Mobile) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:hidden">
        <div className="flex gap-2">
          <button onClick={authorizeDial} disabled={authorizingCall} className={cn('flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm', authorizingCall ? 'bg-gray-300' : 'bg-green-600 text-white')}>
            {authorizingCall ? <Loader2 size={16} className="animate-spin"/> : <Phone size={16}/>} Call
          </button>
          {lead.email && (
            <button onClick={() => setShowEmail(true)} className="flex-1 h-10 btn-secondary flex items-center justify-center gap-1.5 font-semibold text-sm">
              <Mail size={16}/> Email
            </button>
          )}
          <button onClick={() => setShowBookDemo(true)} className="flex-1 h-10 btn-secondary flex items-center justify-center gap-1.5 font-semibold text-sm">
            <CalendarPlus size={16}/> Demo
          </button>
        </div>
      </div>

      {showBookDemo && <BookDemoModal lead={lead} onClose={() => setShowBookDemo(false)} onBooked={handleDemoBooked}/>}
      {showEmail && <SendEmailModal lead={lead} onClose={() => setShowEmail(false)} onSent={handleEmailSent}/>}
    </div>
  )
}
