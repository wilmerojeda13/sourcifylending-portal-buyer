'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  Save,
  Send,
  Tag,
  Trash2,
  TrendingUp,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { LeadCalendarEvent, LeadCalendarSummary } from '@/lib/crm-calendar-events'
import TagEditor from '@/components/admin/crm/TagEditor'
import type { CRMTagBadge } from '@/components/admin/crm/TagBadge'
import CRMDispositionForm from '@/components/admin/crm/CRMDispositionForm'

const AnalyzerLivePanel = dynamic(() => import('@/components/admin/crm/AnalyzerLivePanel'))

type Stage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'demo_scheduled'
  | 'demo_held'
  | 'follow_up'
  | 'closed_won'
  | 'closed_lost'
  | 'active_client'

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
  latest_call_note?: string | null
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
  created_source?: string
  created_source_label?: string | null
}

interface InviteRecord {
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
}

interface Props {
  lead: CRMLead
  tasks: TaskRecord[]
  tags: CRMTagBadge[]
  adminEmail: string
  // Optional - lazy loaded
  activities?: Activity[]
  calls?: CallRecord[]
  calendarSummary?: LeadCalendarSummary
  invites?: InviteRecord[]
  smsMessages?: SmsMessage[]
}

const STAGES: { key: Stage; label: string; color: string; bgColor: string }[] = [
  { key: 'new', label: 'New', color: 'text-gray-700 dark:text-gray-300', bgColor: 'bg-gray-100 dark:bg-gray-800' },
  { key: 'contacted', label: 'Contacted', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/40' },
  { key: 'qualified', label: 'Qualified', color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/40' },
  { key: 'demo_scheduled', label: 'Demo Scheduled', color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-100 dark:bg-purple-900/40' },
  { key: 'demo_held', label: 'Demo Held', color: 'text-indigo-700 dark:text-indigo-300', bgColor: 'bg-indigo-100 dark:bg-indigo-900/40' },
  { key: 'follow_up', label: 'Follow Up', color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-900/40' },
  { key: 'active_client', label: 'Active Client', color: 'text-teal-700 dark:text-teal-300', bgColor: 'bg-teal-100 dark:bg-teal-900/40' },
  { key: 'closed_won', label: 'Closed Won', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/40' },
  { key: 'closed_lost', label: 'Closed Lost', color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/40' },
]

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  note: MessageSquare,
  call: PhoneCall,
  stage_change: CheckCircle2,
  email: Mail,
  sms: MessageCircle,
  voicemail: Phone,
  follow_up_set: Calendar,
  disposition: PhoneCall,
}

const ACTIVITY_COLORS: Record<string, string> = {
  note: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  call: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  stage_change: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
  email: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  sms: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  voicemail: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  follow_up_set: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400',
  disposition: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatDateTimeLocal(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function titleize(value: string | null | undefined) {
  if (!value) return 'Unknown'
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard')).catch(() => toast.error('Failed to copy'))
}

function buildCallabilityLabel(lead: CRMLead) {
  if (lead.call_window_status === 'callable_now') return 'Callable Now'
  if (lead.call_window_status === 'blocked_by_timezone') return `Blocked Until ${lead.blocked_until_label ?? ''}`.trim()
  return lead.timezone_reason_label ? `Unknown: ${lead.timezone_reason_label}` : 'Unknown Timezone'
}

function eventTone(event: LeadCalendarEvent | null) {
  if (!event) return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
  if (event.status === 'cancelled') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300'
  if (event.type === 'demo') return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/20 dark:text-purple-300'
  if (event.type === 'callback') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300'
  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300'
}

function mergeCalendarEvents(current: LeadCalendarSummary, nextEvent: LeadCalendarEvent): LeadCalendarSummary {
  const events = [...current.events.filter((event) => event.id !== nextEvent.id), nextEvent].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  )
  const nextUpcoming = events.find((event) => event.status !== 'cancelled' && new Date(event.end || event.start).getTime() >= Date.now()) ?? null

  return {
    configured: true,
    matched: true,
    warning: null,
    events,
    nextEvent: nextUpcoming,
    hasBookedDemo: events.some((event) => event.type === 'demo' && event.status !== 'cancelled'),
  }
}

function SendEmailModal({
  lead,
  onClose,
  onSent,
}: {
  lead: CRMLead
  onClose: () => void
  onSent: (subject: string) => void
}) {
  const program = lead.program_interest
    ? { program_a: 'Program A', program_b: 'Program B', program_c: 'Program C' }[lead.program_interest]
    : null

  const [subject, setSubject] = useState('Following up — SourcifyLending')
  const [body, setBody] = useState(
    `Hi ${lead.first_name},\n\nI wanted to follow up regarding your interest in ${program ? `our ${program}` : 'our credit fulfillment program'}.\n\nWould you have 20–30 minutes this week for a quick demo?\n\nBest,\nSourcifyLending Team`,
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
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Mail size={17} className="text-blue-500" />
            <h2 className="font-bold text-gray-900 dark:text-white">Send Email</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div className="rounded-xl bg-gray-50 px-4 py-2.5 text-sm dark:bg-gray-800">
            <span className="text-xs font-medium text-gray-400">To: </span>
            <span className="font-medium text-gray-900 dark:text-white">{lead.first_name} {lead.last_name}</span>
            <span className="ml-2 text-gray-400">{'<'}{lead.email}{'>'}</span>
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input-field" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>
          <div>
            <label className="label">Body</label>
            <textarea className="input-field min-h-[180px] resize-y text-sm" value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={openGmail} className="btn-primary flex flex-1 items-center justify-center gap-2">
              <Mail size={15} /> Open in Gmail
            </button>
            <button onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BookDemoModal({
  lead,
  calendarEnabled,
  calendarAuthUrl,
  onClose,
  onBooked,
}: {
  lead: CRMLead
  calendarEnabled: boolean
  calendarAuthUrl: string
  onClose: () => void
  onBooked: (event: LeadCalendarEvent, updatedLead: CRMLead, warning?: string) => void
}) {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`

  const [dateTime, setDateTime] = useState(defaultDateTime)
  const [duration, setDuration] = useState(30)
  const [timezone, setTimezone] = useState(lead.likely_timezone || 'America/New_York')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirm() {
    if (!dateTime) {
      toast.error('Pick a date and time first')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/admin/crm/leads/${lead.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_start: new Date(dateTime).toISOString(),
          duration_minutes: duration,
          timezone,
          notes,
        }),
      })
      const json = await response.json()
      if (response.status === 428 && json.auth_required && json.auth_url) {
        window.location.assign(json.auth_url)
        return
      }
      if (!response.ok) {
        toast.error(json.error || 'Unable to create calendar booking')
        return
      }
      onBooked(json.event, json.lead, json.warning)
      onClose()
    } catch {
      toast.error('Unable to create calendar booking')
    } finally {
      setSaving(false)
    }
  }

  function handlePrimaryAction() {
    if (!calendarEnabled) {
      window.location.assign(calendarAuthUrl)
      return
    }
    void confirm()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <CalendarPlus size={18} className="text-purple-600" />
            <h2 className="font-bold text-gray-900 dark:text-white">Book Demo</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800">
            <p className="font-semibold text-gray-900 dark:text-white">{lead.first_name} {lead.last_name}</p>
            {lead.business_name && <p className="text-xs text-gray-500">{lead.business_name}</p>}
            <p className="mt-0.5 text-xs text-gray-500">{lead.phone}</p>
          </div>
          {!calendarEnabled && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              Google Calendar is not configured. Scheduling from the contact page is unavailable until CRM calendar credentials are connected.
            </div>
          )}
          <div>
            <label className="label">Date & Time</label>
            <input className="input-field" type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} />
          </div>
          <div>
            <label className="label">Duration</label>
            <select className="input-field" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>
          <div>
            <label className="label">Timezone</label>
            <input className="input-field" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input-field min-h-[96px] resize-y text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional prep notes for the booking." />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={handlePrimaryAction} disabled={saving} className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />}
              {calendarEnabled ? 'Book on Calendar' : 'Connect Google Calendar'}
            </button>
            <button onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LeadDetailClient({
  lead: initialLead,
  tasks: initialTasks,
  tags: initialTags,
  adminEmail,
  activities: initialActivities = [],
  calls: initialCalls = [],
  calendarSummary: initialCalendarSummary = { configured: false, matched: false, warning: null, events: [], nextEvent: null, hasBookedDemo: false },
  invites: initialInvites = [],
  smsMessages: initialSmsMessages = [],
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [lead, setLead] = useState(initialLead)
  const [activities, setActivities] = useState(initialActivities)
  const [calls, setCalls] = useState(initialCalls)
  const [tasks, setTasks] = useState(initialTasks)
  const [calendarSummary, setCalendarSummary] = useState(initialCalendarSummary)
  const [tags, setTags] = useState(initialTags)
  const [smsMessages, setSmsMessages] = useState(initialSmsMessages)
  const [invites, setInvites] = useState(initialInvites)
  
  const [activitiesLoaded, setActivitiesLoaded] = useState(initialActivities.length > 0)
  const [callsLoaded, setCallsLoaded] = useState(initialCalls.length > 0)
  const [calendarLoaded, setCalendarLoaded] = useState(initialCalendarSummary.configured || initialCalendarSummary.events.length > 0)
  const [outreachLoaded, setOutreachLoaded] = useState(initialInvites.length > 0 || initialSmsMessages.length > 0)
  const [analyzerLoaded, setAnalyzerLoaded] = useState(false)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [loadingCalls, setLoadingCalls] = useState(false)
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [loadingOutreach, setLoadingOutreach] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [noteType, setNoteType] = useState<'note' | 'call' | 'email' | 'sms' | 'voicemail'>('note')
  const [showBookDemo, setShowBookDemo] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [taskPriority, setTaskPriority] = useState('High')
  const [taskSaving, setTaskSaving] = useState(false)
  const [showDisposition, setShowDisposition] = useState(false)
  const [selectedDispositionKey, setSelectedDispositionKey] = useState<string | null>(null)
  const [savingDisposition, setSavingDisposition] = useState(false)
  const [dispositionError, setDispositionError] = useState<string | null>(null)
  const [authorizingCall, setAuthorizingCall] = useState(false)
  const [smsReplyBody, setSmsReplyBody] = useState('')
  const [sendingSmsReply, setSendingSmsReply] = useState(false)
  const [duplicateLeads, setDuplicateLeads] = useState<Array<{ id: string; first_name: string; last_name: string; stage: string }>>([])
  const [duplicatesLoaded, setDuplicatesLoaded] = useState(false)
  const autoOpenBooking = useRef(false)
  const [editForm, setEditForm] = useState({
    first_name: initialLead.first_name,
    last_name: initialLead.last_name,
    phone: initialLead.phone,
    email: initialLead.email ?? '',
    business_name: initialLead.business_name ?? '',
    program_interest: initialLead.program_interest ?? '',
    source: initialLead.source,
    notes: initialLead.notes ?? '',
    follow_up_at: formatDateTimeLocal(initialLead.follow_up_at),
  })

  const stageInfo = STAGES.find((stage) => stage.key === lead.stage) ?? STAGES[0]
  const latestPortalInvite = invites.find((invite) => invite.invite_type === 'portal') ?? null
  const latestPreAnalyzerInvite = invites.find((invite) => invite.invite_type === 'pre_analyzer') ?? null

  const openTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.status !== 'Done')
        .sort((a, b) => {
          if (!a.due_at) return 1
          if (!b.due_at) return -1
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
        }),
    [tasks],
  )
  const upcomingEvents = useMemo(
    () =>
      calendarSummary.events.filter((event) => event.status !== 'cancelled' && new Date(event.end || event.start).getTime() >= Date.now()),
    [calendarSummary.events],
  )
  const nextCalendarEvent = calendarSummary.nextEvent ?? upcomingEvents[0] ?? null
  const emailActivities = activities.filter((activity) => activity.type === 'email').slice(0, 4)
  const recentCalls = calls.slice(0, 5)
  const calendarAuthUrl = `/api/admin/crm/google-calendar/connect?lead_id=${encodeURIComponent(lead.id)}&next=${encodeURIComponent(`/admin/crm/${lead.id}?book_demo=1`)}`

  function setEF<K extends keyof typeof editForm>(key: K, value: typeof editForm[K]) {
    setEditForm((current) => ({ ...current, [key]: value }))
  }

  useEffect(() => {
    if (!lead.phone || duplicatesLoaded || !lead.duplicate_review_required) return
    fetch(`/api/admin/crm/leads?search=${encodeURIComponent(lead.phone)}&limit=10`)
      .then((response) => response.json())
      .then((json) => {
        const duplicates = (json.leads ?? []).filter((item: { id: string }) => item.id !== lead.id)
        setDuplicateLeads(duplicates)
        setDuplicatesLoaded(true)
      })
      .catch(() => {})
  }, [duplicatesLoaded, lead.duplicate_review_required, lead.id, lead.phone])

  useEffect(() => {
    if (autoOpenBooking.current) return
    if (searchParams.get('book_demo') !== '1') return
    autoOpenBooking.current = true
    void openBookDemoModal().finally(() => {
      router.replace(`/admin/crm/${lead.id}`)
    })
  }, [lead.id, router, searchParams])

  async function loadActivities() {
    if (activitiesLoaded || loadingActivities) return
    setLoadingActivities(true)
    try {
      const response = await fetch(`/api/admin/crm/activities?lead_id=${lead.id}`)
      const json = await response.json()
      setActivities(json.activities ?? [])
      setActivitiesLoaded(true)
    } finally {
      setLoadingActivities(false)
    }
  }

  async function loadCalls() {
    if (callsLoaded || loadingCalls) return
    setLoadingCalls(true)
    try {
      const response = await fetch(`/api/admin/crm/calls?lead_id=${lead.id}`)
      const json = await response.json()
      setCalls(json.calls ?? [])
      setCallsLoaded(true)
    } finally {
      setLoadingCalls(false)
    }
  }

  async function loadCalendar() {
    if (calendarLoaded || loadingCalendar) return
    setLoadingCalendar(true)
    try {
      // Request Google Calendar explicitly; the route skips it by default for first paint.
      const response = await fetch(`/api/admin/crm/calendar?lead_id=${lead.id}&google=true`)
      const json = await response.json()
      setCalendarSummary({
        configured: json.connected ?? false,
        matched: (json.events ?? []).length > 0,
        warning: json.google_calendar?.error || null,
        events: json.events ?? [],
        nextEvent: json.events?.[0] ?? null,
        hasBookedDemo: (json.events ?? []).some((event: LeadCalendarEvent) => event.type === 'demo' && event.status !== 'cancelled'),
      })
      setCalendarLoaded(true)
    } finally {
      setLoadingCalendar(false)
    }
  }

  async function loadOutreach() {
    if (outreachLoaded || loadingOutreach) return
    setLoadingOutreach(true)
    try {
      const [smsResponse, inviteResponse] = await Promise.all([
        fetch(`/api/admin/crm/leads/${lead.id}/sms`),
        fetch(`/api/admin/crm/leads/${lead.id}/invites`),
      ])
      const [smsJson, inviteJson] = await Promise.all([smsResponse.json(), inviteResponse.json()])
      setSmsMessages(smsJson.messages ?? [])
      setInvites(inviteJson.invites ?? [])
      setOutreachLoaded(true)
    } finally {
      setLoadingOutreach(false)
    }
  }

  async function openBookDemoModal() {
    if (!calendarLoaded) {
      await loadCalendar()
    }
    setShowBookDemo(true)
  }

  async function refreshActivities() {
    const response = await fetch(`/api/admin/crm/activities?lead_id=${lead.id}`)
    const json = await response.json()
    setActivities(json.activities ?? [])
    setActivitiesLoaded(true)
  }

  async function refreshTasks() {
    const response = await fetch(`/api/admin/crm/tasks?lead_id=${lead.id}`)
    const json = await response.json()
    setTasks(json.tasks ?? [])
  }

  async function sendSmsReply() {
    if (!smsReplyBody.trim() || sendingSmsReply) return
    setSendingSmsReply(true)
    try {
      const latestThreadMessage = smsMessages[0] ?? null
      const response = await fetch(`/api/admin/crm/leads/${lead.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_body: smsReplyBody.trim(),
          template_key: 'reply',
          parent_sms_id: latestThreadMessage?.id ?? null,
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        toast.error(json.error ?? 'Failed to send text reply')
        return
      }
      if (json.sms) setSmsMessages((current) => [json.sms, ...current])
      if (json.sms_summary) setLead((current) => ({ ...current, ...json.sms_summary }))
      await refreshActivities()
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
      const response = await fetch('/api/admin/crm/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      })
      const json = await response.json()
      if (!response.ok || !json.allowed) {
        if (json.call_window_message) {
          setLead((current) => ({ ...current, ...json }))
        }
        toast.error(json.error ?? 'This number is blocked.')
        return
      }
      setLead((current) => ({ ...current, ...json }))
      window.open(`tel:${json.phone_e164 || lead.phone}`, '_blank')
    } catch {
      toast.error('Unable to verify the calling window.')
    } finally {
      setAuthorizingCall(false)
    }
  }

  async function changeStage(newStage: Stage) {
    if (newStage === lead.stage) return
    const oldLabel = STAGES.find((stage) => stage.key === lead.stage)?.label
    const newLabel = STAGES.find((stage) => stage.key === newStage)?.label
    const response = await fetch(`/api/admin/crm/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
    if (!response.ok) {
      toast.error('Failed to update stage')
      return
    }
    const { lead: updatedLead } = await response.json()
    setLead(updatedLead)
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
    await refreshActivities()
    toast.success(`Moved to ${newLabel}`)
  }

  async function saveDisposition(value: { disposition_key: string; note: string; follow_up_at: string }) {
    setSavingDisposition(true)
    setDispositionError(null)
    try {
      const response = await fetch('/api/admin/crm/dispositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          disposition_key: value.disposition_key,
          note: value.note || null,
          follow_up_at: value.follow_up_at || null,
          // Only create task for dispositions that require follow-up
          create_follow_up_task: ['follow_up', 'call_back', 'call_back_later', 'appointment_set', 'booked_call'].includes(value.disposition_key) && value.follow_up_at ? true : false,
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save disposition')
      }
      if (json.lead) setLead(json.lead)
      if (json.task) setTasks((current) => [json.task, ...current])
      await refreshActivities()
      setShowDisposition(false)
      setSelectedDispositionKey(null)
      toast.success('Disposition saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save disposition'
      setDispositionError(message)
      toast.error(message)
    } finally {
      setSavingDisposition(false)
    }
  }

  async function createTask() {
    if (!taskTitle.trim()) {
      toast.error('Task title is required')
      return
    }
    setTaskSaving(true)
    try {
      const response = await fetch('/api/admin/crm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          title: taskTitle,
          task_type: 'Follow-Up',
          priority: taskPriority,
          due_at: taskDueAt || null,
          pipeline_stage: lead.stage,
          created_source: 'manual',
          created_source_label: 'Manual task',
        }),
      })
      if (!response.ok) {
        toast.error('Unable to create task')
        return
      }
      setTaskTitle('')
      setTaskDueAt('')
      toast.success('Task created')
      await refreshTasks()
    } finally {
      setTaskSaving(false)
    }
  }

  async function completeTask(taskId: string) {
    const response = await fetch(`/api/admin/crm/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Done' }),
    })
    if (!response.ok) {
      toast.error('Unable to complete task')
      return
    }
    const json = await response.json()
    setTasks((current) => current.map((task) => (task.id === taskId ? json.task : task)))
    toast.success('Task completed')
  }

  async function saveEdits() {
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          email: editForm.email || null,
          business_name: editForm.business_name || null,
          program_interest: editForm.program_interest || null,
          follow_up_at: editForm.follow_up_at || null,
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        toast.error(json.error ?? 'Save failed')
        return
      }
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
      const response = await fetch('/api/admin/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, type: noteType, body: noteText }),
      })
      const json = await response.json()
      if (!response.ok) {
        toast.error(json.error ?? 'Failed to log activity')
        return
      }
      setActivities((current) => [json.activity, ...current])
      setNoteText('')
      toast.success('Activity logged')
    } finally {
      setAddingNote(false)
    }
  }

  async function toggleDNC() {
    const response = await fetch(`/api/admin/crm/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ do_not_call: !lead.do_not_call }),
    })
    const json = await response.json()
    if (!response.ok) {
      toast.error('Failed')
      return
    }
    setLead(json.lead)
    toast.success(json.lead.do_not_call ? 'Marked as Do Not Call' : 'DNC removed')
  }

  async function deleteLead() {
    if (!confirm(`Delete ${lead.first_name} ${lead.last_name}? This cannot be undone.`)) return
    const response = await fetch(`/api/admin/crm/leads/${lead.id}`, { method: 'DELETE' })
    if (!response.ok) {
      toast.error('Delete failed')
      return
    }
    toast.success('Lead deleted')
    router.push('/admin/crm')
  }

  async function handleEmailSent(subject: string) {
    await fetch('/api/admin/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: lead.id,
        type: 'email',
        body: `Email sent — Subject: "${subject}"`,
        created_by: adminEmail,
      }),
    })
    await refreshActivities()
    toast.success('Email opened in Gmail')
  }

  async function handleDemoBooked(event: LeadCalendarEvent, updatedLead: CRMLead, warning?: string) {
    setLead(updatedLead)
    setCalendarSummary((current) => mergeCalendarEvents(current, event))
    setCalendarLoaded(true)
    await refreshActivities()
    if (warning) {
      toast(warning)
    } else {
      toast.success('Calendar demo booked')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 dark:bg-gray-950">
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 px-3 py-1.5 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/admin/crm" className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-green-700">
            <ChevronDown size={18} className="rotate-90" /> <span className="hidden sm:inline">Leads</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDNC}
              className={cn(
                'flex h-8 items-center justify-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors',
                lead.do_not_call ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 dark:border-gray-700',
              )}
            >
              <Ban size={12} />
              <span className="hidden sm:inline">DNC</span>
            </button>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="btn-secondary flex h-8 items-center gap-1 px-2.5 text-xs sm:px-3">
                <Edit3 size={13} /> <span className="hidden sm:inline">Edit</span>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={saveEdits} disabled={saving} className="btn-primary flex h-8 items-center gap-1 px-2.5 text-xs sm:px-3">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  <span className="hidden sm:inline">Save</span>
                </button>
                <button onClick={() => setEditing(false)} className="btn-secondary flex h-8 w-8 items-center justify-center px-0 text-xs">
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {duplicateLeads.length > 0 && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-900/20">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Duplicate phone detected. {duplicateLeads.length} other lead{duplicateLeads.length > 1 ? 's' : ''} share this number.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {duplicateLeads.map((duplicate) => (
                <Link key={duplicate.id} href={`/admin/crm/${duplicate.id}`} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-800/40 dark:text-amber-200">
                  {duplicate.first_name} {duplicate.last_name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-sm font-bold text-green-700 dark:bg-green-900/30 dark:text-green-200">
                {lead.first_name[0]}{lead.last_name?.[0] ?? ''}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="text-base font-bold text-gray-900 dark:text-white">{lead.first_name} {lead.last_name}</h1>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', stageInfo.bgColor, stageInfo.color)}>{stageInfo.label}</span>
                  {lead.do_not_call && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-300">DNC</span>}
                  {(lead.unread_conversation_count ?? 0) > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">{lead.unread_conversation_count} unread</span>}
                  {openTasks.length > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">{openTasks.length} task{openTasks.length === 1 ? '' : 's'}</span>}
                </div>
                <div className="mt-1 sm:hidden">
                  <button
                    onClick={() => copyToClipboard(lead.phone)}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-green-500/20 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700"
                  >
                    <Phone size={11} className="shrink-0" />
                    <span className="min-w-0 truncate whitespace-nowrap">{lead.phone}</span>
                  </button>
                </div>
                <div className="mt-1 hidden flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 sm:flex">
                  <button onClick={() => copyToClipboard(lead.phone)} className="flex items-center gap-1 hover:text-green-700"><Phone size={11} className="text-green-600" /> {lead.phone}</button>
                  {lead.email && <button onClick={() => copyToClipboard(lead.email!)} className="flex items-center gap-1 hover:text-blue-700"><Mail size={11} className="text-blue-600" /> {lead.email}</button>}
                  {lead.business_name && <span className="flex items-center gap-1"><Building2 size={11} /> {lead.business_name}</span>}
                  {lead.likely_timezone && <span className="flex items-center gap-1"><MapPin size={11} className="text-purple-600" /> {lead.likely_timezone} · {buildCallabilityLabel(lead)}</span>}
                  {lead.close_probability != null && <span className="flex items-center gap-1"><TrendingUp size={11} className="text-emerald-600" /> {lead.close_probability}%</span>}
                  {lead.lead_temperature && <span className="capitalize">{lead.lead_temperature}</span>}
                  <span className="flex items-center gap-1"><Tag size={11} /> {lead.source}</span>
                </div>
              </div>
            </div>
            <div className="hidden shrink-0 flex-wrap gap-1.5 sm:flex">
              <button onClick={authorizeDial} disabled={authorizingCall || lead.call_window_status === 'blocked_by_timezone' || lead.call_window_status === 'unknown_timezone'} className={cn('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60', authorizingCall ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700')}>
                {authorizingCall ? <Loader2 size={13} className="animate-spin" /> : <Phone size={13} />} Call
              </button>
              {lead.email && <button onClick={() => setShowEmail(true)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"><Mail size={13} /> Email</button>}
              <button onClick={() => void openBookDemoModal()} className="flex items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-purple-700"><CalendarPlus size={13} /> Demo</button>
              <button type="button" onClick={() => { setSelectedDispositionKey(null); setDispositionError(null); setShowDisposition(true) }} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:text-gray-200">
                <PhoneCall size={13} /> Disposition
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:hidden">
            <button
              onClick={authorizeDial}
              disabled={authorizingCall || lead.call_window_status === 'blocked_by_timezone' || lead.call_window_status === 'unknown_timezone'}
              className={cn(
                'flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                authorizingCall ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700',
              )}
            >
              {authorizingCall ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
              Call
            </button>
            <div className={cn('grid gap-2', lead.email ? 'grid-cols-2' : 'grid-cols-1')}>
              <button
                type="button"
                onClick={() => copyToClipboard(lead.phone)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                <Copy size={13} />
                Copy
              </button>
              {lead.email && (
                <button
                  onClick={() => setShowEmail(true)}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white"
                >
                  <Mail size={13} />
                  Email
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void openBookDemoModal()}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-3 text-xs font-semibold text-white"
              >
                <CalendarPlus size={13} />
                Demo
              </button>
              <button
                type="button"
                onClick={() => { setSelectedDispositionKey(null); setDispositionError(null); setShowDisposition(true) }}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                <PhoneCall size={13} />
                Disposition
              </button>
            </div>
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
            {STAGES.map((stage) => (
              <button key={stage.key} onClick={() => changeStage(stage.key)} className={cn('shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all', lead.stage === stage.key ? cn(stage.bgColor, stage.color, 'border-current') : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400')}>
                {stage.label}
              </button>
            ))}
          </div>
        </div>

        {editing && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Edit Contact</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div><label className="label">First Name</label><input className="input-field" value={editForm.first_name} onChange={(event) => setEF('first_name', event.target.value)} /></div>
              <div><label className="label">Last Name</label><input className="input-field" value={editForm.last_name} onChange={(event) => setEF('last_name', event.target.value)} /></div>
              <div><label className="label">Phone</label><input className="input-field" type="tel" value={editForm.phone} onChange={(event) => setEF('phone', event.target.value)} /></div>
              <div><label className="label">Email</label><input className="input-field" type="email" value={editForm.email} onChange={(event) => setEF('email', event.target.value)} /></div>
              <div className="md:col-span-2"><label className="label">Business Name</label><input className="input-field" value={editForm.business_name} onChange={(event) => setEF('business_name', event.target.value)} /></div>
              <div><label className="label">Source</label><select className="input-field" value={editForm.source} onChange={(event) => setEF('source', event.target.value)}>{['manual', 'analyzer', 'affiliate', 'facebook', 'purchased', 'referral', 'inbound', 'other'].map((source) => <option key={source} value={source}>{source.charAt(0).toUpperCase() + source.slice(1)}</option>)}</select></div>
              <div><label className="label">Program</label><select className="input-field" value={editForm.program_interest} onChange={(event) => setEF('program_interest', event.target.value)}><option value="">Unknown</option><option value="program_a">Program A</option><option value="program_b">Program B</option><option value="program_c">Program C</option></select></div>
              <div className="md:col-span-2"><label className="label">Follow-up Date</label><input className="input-field" type="datetime-local" value={editForm.follow_up_at} onChange={(event) => setEF('follow_up_at', event.target.value)} /></div>
              <div className="md:col-span-2"><label className="label">Notes</label><textarea className="input-field min-h-[110px] resize-y" value={editForm.notes} onChange={(event) => setEF('notes', event.target.value)} /></div>
            </div>
          </div>
        )}

        <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_1fr]">
          <div className="hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:block">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-purple-600">Schedule</p>
                <h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Calendar & next actions</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void openBookDemoModal()} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-700"><CalendarPlus size={13} /> {nextCalendarEvent ? 'Book another' : 'Book demo'}</button>
                {nextCalendarEvent?.htmlLink && <a href={nextCalendarEvent.htmlLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:border-purple-300 hover:text-purple-700 dark:border-gray-700 dark:text-gray-200"><ExternalLink size={13} /> Reschedule</a>}
              </div>
            </div>

            {calendarSummary.warning && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">{calendarSummary.warning}</div>}

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className={cn('rounded-xl border px-3 py-2', eventTone(nextCalendarEvent))}>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Next demo</p>
                <p className="mt-1 text-sm font-semibold">{nextCalendarEvent ? nextCalendarEvent.title : 'Not booked'}</p>
                {nextCalendarEvent && <p className="mt-0.5 text-xs opacity-80">{formatDateTime(nextCalendarEvent.start)}</p>}
              </div>
              <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Callback due</p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDateTime(lead.callback_due_at)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Follow-up</p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDateTime(lead.follow_up_at)}</p>
              </div>
            </div>

            {!calendarLoaded && (
              <div className="mt-3 rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Calendar event detail is deferred until needed.</span>
                  <button onClick={() => void loadCalendar()} disabled={loadingCalendar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-purple-300 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200">
                    {loadingCalendar ? 'Loading…' : 'Load calendar items'}
                  </button>
                </div>
              </div>
            )}

            {calendarLoaded && upcomingEvents.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {upcomingEvents.slice(0, 3).map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', eventTone(event))}>{titleize(event.type)}</span>
                      <span className="truncate text-sm text-gray-900 dark:text-white">{event.title}</span>
                      <span className="shrink-0 text-xs text-gray-500">{formatDateTime(event.start)}</span>
                    </div>
                    {event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer" className="shrink-0 text-purple-600 hover:text-purple-700"><ExternalLink size={12} /></a>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <details className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:hidden">
            <summary className="flex list-none items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-purple-600">Schedule</p>
                <h2 className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">Calendar & next actions</h2>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  Callback {formatDateTime(lead.callback_due_at)} · Follow-up {formatDateTime(lead.follow_up_at)}
                </p>
              </div>
              <ChevronDown size={16} className="shrink-0 text-gray-400" />
            </summary>
            <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className={cn('rounded-xl border px-3 py-2', eventTone(nextCalendarEvent))}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Next demo</p>
                  <p className="mt-1 text-sm font-semibold">{nextCalendarEvent ? nextCalendarEvent.title : 'Not booked'}</p>
                  {nextCalendarEvent && <p className="mt-0.5 text-xs opacity-80">{formatDateTime(nextCalendarEvent.start)}</p>}
                </div>
                <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Callback due</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDateTime(lead.callback_due_at)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Follow-up</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDateTime(lead.follow_up_at)}</p>
                </div>
              </div>

              {!calendarLoaded && (
                <div className="mt-3 rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>Calendar event detail is deferred until needed.</span>
                    <button onClick={() => void loadCalendar()} disabled={loadingCalendar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-purple-300 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200">
                      {loadingCalendar ? 'Loading…' : 'Load calendar items'}
                    </button>
                  </div>
                </div>
              )}

              {calendarLoaded && upcomingEvents.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {upcomingEvents.slice(0, 3).map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', eventTone(event))}>{titleize(event.type)}</span>
                        <span className="truncate text-sm text-gray-900 dark:text-white">{event.title}</span>
                        <span className="shrink-0 text-xs text-gray-500">{formatDateTime(event.start)}</span>
                      </div>
                      {event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer" className="shrink-0 text-purple-600 hover:text-purple-700"><ExternalLink size={12} /></a>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <div className="hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:block">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-600">Tasks</p><h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Rep task queue</h2></div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">{openTasks.length} open</span>
            </div>
            <div className="mt-4 space-y-2">
              <input className="input-field text-sm" placeholder="New task..." value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
              <div className="grid gap-2 sm:grid-cols-[1fr_120px_96px]">
                <input className="input-field text-sm" type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} />
                <select className="input-field text-sm" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}>{['Low', 'Medium', 'High', 'Urgent'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
                <button onClick={createTask} disabled={taskSaving} className="btn-primary text-sm">{taskSaving ? 'Saving…' : 'Add task'}</button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {openTasks.length === 0 ? (
                <div className="rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-500 dark:bg-gray-800/70">No open tasks for this contact.</div>
              ) : (
                openTasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500">
                          <span>{task.task_type}</span>
                          <span>•</span>
                          <span>{task.priority}</span>
                          {task.due_at && (<><span>•</span><span>{formatDateTime(task.due_at)}</span></>)}
                        </div>
                        {task.created_source_label && <p className="mt-2 text-xs text-gray-500">{task.created_source_label}</p>}
                      </div>
                      <button onClick={() => completeTask(task.id)} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">Done</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-600">Outreach</p><h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Texts & outreach</h2></div>
              {lead.email && <button onClick={() => setShowEmail(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"><Mail size={13} /> Email</button>}
            </div>
            <div className="mt-3 grid gap-2 grid-cols-4">
              <div className="rounded-xl bg-gray-50 px-2 py-2 dark:bg-gray-800/70"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Emails</p><p className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">{emailActivities.length}</p></div>
              <div className="rounded-xl bg-gray-50 px-2 py-2 dark:bg-gray-800/70"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Texts</p><p className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">{lead.sms_sent_count ?? 0}</p></div>
              <div className="rounded-xl bg-gray-50 px-2 py-2 dark:bg-gray-800/70"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Replies</p><p className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">{lead.inbound_reply_count ?? 0}</p></div>
              <div className="rounded-xl bg-gray-50 px-2 py-2 dark:bg-gray-800/70"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Unread</p><p className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">{lead.unread_conversation_count ?? 0}</p></div>
            </div>
            {!outreachLoaded && (
              <div className="mt-3 rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Thread history and invite detail load on demand.</span>
                  <button onClick={() => void loadOutreach()} disabled={loadingOutreach} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200">
                    {loadingOutreach ? 'Loading…' : 'Load outreach history'}
                  </button>
                </div>
              </div>
            )}
            {outreachLoaded && smsMessages.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {smsMessages.slice(0, 3).map((message) => (
                  <div key={message.id} className="flex items-start justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white">{message.message_body}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{message.direction} · {titleize(message.status)} · {formatDateTime(message.sent_at || message.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-2">
              <textarea className="input-field min-h-[72px] resize-y text-sm" value={smsReplyBody} onChange={(event) => setSmsReplyBody(event.target.value)} placeholder="Reply by text..." />
              <button onClick={sendSmsReply} disabled={sendingSmsReply || !smsReplyBody.trim()} className="btn-primary flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                {sendingSmsReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send text reply
              </button>
            </div>
            <div className="mt-3 grid gap-2 grid-cols-2">
              <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Portal invite</p><p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{latestPortalInvite ? titleize(latestPortalInvite.status) : 'Not sent'}</p><p className="text-xs text-gray-500">{latestPortalInvite?.sent_at ? formatDateTime(latestPortalInvite.sent_at) : '—'}</p></div>
              <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Analyzer invite</p><p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{latestPreAnalyzerInvite ? titleize(latestPreAnalyzerInvite.status) : 'Not sent'}</p><p className="text-xs text-gray-500">{latestPreAnalyzerInvite?.sent_at ? formatDateTime(latestPreAnalyzerInvite.sent_at) : '—'}</p></div>
            </div>
          </div>

          <div className="space-y-3">
            <details className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:hidden">
              <summary className="flex list-none items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Notes</p>
                  <h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Lead Notes</h2>
                </div>
                <ChevronDown size={16} className="shrink-0 text-gray-400" />
              </summary>
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                {!editing ? (
                  lead.notes ? <p className="rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-700 dark:bg-gray-800/70 dark:text-gray-200">{lead.notes}</p> : <p className="text-sm text-gray-500">No notes on this contact yet.</p>
                ) : (
                  <textarea className="input-field min-h-[120px] resize-y text-sm" value={editForm.notes} onChange={(event) => setEF('notes', event.target.value)} />
                )}
              </div>
            </details>
            <div className="hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:block">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Notes</p><h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Rep notes</h2></div></div>
              {!editing ? (
                lead.notes ? <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-700 dark:bg-gray-800/70 dark:text-gray-200">{lead.notes}</p> : <p className="mt-3 text-sm text-gray-500">No notes on this contact yet.</p>
              ) : (
                <textarea className="input-field mt-4 min-h-[160px] resize-y text-sm" value={editForm.notes} onChange={(event) => setEF('notes', event.target.value)} />
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Lead Ops</p><h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Disposition, tags, and facts</h2></div></div>
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/50">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{lead.last_call_outcome || 'No disposition saved yet'}</p>
                <p className="mt-1 text-xs text-gray-500">{lead.last_call_at ? formatDateTime(lead.last_call_at) : 'No recent call disposition'}</p>
                {lead.latest_call_note && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{lead.latest_call_note}</p>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['interested', 'appointment_set', 'follow_up', 'call_back'].map((key) => (
                  <button key={key} type="button" onClick={() => { setSelectedDispositionKey(key); setShowDisposition(true); setDispositionError(null) }} className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:text-gray-300">
                    {key === 'appointment_set' ? 'Appointment Set' : key.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="mt-4"><TagEditor leadId={lead.id} tags={tags} onChange={setTags} /></div>
              <div className="mt-4 space-y-2 text-sm">
                {lead.lead_temperature && <div className="flex justify-between gap-3"><span className="text-gray-500">Temperature</span><span className="font-medium capitalize text-gray-900 dark:text-white">{lead.lead_temperature}</span></div>}
                {lead.readiness_score != null && <div className="flex justify-between gap-3"><span className="text-gray-500">Readiness</span><span className="font-medium text-gray-900 dark:text-white">{lead.readiness_score}/100</span></div>}
                {lead.estimated_funding_range && <div className="flex justify-between gap-3"><span className="text-gray-500">Funding range</span><span className="font-medium text-gray-900 dark:text-white">{lead.estimated_funding_range}</span></div>}
                {lead.last_contacted_at && <div className="flex justify-between gap-3"><span className="text-gray-500">Last contact</span><span className="font-medium text-gray-900 dark:text-white">{formatDateTime(lead.last_contacted_at)}</span></div>}
              </div>
              {(lead.risk_flags?.length ?? 0) > 0 && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20"><div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle size={14} /> Risk Flags</div><div className="mt-3 flex flex-wrap gap-2">{lead.risk_flags?.map((flag) => <span key={flag} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">{flag}</span>)}</div></div>}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Activity</p><h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Timeline</h2></div></div>
            <div className="mt-4 space-y-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1">{(['note', 'call', 'email', 'sms', 'voicemail'] as const).map((type) => <button key={type} onClick={() => setNoteType(type)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors', noteType === type ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300')}>{type}</button>)}</div>
              <div className="flex gap-2">
                <textarea className="input-field min-h-[56px] flex-1 resize-none text-sm" placeholder={`Log a ${noteType}...`} value={noteText} onChange={(event) => setNoteText(event.target.value)} />
                <button onClick={addActivity} disabled={!noteText.trim() || addingNote} className="btn-primary self-end px-4 text-sm">{addingNote ? 'Saving…' : 'Log'}</button>
              </div>
            </div>
            {!activitiesLoaded && (
              <div className="mt-3 rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Timeline history is deferred until needed.</span>
                  <button onClick={() => void loadActivities()} disabled={loadingActivities} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-green-300 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200">
                    {loadingActivities ? 'Loading…' : 'Load activity timeline'}
                  </button>
                </div>
              </div>
            )}
            {activitiesLoaded && activities.length === 0 ? <p className="mt-3 text-sm text-gray-500">No activity logged yet.</p> : activitiesLoaded ? (
              <div className="mt-3 space-y-2">
                {activities.map((activity) => {
                  const Icon = ACTIVITY_ICONS[activity.type] ?? MessageSquare
                  const color = ACTIVITY_COLORS[activity.type] ?? ACTIVITY_COLORS.note
                  return (
                    <div key={activity.id} className="flex gap-2.5">
                      <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', color)}><Icon size={12} /></div>
                      <div className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800">
                        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titleize(activity.type)}</span><span className="text-xs text-gray-400">{formatDateTime(activity.created_at)}</span></div>
                        {activity.body && <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{activity.body}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Calls</p><h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Recent call history</h2></div><Link href="/admin/crm/calls" className="text-sm font-semibold text-green-600 hover:text-green-700">View all</Link></div>
            {!callsLoaded && (
              <div className="mt-3 rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Call history loads only when requested.</span>
                  <button onClick={() => void loadCalls()} disabled={loadingCalls} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-green-300 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200">
                    {loadingCalls ? 'Loading…' : 'Load call history'}
                  </button>
                </div>
              </div>
            )}
            {callsLoaded && recentCalls.length === 0 ? <p className="mt-3 text-sm text-gray-500">No calls logged yet.</p> : callsLoaded ? (
              <div className="mt-3 space-y-2">
                {recentCalls.map((call) => (
                  <div key={call.id} className="rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-semibold text-gray-900 dark:text-white">{call.call_outcome}</p><p className="mt-1 text-xs text-gray-500">{formatDateTime(call.call_started_at)}</p></div>
                      <div className="text-right text-xs text-gray-500">{call.duration_seconds != null && <p>{Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</p>}<p className="capitalize">{call.lead_temperature || 'cold'}</p></div>
                    </div>
                    {call.notes && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{call.notes}</p>}
                    {call.next_follow_up_at && <p className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-300">Next follow-up: {formatDateTime(call.next_follow_up_at)}</p>}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">Analyzer</p>
              <h2 className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">Analyzer status</h2>
              <p className="mt-1 text-sm text-gray-500">{lead.readiness_status ?? 'Waiting on analyzer activity'}</p>
            </div>
            {!analyzerLoaded && (
              <button onClick={() => setAnalyzerLoaded(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:text-gray-200">
                Load live analyzer
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Readiness</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{lead.readiness_score != null ? `${lead.readiness_score}/100` : '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Started</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{lead.analyzer_started_at ? formatDateTime(lead.analyzer_started_at) : 'Not started'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Submitted</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{lead.analyzer_submitted_at ? formatDateTime(lead.analyzer_submitted_at) : 'Not submitted'}</p>
            </div>
          </div>
          {lead.analyzer_summary && (
            <p className="mt-3 rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-700 dark:bg-gray-800/70 dark:text-gray-200">
              {lead.analyzer_summary}
            </p>
          )}
          {analyzerLoaded && <div className="mt-4"><AnalyzerLivePanel leadId={lead.id} sourceContext="lead_detail" /></div>}
        </div>

        <button onClick={deleteLead} className="mt-4 flex w-full items-center justify-center gap-1.5 py-3 text-xs text-red-400 transition-colors hover:text-red-600">
          <Trash2 size={13} /> Delete this lead
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:hidden">
        <div className="flex gap-2">
          <button onClick={authorizeDial} disabled={authorizingCall} className={cn('flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold', authorizingCall ? 'bg-gray-300' : 'bg-green-600 text-white')}>
            {authorizingCall ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />} Call
          </button>
          {lead.email && <button onClick={() => setShowEmail(true)} className="btn-secondary flex h-10 flex-1 items-center justify-center gap-1.5 text-sm font-semibold"><Mail size={16} /> Email</button>}
          <button onClick={() => void openBookDemoModal()} className="btn-secondary flex h-10 flex-1 items-center justify-center gap-1.5 text-sm font-semibold"><CalendarPlus size={16} /> Demo</button>
        </div>
      </div>

      {showDisposition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setShowDisposition(false); setSelectedDispositionKey(null) }}>
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h2 className="text-base font-bold text-gray-900 dark:text-white">Set Disposition</h2><p className="text-sm text-gray-500">Updates status, stage, follow-up, and activity history in one save.</p></div>
              <button type="button" onClick={() => { setShowDisposition(false); setSelectedDispositionKey(null) }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">Close</button>
            </div>
            <CRMDispositionForm initialDispositionKey={selectedDispositionKey} onSubmit={saveDisposition} submitting={savingDisposition} error={dispositionError} lastDisposition={{ label: lead.last_call_outcome || 'No disposition yet', by: adminEmail || null, at: lead.last_call_at ? formatDateTime(lead.last_call_at) : null, note: lead.latest_call_note || null, followUpAt: lead.follow_up_at ? formatDateTime(lead.follow_up_at) : null }} />
          </div>
        </div>
      )}
      {showBookDemo && <BookDemoModal lead={lead} calendarEnabled={calendarSummary.configured} calendarAuthUrl={calendarAuthUrl} onClose={() => setShowBookDemo(false)} onBooked={handleDemoBooked} />}
      {showEmail && <SendEmailModal lead={lead} onClose={() => setShowEmail(false)} onSent={handleEmailSent} />}
    </div>
  )
}
