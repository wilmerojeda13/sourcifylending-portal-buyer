'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Phone, Mail, Building2, Calendar, Edit3, Save,
  X, Loader2, MessageSquare, PhoneCall, CheckCircle2,
  Megaphone, Trash2, Ban, CalendarPlus, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
type Stage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'closed_won' | 'closed_lost'

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

interface Props {
  lead: CRMLead
  activities: Activity[]
  adminEmail: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const STAGES: { key: Stage; label: string; color: string }[] = [
  { key: 'new',            label: 'New',           color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { key: 'contacted',      label: 'Contacted',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { key: 'qualified',      label: 'Qualified',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { key: 'demo_scheduled', label: 'Demo Scheduled',color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LeadDetailClient({ lead: initialLead, activities: initialActivities, adminEmail }: Props) {
  const router = useRouter()
  const [lead, setLead]               = useState(initialLead)
  const [activities, setActivities]   = useState(initialActivities)
  const [editing, setEditing]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [noteText, setNoteText]       = useState('')
  const [addingNote, setAddingNote]   = useState(false)
  const [noteType, setNoteType]       = useState<'note' | 'call' | 'email' | 'sms' | 'voicemail'>('note')
  const [showBookDemo, setShowBookDemo]   = useState(false)
  const [showEmail, setShowEmail]         = useState(false)
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-28">

      {/* ── Sticky header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 sticky top-0 z-20 flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <Link href="/admin" className="text-xs text-gray-400 hover:text-green-600 font-medium inline-flex items-center gap-0.5 leading-none mb-0.5">
            <ChevronLeft size={12}/> Admin
          </Link>
          <Link href="/admin/crm" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 font-medium">
            <ChevronLeft size={18}/> Leads
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={toggleDNC} className={cn('text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors', lead.do_not_call ? 'border-red-300 text-red-600 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 text-gray-500')}>
            <Ban size={13}/>
          </button>
          <Link href={`/admin/voice/campaigns/new?crm_lead=${lead.id}`} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 font-medium">
            <Megaphone size={13}/>
          </Link>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
              <Edit3 size={13}/> Edit
            </button>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={saveEdits} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-xs px-2.5 py-1.5"><X size={13}/></button>
            </div>
          )}
        </div>
      </div>

      {/* ── Lead identity ── */}
      <div className="bg-white dark:bg-gray-900 px-4 py-5 border-b border-gray-100 dark:border-gray-800">
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
            <a href={`tel:${lead.phone}`} className="text-base font-semibold text-green-600 flex items-center gap-1.5 mt-1">
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

      {/* ── Content ── */}
      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto lg:max-w-5xl">

        {/* Info / Edit */}
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4">
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
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 py-3 z-20">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <a href={`tel:${lead.phone}`}
            className="flex-1 h-12 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-colors">
            <Phone size={17}/> Call
          </a>
          {lead.email && (
            <button onClick={() => setShowEmail(true)}
              className="flex-1 h-12 btn-secondary flex items-center justify-center gap-2 font-semibold text-sm">
              <Mail size={17}/> Email
            </button>
          )}
          <button onClick={() => setShowBookDemo(true)}
            className="flex-1 h-12 btn-secondary flex items-center justify-center gap-2 font-semibold text-sm">
            <CalendarPlus size={17}/> Demo
          </button>
          <Link href={`/admin/voice/campaigns/new?from_crm=1&lead_id=${lead.id}`} target="_blank" rel="noopener noreferrer"
            className="h-12 w-12 btn-secondary flex items-center justify-center shrink-0">
            <Megaphone size={17}/>
          </Link>
        </div>
      </div>

      {showBookDemo && <BookDemoModal lead={lead} onClose={()=>setShowBookDemo(false)} onBooked={handleDemoBooked}/>}
      {showEmail && <SendEmailModal lead={lead} onClose={()=>setShowEmail(false)} onSent={handleEmailSent}/>}
    </div>
  )
}
