'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CRMBackButton } from '@/components/ui/SmartBackButton'
import {
  Phone, Mail, Building2, Calendar, Edit3, Save,
  X, Loader2, MessageSquare, PhoneCall, CheckCircle2,
  Megaphone, Trash2, Ban, CalendarPlus, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

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
const STAGES: { key: Stage; label: string; color: string }[] = [
  { key: 'new',            label: 'New',           color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { key: 'contacted',      label: 'Contacted',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { key: 'qualified',      label: 'Qualified',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { key: 'demo_scheduled', label: 'Demo Scheduled',color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  { key: 'demo_held',      label: 'Demo Held',     color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  { key: 'follow_up',      label: 'Follow Up',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  { key: 'active_client',  label: 'Active Client', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
  { key: 'closed_won',     label: 'Closed Won',    color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  { key: 'closed_lost',    label: 'Closed Lost',   color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
]

const PROGRAMS = [
  { value: 'program_a', label: 'Program A', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  { value: 'program_b', label: 'Program B', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'program_c', label: 'Program C', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
]

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  note:         MessageSquare,
  call:         PhoneCall,
  stage_change: CheckCircle2,
  email:        Mail,
  sms:          MessageSquare,
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

// ─── Send Email Modal (opens Gmail compose) ───────────────────────────────────
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
            <span className="text-gray-400 ml-2">&lt;{lead.email}&gt;</span>
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
            <span>Opens Gmail in a new tab with this email pre-filled. The activity will be logged automatically.</span>
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

// ─── Google Calendar URL builder ──────────────────────────────────────────────
function buildGCalUrl(lead: CRMLead, startIso: string, durationMins: number, meetingNotes: string): string {
  // Format: YYYYMMDDTHHmmss (local time, no Z)
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
    meetingNotes      ? `\nNotes: ${meetingNotes}`      : null,
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

// ─── Book Demo Modal ───────────────────────────────────────────────────────────
function BookDemoModal({
  lead, onClose, onBooked,
}: {
  lead: CRMLead
  onClose: () => void
  onBooked: (startIso: string, durationMins: number) => void
}) {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0) // round to next 15 min
  const pad = (n: number) => n.toString().padStart(2, '0')
  const defaultDT = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`

  const [dateTime, setDateTime] = useState(defaultDT)
  const [duration, setDuration] = useState(30)
  const [notes, setNotes]       = useState('')

  function confirm() {
    if (!dateTime) { toast.error('Please pick a date and time'); return }
    const startIso = new Date(dateTime).toISOString()
    const url = buildGCalUrl(lead, startIso, duration, notes)
    window.open(url, '_blank')
    onBooked(startIso, duration)
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-sm">
            <p className="font-semibold text-gray-900">{lead.first_name} {lead.last_name}</p>
            {lead.business_name && <p className="text-gray-500 text-xs">{lead.business_name}</p>}
            <p className="text-gray-500 text-xs mt-0.5">{lead.phone}</p>
          </div>

          <div>
            <label className="label">Date & Time *</label>
            <input
              className="input-field"
              type="datetime-local"
              value={dateTime}
              onChange={e => setDateTime(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Duration</label>
            <select className="input-field" value={duration} onChange={e => setDuration(Number(e.target.value))}>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
            </select>
          </div>

          <div>
            <label className="label">Meeting Notes (optional)</label>
            <textarea
              className="input-field min-h-[72px] resize-none text-sm"
              placeholder="Anything to include in the calendar event..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex gap-2 text-xs text-blue-700 dark:text-blue-300">
            <ExternalLink size={13} className="shrink-0 mt-0.5" />
            <span>This will open Google Calendar in a new tab with the event pre-filled. The lead will be moved to <strong>Demo Scheduled</strong> automatically.</span>
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatDateTimeLocal(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function buildDetailCallStatusLabel(lead: CRMLead) {
  if (lead.call_window_status === 'callable_now') return 'Callable Now'
  if (lead.call_window_status === 'blocked_by_timezone') {
    return `Blocked Until ${lead.blocked_until_label ?? ''}`.trim()
  }
  return lead.timezone_reason_label ? `Unknown: ${lead.timezone_reason_label}` : 'Unknown Timezone'
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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
  const [duplicateLeads, setDuplicateLeads] = useState<{id: string, first_name: string, last_name: string, stage: string}[]>([])

  // Check for duplicate phone leads on mount
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
  const [taskPriority, setTaskPriority]   = useState('High')
  const [taskSaving, setTaskSaving]       = useState(false)
  const [authorizingCall, setAuthorizingCall] = useState(false)
  const [smsReplyBody, setSmsReplyBody] = useState('')
  const [sendingSmsReply, setSendingSmsReply] = useState(false)
  const latestPortalInvite = invites.find(invite => invite.invite_type === 'portal') ?? null
  const latestPreAnalyzerInvite = invites.find(invite => invite.invite_type === 'pre_analyzer') ?? null
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

  function setEF<K extends keyof typeof editForm>(k: K, v: typeof editForm[K]) {
    setEditForm(p => ({ ...p, [k]: v }))
  }

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

      if (json.sms) {
        setSmsMessages(current => [json.sms, ...current])
      }
      if (json.sms_summary) {
        setLead(current => ({
          ...current,
          ...json.sms_summary,
        }))
      }
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
          setLead(prev => ({
            ...prev,
            phone_e164: json.phone_e164,
            likely_timezone: json.likely_timezone,
            timezone_confidence: json.timezone_confidence,
            timezone_source: json.timezone_source,
            last_timezone_checked_at: json.last_timezone_checked_at,
            recipient_local_time: json.recipient_local_time,
            timezone_abbreviation: json.timezone_abbreviation,
            call_window_status: json.call_window_status,
            call_window_message: json.call_window_message,
            blocked_until_label: json.blocked_until_label,
          }))
        }
        toast.error(json.error ?? 'This number is blocked by the calling window rule.')
        return
      }

      setLead(prev => ({
        ...prev,
        phone_e164: json.phone_e164,
        likely_timezone: json.likely_timezone,
        timezone_confidence: json.timezone_confidence,
        timezone_source: json.timezone_source,
        last_timezone_checked_at: json.last_timezone_checked_at,
        recipient_local_time: json.recipient_local_time,
        timezone_abbreviation: json.timezone_abbreviation,
        call_window_status: json.call_window_status,
        call_window_message: json.call_window_message,
        blocked_until_label: json.blocked_until_label,
      }))

      window.open(`tel:${json.phone_e164 || lead.phone}`, '_blank')
    } catch {
      toast.error('Unable to verify the calling window right now.')
    } finally {
      setAuthorizingCall(false)
    }
  }

  async function refreshTasks() {
    const res = await fetch(`/api/admin/crm/tasks?lead_id=${lead.id}`)
    const json = await res.json()
    setTasks(json.tasks ?? [])
  }

  async function refreshCalls() {
    const res = await fetch(`/api/admin/crm/calls?lead_id=${lead.id}`)
    const json = await res.json()
    setCalls(json.calls ?? [])
  }

  // ── Stage change ────────────────────────────────────────────────────────────
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

    // Log stage change activity
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
    if (!taskTitle.trim()) {
      toast.error('Task title is required')
      return
    }
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
    if (!res.ok) {
      toast.error('Unable to create task')
      return
    }
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
    if (!res.ok) {
      toast.error('Unable to complete task')
      return
    }
    toast.success('Task completed')
    refreshTasks()
  }

  async function rescheduleCallback() {
    if (!taskDueAt) {
      toast.error('Pick a callback time first')
      return
    }
    const res = await fetch(`/api/admin/crm/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follow_up_at: taskDueAt, callback_due_at: taskDueAt, stage: 'follow_up' }),
    })
    if (!res.ok) {
      toast.error('Unable to reschedule callback')
      return
    }
    const json = await res.json()
    setLead(json.lead)
    toast.success('Callback rescheduled')
  }

  // ── Save edits ──────────────────────────────────────────────────────────────
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

  // ── Add activity ────────────────────────────────────────────────────────────
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

  // ── Toggle DNC ──────────────────────────────────────────────────────────────
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

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function deleteLead() {
    if (!confirm(`Delete ${lead.first_name} ${lead.last_name}? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/crm/leads/${lead.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Delete failed'); return }
    toast.success('Lead deleted')
    router.push('/admin/crm')
  }

  // ── Email sent ──────────────────────────────────────────────────────────────
  async function handleEmailSent(subject: string) {
    await fetch('/api/admin/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id:    lead.id,
        type:       'email',
        body:       `Email opened in Gmail — Subject: "${subject}"`,
        created_by: adminEmail,
      }),
    })
    const actRes = await fetch(`/api/admin/crm/activities?lead_id=${lead.id}`)
    const actJson = await actRes.json()
    setActivities(actJson.activities ?? [])
    toast.success('Email opened in Gmail')
  }

  // ── Demo booked ─────────────────────────────────────────────────────────────
  async function handleDemoBooked(startIso: string, durationMins: number) {
    // Move stage to demo_scheduled
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
    // Log activity
    const start = new Date(startIso)
    const label = start.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    await fetch('/api/admin/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id:  lead.id,
        type:     'stage_change',
        body:     `Demo booked for ${label} (${durationMins} min) — Google Calendar event created`,
        metadata: { demo_at: startIso, duration_mins: durationMins },
        created_by: adminEmail,
      }),
    })
    const actRes = await fetch(`/api/admin/crm/activities?lead_id=${lead.id}`)
    const actJson = await actRes.json()
    setActivities(actJson.activities ?? [])
    toast.success('Demo booked! Check your Google Calendar.')
  }

  const programData = PROGRAMS.find(p => p.value === lead.program_interest)

  return (
    <div className="min-h-screen bg-gray-50 pb-[calc(6.75rem+env(safe-area-inset-bottom))] dark:bg-gray-950 sm:pb-28">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 px-3 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-4 sm:py-3">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-3 sm:items-center">
        <div className="min-w-0 flex-1">
          <CRMBackButton className="text-xs text-gray-400 hover:text-green-600 font-medium inline-flex items-center gap-0.5 leading-none mb-0.5" />
          <CRMBackButton className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-700 font-medium" showLabel={true} size="md" />
        </div>
        <div className="ml-auto flex max-w-[54%] flex-wrap items-center justify-end gap-2 sm:max-w-none sm:flex-nowrap sm:gap-1.5">
          <button
            onClick={toggleDNC}
            aria-label={lead.do_not_call ? 'Remove do not call' : 'Mark do not call'}
            className={cn(
              'flex h-8 items-center justify-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors opacity-80 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5 sm:opacity-100',
              lead.do_not_call ? 'border-red-300 text-red-600 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 text-gray-500'
            )}
          >
            <Ban size={12}/>
            <span className="whitespace-nowrap">DNC</span>
          </button>
          <Link href={`/admin/voice/campaigns/new?crm_lead=${lead.id}`} target="_blank" rel="noopener noreferrer" className="hidden h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 font-medium dark:border-gray-700 sm:flex sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5">
            <Megaphone size={13}/>
          </Link>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="btn-secondary flex h-8 items-center gap-1 px-3 text-xs sm:px-3 sm:py-1.5">
              <Edit3 size={13}/> <span className="whitespace-nowrap">Edit</span>
            </button>
          ) : (
            <div className="flex flex-wrap justify-end gap-2 sm:flex-nowrap sm:gap-1.5">
              <button onClick={saveEdits} disabled={saving} className="btn-primary flex h-8 items-center gap-1 px-3 text-xs sm:px-3 sm:py-1.5">
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary flex h-8 w-8 items-center justify-center px-0 text-xs sm:px-2.5 sm:py-1.5"><X size={13}/></button>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ── Lead identity ── */}
      <div className="border-b border-gray-100 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:py-5">
        <div className="mx-auto max-w-5xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 text-green-700 font-bold text-lg">
            {lead.first_name[0]}{lead.last_name?.[0] ?? ''}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {lead.first_name} {lead.last_name}
              {lead.do_not_call && <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">DNC</span>}
            </h1>
            {lead.business_name && <p className="text-sm text-gray-500 flex items-center gap-1"><Building2 size={12}/> {lead.business_name}</p>}
            <a href={`tel:${lead.phone}`} target="_blank" rel="noopener noreferrer" className="text-base font-semibold text-green-600 flex items-center gap-1.5 mt-1">
              <Phone size={15}/> {lead.phone}
            </a>
          </div>
        </div>

        {/* Stage scroll tabs */}
        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1 scrollbar-none">
          {STAGES.map(s => (
            <button
              key={s.key}
              onClick={() => changeStage(s.key)}
              className={cn(
                'shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap',
                lead.stage === s.key ? cn(s.color, 'border-current') : 'border-gray-200 dark:border-gray-700 text-gray-500'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* ── Duplicate warning banner ── */}
      {duplicateLeads.length > 0 && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-900/20">
          <div className="mx-auto max-w-5xl">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              ⚠️ Duplicate phone number detected — {duplicateLeads.length} other lead{duplicateLeads.length > 1 ? 's' : ''} share this number:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {duplicateLeads.map(d => (
                <Link
                  key={d.id}
                  href={`/admin/crm/${d.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-800/40 dark:text-amber-200 dark:hover:bg-amber-800/60"
                >
                  {d.first_name} {d.last_name} · {d.stage.replace('_', ' ')}
                </Link>
              ))}
              <span className="text-xs text-amber-700 dark:text-amber-400 self-center">— open the duplicate and scroll down to delete it</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-5 lg:max-w-5xl sm:space-y-4 sm:py-4">

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Call window</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {lead.call_window_status === 'callable_now'
                ? 'Callable Now'
                : lead.call_window_status === 'blocked_by_timezone'
                  ? 'Blocked'
                  : lead.call_window_status === 'unknown_timezone'
                    ? 'Unknown Timezone'
                    : 'Checking...'}
            </p>
            <p className="mt-1 text-sm text-gray-500">{lead.recipient_local_time ?? 'Recipient local time unavailable'}</p>
            {lead.likely_timezone && <p className="mt-1 text-xs text-gray-400">{lead.likely_timezone}{lead.timezone_abbreviation ? ` • ${lead.timezone_abbreviation}` : ''}</p>}
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lead temperature</p>
            <p className="mt-2 text-2xl font-bold text-orange-600">{lead.lead_temperature ?? 'cold'}</p>
            <p className="mt-1 text-sm text-gray-500">Close probability {lead.close_probability ?? 0}%</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Latest call outcome</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{lead.last_call_outcome ?? 'No calls yet'}</p>
            <p className="mt-1 text-sm text-gray-500">{lead.last_call_at ? formatDateTime(lead.last_call_at) : 'Waiting for first call'}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Strategy / close</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {lead.strategy_call_booked ? 'Booked' : 'Open'}
            </p>
            <p className="mt-1 text-sm text-gray-500">{lead.converted_to_client ? 'Converted to client' : 'Still working this deal'}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invite funnel</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {lead.analyzer_submitted ? 'Analyzer Submitted' : lead.account_created ? 'Account Created' : lead.portal_invite_sent || lead.pre_analyzer_invite_sent ? 'Invite Sent' : 'Not Started'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {lead.analyzer_submitted
                ? `Submitted ${formatDateTime(lead.analyzer_submitted_at ?? lead.account_created_at ?? lead.created_at)}`
                : lead.account_created
                  ? `Created ${formatDateTime(lead.account_created_at ?? lead.created_at)}`
                  : lead.portal_invite_last_sent_at || lead.pre_analyzer_invite_last_sent_at
                    ? `Last sent ${formatDateTime(lead.portal_invite_last_sent_at ?? lead.pre_analyzer_invite_last_sent_at ?? lead.created_at)}`
                    : 'No CRM invite sent yet'}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">SMS conversation</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {lead.unread_conversation_count ? `${lead.unread_conversation_count} unread` : `${lead.inbound_reply_count ?? 0} replies`}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {lead.last_inbound_reply_at
                ? `Last inbound ${formatDateTime(lead.last_inbound_reply_at)}`
                : lead.last_sms_sent_at
                  ? `Last text sent ${formatDateTime(lead.last_sms_sent_at)}`
                  : 'No SMS activity yet'}
            </p>
          </div>
        </div>

        {/* Info / Edit */}
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4">
          {lead.call_window_message && (
            <div className={cn(
              'mb-4 rounded-xl border px-3 py-3 text-sm',
              lead.call_window_status === 'callable_now'
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300'
                : lead.call_window_status === 'blocked_by_timezone'
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300'
                  : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
            )}>
              <p className="font-semibold">{buildDetailCallStatusLabel(lead)}</p>
              {lead.recipient_local_time && <p className="mt-1 text-xs opacity-80">Recipient local time: {lead.recipient_local_time}</p>}
              {(lead.timezone_source_label || lead.timezone_source) && (
                <p className="mt-1 text-xs opacity-80">
                  Source: {lead.timezone_source_label ?? lead.timezone_source}
                  {lead.timezone_reason_label ? ` • ${lead.timezone_reason_label}` : ''}
                </p>
              )}
              <p className="mt-2">{lead.call_window_message}</p>
            </div>
          )}
          {!editing ? (
            <div className="space-y-3 text-sm">
              {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-gray-400 shrink-0"/>
                  <a href={`mailto:${lead.email}`} className="text-gray-700 hover:text-green-600 truncate">{lead.email}</a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16 shrink-0">Source</span>
                <span className="text-gray-700 capitalize">{lead.source}</span>
              </div>
              {programData && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16 shrink-0">Program</span>
                  <span className={cn('badge text-xs px-2.5 py-1', programData.badge)}>{programData.label}</span>
                </div>
              )}
              {lead.follow_up_at && (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className={cn('shrink-0', new Date(lead.follow_up_at) < new Date() ? 'text-red-500' : 'text-amber-500')}/>
                  <span className={cn('text-sm', new Date(lead.follow_up_at) < new Date() ? 'text-red-500 font-medium' : 'text-gray-700')}>
                    Follow-up: {formatDateTime(lead.follow_up_at)}{new Date(lead.follow_up_at) < new Date() && ' ⚠ overdue'}
                  </span>
                </div>
              )}
              {lead.notes && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 bg-gray-50 dark:bg-gray-900 rounded-xl p-3 leading-relaxed">{lead.notes}</p>
                </div>
              )}
              <div className="text-xs text-gray-400 pt-1">Added {formatDateTime(lead.created_at)}</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">First Name</label><input className="input-field" value={editForm.first_name} onChange={e=>setEF('first_name',e.target.value)}/></div>
              <div><label className="label">Last Name</label><input className="input-field" value={editForm.last_name} onChange={e=>setEF('last_name',e.target.value)}/></div>
              <div><label className="label">Phone</label><input className="input-field" type="tel" value={editForm.phone} onChange={e=>setEF('phone',e.target.value)}/></div>
              <div><label className="label">Email</label><input className="input-field" type="email" value={editForm.email} onChange={e=>setEF('email',e.target.value)}/></div>
              <div className="col-span-2"><label className="label">Business Name</label><input className="input-field" value={editForm.business_name} onChange={e=>setEF('business_name',e.target.value)}/></div>
              <div><label className="label">Source</label>
                <select className="input-field" value={editForm.source} onChange={e=>setEF('source',e.target.value)}>
                  {['manual','analyzer','affiliate','facebook','purchased','referral','inbound','other'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              <div><label className="label">Program</label>
                <select className="input-field" value={editForm.program_interest} onChange={e=>setEF('program_interest',e.target.value)}>
                  <option value="">Unknown</option><option value="program_a">Program A</option><option value="program_b">Program B</option><option value="program_c">Program C</option>
                </select>
              </div>
              <div className="col-span-2"><label className="label">Follow-up Date</label><input className="input-field" type="datetime-local" value={editForm.follow_up_at} onChange={e=>setEF('follow_up_at',e.target.value)}/></div>
              <div className="col-span-2"><label className="label">Notes</label><textarea className="input-field min-h-[80px] resize-y" value={editForm.notes} onChange={e=>setEF('notes',e.target.value)}/></div>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">SMS conversation</h2>
                <p className="text-sm text-gray-500">
                  {lead.sms_sent_count ?? 0} sent, {lead.inbound_reply_count ?? 0} inbound replies
                  {lead.unread_conversation_count ? `, ${lead.unread_conversation_count} unread` : ''}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {lead.last_sms_status ?? 'no_texts'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {smsMessages.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500 dark:border-gray-700">
                  No SMS conversation yet.
                </p>
              )}

              {smsMessages.slice(0, 10).map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'rounded-2xl border px-4 py-3',
                    message.direction === 'outbound'
                      ? 'border-green-200 bg-green-50/80 dark:border-green-900 dark:bg-green-950/20'
                      : message.unread
                        ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/20'
                        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {message.direction === 'outbound' ? 'Outbound' : 'Inbound'}
                      </span>
                      {message.unread && message.direction === 'inbound' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Unread
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(message.sent_at ?? message.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">{message.message_body}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>Status: {message.delivery_status ?? message.status}</span>
                    {message.clicked_at && <span>Clicked {formatDateTime(message.clicked_at)}</span>}
                    {message.read_at && <span>Viewed {formatDateTime(message.read_at)}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 p-3 dark:border-gray-700">
              <label className="label">Reply by text</label>
              <textarea
                className="input-field min-h-[88px] resize-y text-sm"
                placeholder={`Text ${lead.first_name} from inside CRM...`}
                value={smsReplyBody}
                onChange={(event) => setSmsReplyBody(event.target.value)}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Sends to {lead.phone_e164 ?? lead.phone}
                </p>
                <button
                  onClick={sendSmsReply}
                  disabled={!smsReplyBody.trim() || sendingSmsReply}
                  className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
                >
                  {sendingSmsReply ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  Send reply
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="font-bold text-gray-900 dark:text-white">CRM invite tracking</h2>
            <div className="mt-4 space-y-3">
              {[
                {
                  label: 'Portal Invite',
                  invite: latestPortalInvite,
                  sent: lead.portal_invite_sent,
                  sentAt: lead.portal_invite_last_sent_at,
                  status: lead.portal_invite_last_status,
                },
                {
                  label: 'Pre-Analyzer Invite',
                  invite: latestPreAnalyzerInvite,
                  sent: lead.pre_analyzer_invite_sent,
                  sentAt: lead.pre_analyzer_invite_last_sent_at,
                  status: lead.pre_analyzer_invite_last_status,
                },
              ].map(item => (
                <div key={item.label} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{item.label}</p>
                      <p className="text-sm text-gray-500">
                        {item.sent ? `Sent ${formatDateTime(item.sentAt ?? lead.created_at)}` : 'Not sent'}
                      </p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {item.status ?? 'not_sent'}
                    </span>
                  </div>
                  {item.invite && (
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                      {item.invite.opened_at && <p>Opened: {formatDateTime(item.invite.opened_at)}</p>}
                      {item.invite.clicked_at && <p>Clicked: {formatDateTime(item.invite.clicked_at)}</p>}
                      {item.invite.account_created_at && <p>Free account created: {formatDateTime(item.invite.account_created_at)}</p>}
                      {item.invite.analyzer_started_at && <p>Analyzer started: {formatDateTime(item.invite.analyzer_started_at)}</p>}
                      {item.invite.analyzer_submitted_at && <p>Analyzer submitted: {formatDateTime(item.invite.analyzer_submitted_at)}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-gray-900 dark:text-white">Follow-up tasks</h2>
              <Link href="/admin/crm/tasks" className="text-sm font-medium text-green-600 hover:text-green-700">Open task board</Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
              <input className="input-field" placeholder="Create task" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
              <input className="input-field" type="datetime-local" value={taskDueAt} onChange={e => setTaskDueAt(e.target.value)} />
              <button onClick={createTask} disabled={taskSaving} className="btn-primary px-4 py-2 text-sm">
                {taskSaving ? 'Saving...' : 'Create'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Low', 'Medium', 'High', 'Urgent'].map(priority => (
                <button key={priority} onClick={() => setTaskPriority(priority)} className={cn('rounded-full px-3 py-1 text-xs font-medium', taskPriority === priority ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300')}>
                  {priority}
                </button>
              ))}
              <button onClick={rescheduleCallback} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                Reschedule callback
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {tasks.length === 0 && <p className="text-sm text-gray-500">No linked tasks yet.</p>}
              {tasks.map(task => (
                <div key={task.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{task.title}</p>
                      <p className="text-sm text-gray-500">{task.due_at ? formatDateTime(task.due_at) : 'No due date'} • {task.priority}</p>
                    </div>
                    {task.status !== 'Done' && <button onClick={() => completeTask(task.id)} className="text-xs font-semibold text-green-600 hover:text-green-700">Complete</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-gray-900 dark:text-white">Recent calls</h2>
              <Link href="/admin/crm/calls" className="text-sm font-medium text-green-600 hover:text-green-700">Open call log</Link>
            </div>
            <div className="mt-4 space-y-3">
              {calls.length === 0 && <p className="text-sm text-gray-500">No calls logged yet.</p>}
              {calls.map(call => (
                <div key={call.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{call.call_outcome}</p>
                      <p className="text-sm text-gray-500">{formatDateTime(call.call_started_at)}</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{call.lead_temperature || 'cold'}</span>
                  </div>
                  {call.notes && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{call.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>{call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}m ${String(call.duration_seconds % 60).padStart(2, '0')}s` : '0m'}</span>
                    {call.next_follow_up_at && <span>Next follow-up {formatDateTime(call.next_follow_up_at)}</span>}
                    {call.strategy_call_booked && <span className="font-semibold text-purple-600">Booked call</span>}
                    {call.converted_to_client && <span className="font-semibold text-green-600">Closed won</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity feed */}
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4">
          <h2 className="font-bold text-gray-900 mb-3 text-sm">Activity</h2>
          <div className="space-y-2 mb-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {(['note','call','email','sms','voicemail'] as const).map(t=>(
                <button key={t} onClick={()=>setNoteType(t)}
                  className={cn('shrink-0 text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors',
                    noteType===t ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  )}>{t}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea className="input-field flex-1 min-h-[64px] resize-none text-sm" placeholder={`Log a ${noteType}...`} value={noteText} onChange={e=>setNoteText(e.target.value)}/>
              <button onClick={addActivity} disabled={!noteText.trim()||addingNote} className="btn-primary px-4 self-end text-sm flex items-center gap-1">
                {addingNote && <Loader2 size={13} className="animate-spin"/>} Log
              </button>
            </div>
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {activities.map(act=>{
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
                      {act.body && <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{act.body}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <button onClick={deleteLead} className="w-full text-xs text-red-400 hover:text-red-600 py-3 flex items-center justify-center gap-1.5 transition-colors">
          <Trash2 size={13}/> Delete this lead
        </button>
      </div>

      {/* ── Sticky bottom actions (mobile-first) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-4 sm:py-3 sm:pb-3">
        <div className="mx-auto flex max-w-2xl gap-2">
          <button
            onClick={authorizeDial}
            disabled={authorizingCall || lead.call_window_status === 'blocked_by_timezone' || lead.call_window_status === 'unknown_timezone'}
            className={cn(
              'flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm transition-colors sm:h-12 sm:gap-2',
              authorizingCall || lead.call_window_status === 'blocked_by_timezone' || lead.call_window_status === 'unknown_timezone'
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
                : 'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white'
            )}
          >
            {authorizingCall ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16}/>} Call
          </button>
          {lead.email && (
            <button onClick={() => setShowEmail(true)}
              className="flex-1 h-10 btn-secondary flex items-center justify-center gap-1.5 font-semibold text-sm sm:h-12 sm:gap-2">
              <Mail size={16}/> Email
            </button>
          )}
          <button onClick={() => setShowBookDemo(true)}
            className="flex-1 h-10 btn-secondary flex items-center justify-center gap-1.5 font-semibold text-sm sm:h-12 sm:gap-2">
            <CalendarPlus size={16}/> Demo
          </button>
        </div>
      </div>

      {showBookDemo && <BookDemoModal lead={lead} onClose={()=>setShowBookDemo(false)} onBooked={handleDemoBooked}/>}
      {showEmail && <SendEmailModal lead={lead} onClose={()=>setShowEmail(false)} onSent={handleEmailSent}/>}
    </div>
  )
}
