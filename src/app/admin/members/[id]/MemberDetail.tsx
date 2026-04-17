'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, User, Shield, ShieldOff, CheckCircle, Clock, Lock, AlertTriangle,
  FileText, BarChart2, Bell, Save, Loader2, AlertOctagon, ChevronDown, ChevronUp,
  MessageSquare, Tag, LayoutDashboard, Pin, Trash2, Plus, X,
  ChevronRight, Zap, BanIcon, DollarSign, ExternalLink, RefreshCw, Building2,
} from 'lucide-react'
import BillingControlPanel from '@/components/admin/BillingControlPanel'
import type {
  UserProfile, Task, Document, ActivityLog, ContactNote, Ticket,
  ProgramId, SubscriptionStatus, ReadinessStatus, TicketStatus, TicketPriority,
} from '@/types'
import { getProgramShortLabel } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  profile: UserProfile & {
    stripe_customer_id?: string
    active_programs?: string[]
    suspicious_signup?: boolean
    suspicious_signup_reason?: string | null
    signup_risk_score?: number | null
  }
  subscription: {
    id: string
    stripe_subscription_id: string | null
    stripe_customer_id: string | null
    status: string
    current_period_start: string | null
    current_period_end: string | null
  } | null
  tasks: Task[]
  documents: Document[]
  activityLogs: ActivityLog[]
  contactNotes: ContactNote[]
  tickets: Ticket[]
  linkedBusinesses?: Array<{
    id: string
    label: string
    entity_type: string | null
    industry: string | null
    role: string
    is_default: boolean
    account_state: string
    subscription_status: string
    assigned_program: string | null
    portal_blocked: boolean
    created_at: string | null
    is_current: boolean
    business_status: 'active' | 'inactive' | 'pending'
  }>
}

type ActiveTab = 'overview' | 'notes' | 'tickets' | 'ai' | 'billing'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'inactive']
const PROGRAM_OPTIONS: (ProgramId | '')[] = ['', 'program_a', 'program_b', 'program_c']
const READINESS_OPTIONS: (ReadinessStatus | '')[] = ['', 'Ready', 'Conditionally Ready', 'Not Ready']
const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed']
const TICKET_PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent']

const statusColors: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-600',
  inactive: 'bg-gray-100 text-gray-500',
}

const ticketStatusColors: Record<TicketStatus, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-500',
}

const ticketPriorityColors: Record<TicketPriority, string> = {
  low:    'bg-gray-100 text-gray-500',
  normal: 'bg-blue-50 text-blue-600',
  high:   'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function formatActivityMeta(data: Record<string, unknown> | null): string {
  if (!data || Object.keys(data).length === 0) return ''
  const parts: string[] = []
  if (data.program) {
    const p = String(data.program)
    parts.push(p.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()))
  }
  if (data.risk_score !== undefined) parts.push(`Risk Score: ${data.risk_score}`)
  if (data.next_due_at) {
    const d = new Date(String(data.next_due_at))
    parts.push(`Next due: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
  }
  if (data.changes && typeof data.changes === 'object') {
    const changed = Object.entries(data.changes as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k]) => k.replace(/_/g, ' '))
    if (changed.length) parts.push(changed.slice(0, 3).join(', '))
  }
  if (data.approval_likelihood) parts.push(String(data.approval_likelihood).replace(/_/g, ' '))
  return parts.join(' · ')
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MemberDetail({
  profile,
  subscription,
  tasks,
  documents,
  activityLogs,
  contactNotes: initialNotes,
  tickets: initialTickets,
  linkedBusinesses = [],
}: Props) {

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')

  // ── Profile form ──
  const [form, setForm] = useState({
    subscription_status: profile.subscription_status,
    plan_tier: (profile.plan_tier ?? '') as '' | 'free' | 'paid',
    assigned_program: profile.assigned_program ?? '',
    current_stage: profile.current_stage ?? '',
    readiness_status: profile.readiness_status ?? '',
    progress_percentage: profile.progress_percentage ?? 0,
    admin_notes: profile.admin_notes ?? '',
    portal_blocked: profile.portal_blocked ?? false,
  })

  // ── Multi-program memberships ──
  const ALL_PROGRAMS: { code: ProgramId; label: string; color: string }[] = [
    { code: 'program_a', label: 'Program A — Personal Credit', color: 'blue' },
    { code: 'program_b', label: 'Program B — Business Credit', color: 'purple' },
    { code: 'program_c', label: 'Program C — Monitoring', color: 'green' },
  ]
  const [activePrograms, setActivePrograms] = useState<string[]>(
    (profile as UserProfile & { active_programs?: string[] }).active_programs ??
    (profile.assigned_program ? [profile.assigned_program] : [])
  )
  const [togglingProgram, setTogglingProgram] = useState<string | null>(null)

  async function toggleProgram(programCode: ProgramId) {
    const isActive = activePrograms.includes(programCode)
    setTogglingProgram(programCode)
    try {
      if (isActive) {
        // Remove
        const res = await fetch('/api/admin/memberships', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: profile.id, program_code: programCode }),
        })
        if (!res.ok) throw new Error('Failed')
        setActivePrograms((prev) => prev.filter((p) => p !== programCode))
        toast.success(`${programCode} removed`)
      } else {
        // Add
        const res = await fetch('/api/admin/memberships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: profile.id, program_code: programCode }),
        })
        if (!res.ok) throw new Error('Failed')
        setActivePrograms((prev) => [...prev, programCode])
        toast.success(`${programCode} added`)
      }
    } catch {
      toast.error('Failed to update program')
    } finally {
      setTogglingProgram(null)
    }
  }
  const [saving, setSaving] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [grantingAccess, setGrantingAccess] = useState(false)
  const [accessGranted, setAccessGranted] = useState(
    !!(profile as UserProfile & { access_granted_at?: string }).access_granted_at
  )
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [showActivityLog, setShowActivityLog] = useState(false)

  // ── Notification ──
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [sendingNotif, setSendingNotif] = useState(false)

  // ── Contact Notes ──
  const [notes, setNotes] = useState<ContactNote[]>(initialNotes)
  const [newNote, setNewNote] = useState('')
  const [pinNote, setPinNote] = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)

  // ── Tickets ──
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets)
  const [showCreateTicket, setShowCreateTicket] = useState(false)
  const [ticketForm, setTicketForm] = useState({ title: '', description: '', priority: 'normal' as TicketPriority, category: 'general' })
  const [creatingTicket, setCreatingTicket] = useState(false)
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null)
  const [ticketResolution, setTicketResolution] = useState<Record<string, string>>({})
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null)

  // ── Invite ──
  const [inviteStatus, setInviteStatus] = useState<string>(
    (profile as UserProfile & { invite_status?: string; invite_token?: string; invite_sent_at?: string; invite_accepted_at?: string; invite_expires_at?: string }).invite_status ?? 'not_sent'
  )
  const [inviteToken] = useState<string | null>(
    (profile as UserProfile & { invite_token?: string }).invite_token ?? null
  )
  const [inviteSentAt] = useState<string | null>(
    (profile as UserProfile & { invite_sent_at?: string }).invite_sent_at ?? null
  )
  const [inviteAcceptedAt] = useState<string | null>(
    (profile as UserProfile & { invite_accepted_at?: string }).invite_accepted_at ?? null
  )
  const [inviteExpiresAt] = useState<string | null>(
    (profile as UserProfile & { invite_expires_at?: string }).invite_expires_at ?? null
  )
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  // ── Account Info edit ──
  const [infoForm, setInfoForm] = useState({
    full_name:     profile.full_name ?? '',
    email:         profile.email ?? '',
    phone:         (profile as UserProfile & { phone?: string }).phone ?? '',
    business_name: profile.business_name ?? '',
    business_age:  profile.business_age ?? '',
    entity_type:   profile.entity_type ?? '',
    industry:      profile.industry ?? '',
    account_state: profile.account_state ?? 'prospect',
    nsf_flag:      profile.nsf_flag ?? false,
  })
  const [savingInfo, setSavingInfo] = useState(false)

  async function saveAccountInfo() {
    setSavingInfo(true)
    try {
      const res = await fetch('/api/admin/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, ...infoForm }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      toast.success('Account info saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingInfo(false)
    }
  }

  // ── Password controls ──
  const [newPassword, setNewPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  async function forceSetPassword() {
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setSettingPassword(true)
    try {
      const res = await fetch('/api/admin/member/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, new_password: newPassword }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success('Password updated')
      setNewPassword('')
      setShowPasswordModal(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSettingPassword(false)
    }
  }

  async function sendPasswordReset() {
    setSendingReset(true)
    try {
      const res = await fetch('/api/admin/member/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, send_reset: true }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success('Password reset email sent')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSendingReset(false)
    }
  }

  // ── AI Controls ──
  const [aiForm, setAiForm] = useState({
    ai_suspended: profile.ai_suspended ?? false,
    ai_custom_monthly_credits: profile.ai_custom_monthly_credits ?? '',
    ai_custom_daily_cap: profile.ai_custom_daily_cap ?? '',
    ai_custom_heavy_limit: profile.ai_custom_heavy_limit ?? '',
    ai_access_notes: profile.ai_access_notes ?? '',
  })
  const [savingAi, setSavingAi] = useState(false)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditType, setCreditType] = useState<'bonus' | 'deduction' | 'reset'>('bonus')
  const [applyingCredit, setApplyingCredit] = useState(false)
  const [aiEvents, setAiEvents] = useState<Array<{
    id: string; action_type: string; credits_charged: number;
    request_status: string; created_at: string; estimated_cost_usd: number
  }>>([])
  const [loadingAiEvents, setLoadingAiEvents] = useState(false)
  const [aiEventsLoaded, setAiEventsLoaded] = useState(false)

  // ── Task stats ──
  const taskStats = {
    total:     tasks.length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    pending:   tasks.filter((t) => t.status === 'pending').length,
    locked:    tasks.filter((t) => t.status === 'locked').length,
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function saveProfile() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          subscription_status: form.subscription_status,
          plan_tier: form.plan_tier || null,
          assigned_program: form.assigned_program || null,
          current_stage: form.current_stage || null,
          readiness_status: form.readiness_status || null,
          progress_percentage: Number(form.progress_percentage),
          admin_notes: form.admin_notes || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success('Profile saved')
    } catch {
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function togglePortalBlock() {
    const newBlocked = !form.portal_blocked
    setBlocking(true)
    try {
      const res = await fetch('/api/admin/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, portal_blocked: newBlocked }),
      })
      if (!res.ok) throw new Error('Failed')
      setForm((prev) => ({ ...prev, portal_blocked: newBlocked }))
      toast.success(newBlocked ? 'Portal access blocked' : 'Portal access restored')
    } catch {
      toast.error('Failed to update portal access')
    } finally {
      setBlocking(false)
    }
  }

  async function cancelSubscription() {
    if (!confirm('Cancel this member\'s Stripe subscription? This cannot be undone.')) return
    setCanceling(true)
    try {
      const res = await fetch('/api/admin/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          stripe_subscription_id: subscription?.stripe_subscription_id ?? null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setForm((prev) => ({ ...prev, subscription_status: 'canceled' }))
      toast.success('Subscription canceled')
    } catch {
      toast.error('Cancellation failed')
    } finally {
      setCanceling(false)
    }
  }

  async function deleteAccount() {
    if (deleteConfirmEmail !== profile.email) { toast.error('Email does not match'); return }
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/users?id=${profile.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Account permanently deleted')
      window.location.href = '/admin/members'
    } catch {
      toast.error('Failed to delete account')
      setDeleting(false)
    }
  }

  async function grantPortalAccess() {
    if (!confirm(`Grant portal access to ${profile.full_name || profile.email}? This will be logged with your admin name and timestamp.`)) return
    setGrantingAccess(true)
    try {
      const res = await fetch('/api/admin/grant-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          program: form.assigned_program || null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setAccessGranted(true)
      setForm(prev => ({ ...prev, subscription_status: 'active' }))
      toast.success('Portal access granted — logged with your admin name and timestamp')
    } catch {
      toast.error('Failed to grant access')
    } finally {
      setGrantingAccess(false)
    }
  }

  async function sendNotification() {
    if (!notifTitle.trim() || !notifMessage.trim()) { toast.error('Title and message are required'); return }
    setSendingNotif(true)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, title: notifTitle, message: notifMessage, type: 'system' }),
      })
      if (!res.ok) throw new Error('Failed')
      setNotifTitle('')
      setNotifMessage('')
      toast.success('Notification sent!')
    } catch {
      toast.error('Failed to send notification')
    } finally {
      setSendingNotif(false)
    }
  }

  // ── Notes handlers ──

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, note: newNote, pinned: pinNote }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNotes((prev) => [data.note, ...prev].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }))
      setNewNote('')
      setPinNote(false)
      toast.success('Note added')
    } catch {
      toast.error('Failed to add note')
    } finally {
      setAddingNote(false)
    }
  }

  async function togglePin(note: ContactNote) {
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, pinned: !note.pinned }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNotes((prev) =>
        prev.map((n) => n.id === note.id ? { ...n, pinned: !n.pinned } : n)
          .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1
            if (!a.pinned && b.pinned) return 1
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })
      )
    } catch {
      toast.error('Failed to update note')
    }
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note?')) return
    setDeletingNoteId(id)
    try {
      const res = await fetch(`/api/admin/notes?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setNotes((prev) => prev.filter((n) => n.id !== id))
      toast.success('Note deleted')
    } catch {
      toast.error('Failed to delete note')
    } finally {
      setDeletingNoteId(null)
    }
  }

  // ── Ticket handlers ──

  async function createTicket() {
    if (!ticketForm.title.trim()) { toast.error('Title is required'); return }
    setCreatingTicket(true)
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, ...ticketForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTickets((prev) => [data.ticket, ...prev])
      setTicketForm({ title: '', description: '', priority: 'normal', category: 'general' })
      setShowCreateTicket(false)
      toast.success('Ticket created')
    } catch {
      toast.error('Failed to create ticket')
    } finally {
      setCreatingTicket(false)
    }
  }

  async function updateTicketStatus(id: string, status: TicketStatus) {
    setUpdatingTicketId(id)
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTickets((prev) => prev.map((t) => t.id === id ? data.ticket : t))
      toast.success('Ticket updated')
    } catch {
      toast.error('Failed to update ticket')
    } finally {
      setUpdatingTicketId(null)
    }
  }

  async function saveTicketResolution(ticket: Ticket) {
    const resolution = ticketResolution[ticket.id] ?? ticket.resolution ?? ''
    setUpdatingTicketId(ticket.id)
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ticket.id, resolution, status: resolution ? 'resolved' : ticket.status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTickets((prev) => prev.map((t) => t.id === ticket.id ? data.ticket : t))
      toast.success('Resolution saved')
    } catch {
      toast.error('Failed to save resolution')
    } finally {
      setUpdatingTicketId(null)
    }
  }

  async function deleteTicket(id: string) {
    if (!confirm('Delete this ticket?')) return
    try {
      const res = await fetch(`/api/admin/tickets?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setTickets((prev) => prev.filter((t) => t.id !== id))
      toast.success('Ticket deleted')
    } catch {
      toast.error('Failed to delete ticket')
    }
  }

  // ── AI handlers ──

  async function loadAiEvents() {
    if (aiEventsLoaded) return
    setLoadingAiEvents(true)
    try {
      const res = await fetch(`/api/admin/ai-usage?view=user&user_id=${profile.id}`)
      const data = await res.json()
      setAiEvents(data.events ?? [])
      setAiEventsLoaded(true)
    } catch {
      toast.error('Failed to load AI events')
    } finally {
      setLoadingAiEvents(false)
    }
  }

  async function saveAiControls() {
    setSavingAi(true)
    try {
      const res = await fetch('/api/admin/ai-credits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          ai_suspended: aiForm.ai_suspended,
          ai_custom_monthly_credits: aiForm.ai_custom_monthly_credits === '' ? null : Number(aiForm.ai_custom_monthly_credits),
          ai_custom_daily_cap: aiForm.ai_custom_daily_cap === '' ? null : Number(aiForm.ai_custom_daily_cap),
          ai_custom_heavy_limit: aiForm.ai_custom_heavy_limit === '' ? null : Number(aiForm.ai_custom_heavy_limit),
          ai_access_notes: aiForm.ai_access_notes || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success('AI controls saved')
    } catch {
      toast.error('Failed to save AI controls')
    } finally {
      setSavingAi(false)
    }
  }

  async function applyCredit() {
    if (creditType !== 'reset' && (!creditAmount || Number(creditAmount) <= 0)) {
      toast.error('Enter a valid credit amount')
      return
    }
    setApplyingCredit(true)
    try {
      const res = await fetch('/api/admin/ai-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          adjustment_type: creditType,
          credits_delta: creditType === 'reset' ? 0 : Number(creditAmount),
          reason: creditReason || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setCreditAmount('')
      setCreditReason('')
      setAiEventsLoaded(false)
      toast.success(creditType === 'reset' ? 'Balance reset to allocated credits' : `Credits ${creditType === 'bonus' ? 'added' : 'deducted'}`)
    } catch {
      toast.error('Failed to apply credit adjustment')
    } finally {
      setApplyingCredit(false)
    }
  }

  // ── Invite handlers ──

  async function sendInvite(resend = false) {
    setSendingInvite(true)
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, resend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invite')
      setInviteStatus('sent')
      toast.success(resend ? 'Invite resent!' : 'Invite sent!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send invite')
    } finally {
      setSendingInvite(false)
    }
  }

  async function copyInviteLink() {
    if (!inviteToken) return
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
    const link = `${siteUrl}/claim-account?token=${inviteToken}`
    try {
      await navigator.clipboard.writeText(link)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  // ─── Tab definitions ───────────────────────────────────────────────────────
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={14} /> },
    { id: 'notes', label: 'Notes', icon: <MessageSquare size={14} />, count: notes.length },
    { id: 'tickets', label: 'Tickets', icon: <Tag size={14} />, count: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length },
    { id: 'ai', label: 'AI Credits', icon: <Zap size={14} /> },
    { id: 'billing', label: 'Billing', icon: <DollarSign size={14} /> },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin/members" className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
              <ArrowLeft size={18} className="text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <User size={20} className="text-gray-500" />
                {profile.full_name || 'Unknown User'}
              </h1>
              <p className="text-sm text-gray-500">{profile.email}</p>
              {profile.business_name && (
                <p className="text-xs text-gray-400">{profile.business_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColors[form.subscription_status] ?? 'bg-gray-100 text-gray-500'}`}>
              {form.subscription_status}
            </span>
            {form.portal_blocked && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                <AlertOctagon size={12} /> Portal Blocked
              </span>
            )}
            {(profile as UserProfile & { suspicious_signup?: boolean }).suspicious_signup && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                <AlertTriangle size={12} /> Suspicious Signup
              </span>
            )}
            <button
              onClick={togglePortalBlock}
              disabled={blocking}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                form.portal_blocked
                  ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                  : 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
              }`}
            >
              {blocking ? <Loader2 size={12} className="animate-spin" /> : form.portal_blocked ? <ShieldOff size={12} /> : <Shield size={12} />}
              {form.portal_blocked ? 'Unblock Portal' : 'Block Portal'}
            </button>
            {/* Grant Portal Access — Scenario 2: admin activates after external payment */}
            <button
              onClick={grantPortalAccess}
              disabled={grantingAccess || accessGranted}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                accessGranted
                  ? 'border-green-300 text-green-700 bg-green-50 cursor-default'
                  : 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'
              }`}
              title={accessGranted ? 'Access already granted — logged with admin name + timestamp' : 'Grant portal access after external payment — logs your name and timestamp'}
            >
              {grantingAccess ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              {accessGranted ? 'Access Granted ✓' : 'Grant Portal Access'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
            >
              <Trash2 size={12} /> Delete Account
            </button>
          </div>
        </div>

        {/* ── Delete Confirmation Modal ── */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-bold text-red-700 mb-1">Permanently Delete Account</h2>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                This will permanently delete <strong>{profile.full_name}</strong>&apos;s account, all their tasks, documents, and data. <strong>This cannot be undone.</strong>
              </p>
              <p className="text-xs text-gray-500 mb-2 font-medium">Type the member&apos;s email to confirm:</p>
              <input
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder={profile.email}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmEmail('') }}
                  className="flex-1 text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={deleting || deleteConfirmEmail !== profile.email}
                  className="flex-1 text-sm px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting ? <><Loader2 size={14} className="animate-spin" /> Deleting…</> : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Main Content (tabbed) ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Tab Nav */}
            <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 shadow-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id as ActiveTab); if (tab.id === 'ai') loadAiEvents() }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors ${
                    activeTab === tab.id
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ══ TAB: OVERVIEW ══ */}
            {activeTab === 'overview' && (
              <div className="space-y-4">

                {(profile as UserProfile & { suspicious_signup?: boolean; suspicious_signup_reason?: string | null; signup_risk_score?: number | null }).suspicious_signup && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                      <AlertTriangle size={16} /> Suspicious Signup Flag
                    </h2>
                    <p className="mt-2 text-xs text-amber-800">
                      {((profile as UserProfile & { suspicious_signup_reason?: string | null }).suspicious_signup_reason) ?? 'This signup matched bot-like or junk-account heuristics.'}
                    </p>
                    {(profile as UserProfile & { signup_risk_score?: number | null }).signup_risk_score !== null && (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Risk score: {(profile as UserProfile & { signup_risk_score?: number | null }).signup_risk_score}
                      </p>
                    )}
                  </div>
                )}

                {/* Lead & contact context */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText size={18} className="text-green-600" /> Lead & Contact Context
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Lead Link</div>
                      <div className="mt-1 text-gray-900 font-medium break-all">
                        {profile.lead_id ? (
                          <Link href={`/admin/crm/${profile.lead_id}`} className="text-green-700 hover:underline">
                            {profile.lead_id}
                          </Link>
                        ) : (
                          'Not linked'
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Account State</div>
                      <div className="mt-1 text-gray-900 font-medium">{infoForm.account_state.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Acquisition</div>
                      <div className="mt-1 text-gray-900 font-medium">{profile.acquisition_path.replace(/_/g, ' ')}</div>
                      {profile.assigned_partner_name && (
                        <div className="mt-1 text-xs text-gray-500">Partner: {profile.assigned_partner_name}</div>
                      )}
                    </div>
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Contact</div>
                      <div className="mt-1 text-gray-900 font-medium break-all">{profile.email}</div>
                      {((profile as UserProfile & { phone?: string }).phone) && (
                        <div className="mt-1 text-xs text-gray-500">{(profile as UserProfile & { phone?: string }).phone}</div>
                      )}
                    </div>
                    {profile.latest_analyzer_result && (
                      <div className="sm:col-span-2 rounded-xl bg-gray-50 border border-gray-100 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Lead Summary</div>
                        <div className="mt-1 text-gray-900 font-medium">
                          {profile.latest_analyzer_result.summary}
                        </div>
                        {profile.latest_analyzer_result.recommended_next_step && (
                          <div className="mt-1 text-xs text-gray-500">
                            Next step: {profile.latest_analyzer_result.recommended_next_step}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Profile & Subscription Form */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-4">Profile & Subscription</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Subscription Status</label>
                      <select
                        value={form.subscription_status}
                        onChange={(e) => setForm((p) => ({ ...p, subscription_status: e.target.value as SubscriptionStatus }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Plan Tier</label>
                      <select
                        value={form.plan_tier || ''}
                        onChange={(e) => setForm((p) => ({ ...p, plan_tier: e.target.value === '' ? null : (e.target.value as 'free' | 'paid') }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Unset</option>
                        <option value="free">Free</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Programs Enrolled</label>
                      <div className="space-y-2">
                        {ALL_PROGRAMS.map(({ code, label, color }) => {
                          const isActive = activePrograms.includes(code)
                          const isToggling = togglingProgram === code
                          const colorMap: Record<string, string> = {
                            blue: isActive ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white border-gray-200 text-gray-500',
                            purple: isActive ? 'bg-purple-50 border-purple-300 text-purple-800' : 'bg-white border-gray-200 text-gray-500',
                            green: isActive ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-500',
                          }
                          return (
                            <button
                              key={code}
                              type="button"
                              onClick={() => toggleProgram(code)}
                              disabled={isToggling}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${colorMap[color]}`}
                            >
                              <span className="flex items-center gap-2">
                                {isToggling ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <span className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center ${isActive ? 'bg-current border-current' : 'border-gray-400'}`}>
                                    {isActive && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                                  </span>
                                )}
                                {label}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/60' : 'bg-gray-100 text-gray-400'}`}>
                                {isActive ? 'Active' : 'Add'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      {activePrograms.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1.5">⚠ No programs assigned — client cannot access portal content</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Current Stage</label>
                      <input
                        type="text"
                        value={form.current_stage}
                        onChange={(e) => setForm((p) => ({ ...p, current_stage: e.target.value }))}
                        placeholder="e.g. Stage 1 — Foundation"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Readiness Status</label>
                      <select
                        value={form.readiness_status}
                        onChange={(e) => setForm((p) => ({ ...p, readiness_status: e.target.value as ReadinessStatus | '' }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        {READINESS_OPTIONS.map((r) => <option key={r} value={r}>{r || '— None —'}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Progress % (0–100)</label>
                      <input
                        type="number" min={0} max={100}
                        value={form.progress_percentage}
                        onChange={(e) => setForm((p) => ({ ...p, progress_percentage: Number(e.target.value) }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Admin Notes (internal)</label>
                      <textarea
                        value={form.admin_notes}
                        onChange={(e) => setForm((p) => ({ ...p, admin_notes: e.target.value }))}
                        placeholder="Internal notes visible only to admins…"
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                      />
                    </div>

                  </div>
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save Changes
                    </button>
                    {subscription?.stripe_subscription_id && form.subscription_status !== 'canceled' && (
                      <button
                        onClick={cancelSubscription}
                        disabled={canceling}
                        className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                      >
                        {canceling ? <Loader2 size={14} className="animate-spin" /> : null}
                        Cancel Stripe Sub
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Account Info Edit ── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <User size={18} className="text-green-600" /> Account Info
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full Name</label>
                      <input
                        type="text"
                        value={infoForm.full_name}
                        onChange={(e) => setInfoForm((p) => ({ ...p, full_name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email Address</label>
                      <input
                        type="email"
                        value={infoForm.email}
                        onChange={(e) => setInfoForm((p) => ({ ...p, email: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <p className="text-xs text-amber-600 mt-1">⚠ Changing email updates login credentials</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone Number</label>
                      <input
                        type="tel"
                        value={infoForm.phone}
                        onChange={(e) => setInfoForm((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="(555) 000-0000"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Business Name</label>
                      <input
                        type="text"
                        value={infoForm.business_name}
                        onChange={(e) => setInfoForm((p) => ({ ...p, business_name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Entity Type</label>
                      <select
                        value={infoForm.entity_type}
                        onChange={(e) => setInfoForm((p) => ({ ...p, entity_type: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">— None —</option>
                        {['LLC', 'S-Corp', 'C-Corp', 'Sole Proprietor', 'Partnership', 'Non-Profit'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Business Age</label>
                      <select
                        value={infoForm.business_age}
                        onChange={(e) => setInfoForm((p) => ({ ...p, business_age: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">— None —</option>
                        {['Under 6 months', '6–12 months', '1–2 years', '2–5 years', '5+ years'].map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Industry</label>
                      <input
                        type="text"
                        value={infoForm.industry}
                        onChange={(e) => setInfoForm((p) => ({ ...p, industry: e.target.value }))}
                        placeholder="e.g. Transportation, Retail…"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Account State</label>
                      <select
                        value={infoForm.account_state}
                        onChange={(e) => setInfoForm((p) => ({ ...p, account_state: e.target.value as UserProfile['account_state'] }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="prospect">Prospect</option>
                        <option value="active_member">Active Member</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={infoForm.nsf_flag}
                          onChange={(e) => setInfoForm((p) => ({ ...p, nsf_flag: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          NSF Flag <span className="text-xs text-gray-400 font-normal">(Non-Sufficient Funds — blocks certain credit applications)</span>
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={saveAccountInfo}
                      disabled={savingInfo}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {savingInfo ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save Account Info
                    </button>
                  </div>
                </div>

                {/* ── Security & Access ── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Shield size={18} className="text-green-600" /> Security &amp; Password
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setShowPasswordModal(true)}
                      className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      <Lock size={14} /> Set New Password
                    </button>
                    <button
                      onClick={sendPasswordReset}
                      disabled={sendingReset}
                      className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {sendingReset ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Send Password Reset Email
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    &quot;Set New Password&quot; forces a new password immediately. &quot;Send Reset Email&quot; emails the client a link to reset their own password.
                  </p>
                </div>

                {/* ── Set Password Modal ── */}
                {showPasswordModal && (
                  <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                      <h2 className="text-lg font-bold text-gray-900 mb-1">Set New Password</h2>
                      <p className="text-sm text-gray-500 mb-4">
                        This immediately updates <strong>{profile.full_name}</strong>&apos;s login password. They will need to use this new password next time they sign in.
                      </p>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        minLength={8}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowPasswordModal(false); setNewPassword('') }}
                          className="flex-1 text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={forceSetPassword}
                          disabled={settingPassword || newPassword.length < 8}
                          className="flex-1 text-sm px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {settingPassword ? <Loader2 size={14} className="animate-spin" /> : null}
                          Set Password
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tasks */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <CheckCircle size={18} className="text-green-600" /> Tasks
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: 'Total', value: taskStats.total, color: 'text-gray-900' },
                      { label: 'Done', value: taskStats.completed, color: 'text-green-600' },
                      { label: 'Pending', value: taskStats.pending, color: 'text-amber-600' },
                      { label: 'Locked', value: taskStats.locked, color: 'text-gray-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center bg-gray-50 rounded-xl py-3">
                        <div className={`text-xl font-bold ${color}`}>{value}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {tasks.map((t) => {
                      const Icon = t.status === 'completed' ? CheckCircle : t.status === 'locked' ? Lock : t.status === 'overdue' ? AlertTriangle : Clock
                      const iconColor = t.status === 'completed' ? 'text-green-500' : t.status === 'locked' ? 'text-gray-300' : t.status === 'overdue' ? 'text-red-500' : 'text-amber-500'
                      return (
                        <div key={t.task_id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${t.status === 'locked' ? 'opacity-50' : ''}`}>
                          <Icon size={15} className={iconColor} />
                          <span className={`flex-1 text-xs font-medium ${t.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                            {t.title}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">{t.stage}</span>
                        </div>
                      )
                    })}
                    {tasks.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No tasks assigned</p>}
                  </div>
                </div>

                {/* Documents */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText size={18} className="text-blue-600" /> Documents ({documents.length})
                  </h2>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {documents.map((doc) => (
                      <div key={doc.document_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
                        <FileText size={15} className="text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{doc.file_name}</p>
                          <p className="text-[10px] text-gray-400">{doc.document_type} · {doc.review_status}</p>
                        </div>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline shrink-0">View</a>
                      </div>
                    ))}
                    {documents.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No documents uploaded</p>}
                  </div>
                </div>

              </div>
            )}

            {/* ══ TAB: NOTES ══ */}
            {activeTab === 'notes' && (
              <div className="space-y-4">

                {/* Add Note */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <MessageSquare size={18} className="text-green-600" /> Add Note
                  </h2>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Write a contact note, call summary, update, or any internal memo…"
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                  <div className="flex items-center justify-between mt-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pinNote}
                        onChange={(e) => setPinNote(e.target.checked)}
                        className="w-4 h-4 accent-green-600"
                      />
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <Pin size={12} className="text-amber-500" /> Pin to top
                      </span>
                    </label>
                    <button
                      onClick={addNote}
                      disabled={addingNote || !newNote.trim()}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {addingNote ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      Add Note
                    </button>
                  </div>
                </div>

                {/* Notes List */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    Contact Notes <span className="text-xs text-gray-400 font-normal">({notes.length})</span>
                  </h2>
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className={`rounded-xl p-4 border ${note.pinned ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.note}</p>
                            <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-2">
                              {note.pinned && <span className="flex items-center gap-1 text-amber-600"><Pin size={10} /> Pinned</span>}
                              {note.admin_email && <span>{note.admin_email}</span>}
                              <span>{fmtDateTime(note.created_at)}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => togglePin(note)}
                              title={note.pinned ? 'Unpin' : 'Pin'}
                              className={`p-1.5 rounded-lg transition-colors ${note.pinned ? 'text-amber-500 hover:bg-amber-100' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}
                            >
                              <Pin size={13} />
                            </button>
                            <button
                              onClick={() => deleteNote(note.id)}
                              disabled={deletingNoteId === note.id}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                            >
                              {deletingNoteId === note.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {notes.length === 0 && (
                      <div className="text-center py-8">
                        <MessageSquare size={24} className="text-gray-200 mx-auto mb-2" />
                        <p className="text-xs text-gray-400">No notes yet. Add the first one above.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Activity Log */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50"
                    onClick={() => setShowActivityLog(!showActivityLog)}
                  >
                    <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <FileText size={16} className="text-gray-400" /> Activity Log ({activityLogs.length})
                    </h2>
                    {showActivityLog ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>
                  {showActivityLog && (
                    <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                      {activityLogs.map((log) => (
                        <div key={log.id} className="px-4 py-2.5 flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-1.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 capitalize">{log.event_type.replace(/_/g, ' ')}</p>
                            {formatActivityMeta(log.event_data) && (
                              <p className="text-[10px] text-indigo-500 mt-0.5">{formatActivityMeta(log.event_data)}</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-0.5">{fmtDateTime(log.created_at)}</p>
                          </div>
                        </div>
                      ))}
                      {activityLogs.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No activity yet</p>}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ══ TAB: TICKETS ══ */}
            {activeTab === 'tickets' && (
              <div className="space-y-4">

                {/* Header + Create Button */}
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <Tag size={18} className="text-purple-600" /> Support Tickets
                    <span className="text-xs text-gray-400 font-normal">({tickets.length})</span>
                  </h2>
                  <button
                    onClick={() => setShowCreateTicket(!showCreateTicket)}
                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                  >
                    {showCreateTicket ? <X size={13} /> : <Plus size={13} />}
                    {showCreateTicket ? 'Cancel' : 'New Ticket'}
                  </button>
                </div>

                {/* Create Ticket Form */}
                {showCreateTicket && (
                  <div className="bg-white rounded-2xl border border-purple-200 shadow-sm p-5">
                    <h3 className="font-semibold text-gray-900 mb-4 text-sm">Create Ticket</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label>
                        <input
                          type="text"
                          value={ticketForm.title}
                          onChange={(e) => setTicketForm((p) => ({ ...p, title: e.target.value }))}
                          placeholder="Brief description of the issue…"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                        <textarea
                          value={ticketForm.description}
                          onChange={(e) => setTicketForm((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Additional details…"
                          rows={2}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label>
                          <select
                            value={ticketForm.priority}
                            onChange={(e) => setTicketForm((p) => ({ ...p, priority: e.target.value as TicketPriority }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                          <input
                            type="text"
                            value={ticketForm.category}
                            onChange={(e) => setTicketForm((p) => ({ ...p, category: e.target.value }))}
                            placeholder="e.g. billing, access, tasks"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                      <button
                        onClick={createTicket}
                        disabled={creatingTicket || !ticketForm.title.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 transition-colors"
                      >
                        {creatingTicket ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Create Ticket
                      </button>
                    </div>
                  </div>
                )}

                {/* Tickets List */}
                <div className="space-y-3">
                  {tickets.map((ticket) => {
                    const isExpanded = expandedTicketId === ticket.id
                    return (
                      <div key={ticket.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div
                          className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50"
                          onClick={() => setExpandedTicketId(isExpanded ? null : ticket.id)}
                        >
                          <ChevronRight size={14} className={`text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{ticket.title}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{ticket.category} · {fmtDate(ticket.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ticketPriorityColors[ticket.priority]}`}>
                              {ticket.priority}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ticketStatusColors[ticket.status]}`}>
                              {ticket.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-3">
                            {ticket.description && (
                              <p className="text-xs text-gray-600 leading-relaxed">{ticket.description}</p>
                            )}

                            {/* Status update */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-gray-500">Status:</span>
                              {TICKET_STATUSES.map((s) => (
                                <button
                                  key={s}
                                  onClick={() => updateTicketStatus(ticket.id, s)}
                                  disabled={updatingTicketId === ticket.id || ticket.status === s}
                                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                                    ticket.status === s
                                      ? ticketStatusColors[s]
                                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                  } disabled:cursor-default`}
                                >
                                  {updatingTicketId === ticket.id && ticket.status !== s ? <Loader2 size={10} className="inline animate-spin" /> : s.replace('_', ' ')}
                                </button>
                              ))}
                            </div>

                            {/* Resolution */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">Resolution / Notes</label>
                              <textarea
                                value={ticketResolution[ticket.id] ?? ticket.resolution ?? ''}
                                onChange={(e) => setTicketResolution((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                                placeholder="How was this resolved?"
                                rows={2}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => saveTicketResolution(ticket)}
                                disabled={updatingTicketId === ticket.id}
                                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                              >
                                {updatingTicketId === ticket.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                Save
                              </button>
                              <button
                                onClick={() => deleteTicket(ticket.id)}
                                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={11} /> Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {tickets.length === 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm text-center py-12">
                      <Tag size={28} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">No tickets yet. Create one above to track issues.</p>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ══ TAB: BILLING ══ */}
            {activeTab === 'billing' && (
              <div className="space-y-4">
                <BillingControlPanel userId={profile.id} />
              </div>
            )}

            {/* ══ TAB: AI CREDITS ══ */}
            {activeTab === 'ai' && (
              <div className="space-y-4">

                {/* Status + Suspend toggle */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-gray-900 flex items-center gap-2">
                      <Zap size={18} className="text-purple-600" /> AI Access
                    </h2>
                    <button
                      onClick={() => setAiForm((p) => ({ ...p, ai_suspended: !p.ai_suspended }))}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                        aiForm.ai_suspended
                          ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                          : 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
                      }`}
                    >
                      {aiForm.ai_suspended ? <><Zap size={12} /> Unsuspend AI</> : <><BanIcon size={12} /> Suspend AI</>}
                    </button>
                  </div>
                  {aiForm.ai_suspended && (
                    <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      <BanIcon size={14} className="text-red-500 shrink-0" />
                      <p className="text-xs text-red-700 font-medium">AI access is currently suspended for this user.</p>
                    </div>
                  )}

                  {/* Custom limit overrides */}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Custom Limit Overrides</p>
                  <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                    Leave blank to use program defaults. Set a value to override for this user only.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Monthly Credits</label>
                      <input
                        type="number" min={0}
                        value={aiForm.ai_custom_monthly_credits}
                        onChange={(e) => setAiForm((p) => ({ ...p, ai_custom_monthly_credits: e.target.value }))}
                        placeholder="Program default"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Daily Credit Cap</label>
                      <input
                        type="number" min={0}
                        value={aiForm.ai_custom_daily_cap}
                        onChange={(e) => setAiForm((p) => ({ ...p, ai_custom_daily_cap: e.target.value }))}
                        placeholder="Program default"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Heavy Actions/Day</label>
                      <input
                        type="number" min={0}
                        value={aiForm.ai_custom_heavy_limit}
                        onChange={(e) => setAiForm((p) => ({ ...p, ai_custom_heavy_limit: e.target.value }))}
                        placeholder="Program default"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Access notes */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">AI Access Notes</label>
                    <textarea
                      value={aiForm.ai_access_notes}
                      onChange={(e) => setAiForm((p) => ({ ...p, ai_access_notes: e.target.value }))}
                      placeholder="Internal notes about this user's AI access…"
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                  </div>

                  <button
                    onClick={saveAiControls}
                    disabled={savingAi}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {savingAi ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save AI Settings
                  </button>
                </div>

                {/* Credit Adjustments */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <Zap size={18} className="text-amber-500" /> Credit Adjustment
                  </h2>
                  <p className="text-xs text-gray-400 mb-4">Add, remove, or reset this user's current billing period credits.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                      <select
                        value={creditType}
                        onChange={(e) => setCreditType(e.target.value as 'bonus' | 'deduction' | 'reset')}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="bonus">Bonus (add credits)</option>
                        <option value="deduction">Deduction (remove credits)</option>
                        <option value="reset">Reset to allocated</option>
                      </select>
                    </div>
                    {creditType !== 'reset' && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Amount</label>
                        <input
                          type="number" min={1}
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                          placeholder="e.g. 50"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    )}
                    <div className={creditType === 'reset' ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Reason (optional)</label>
                      <input
                        type="text"
                        value={creditReason}
                        onChange={(e) => setCreditReason(e.target.value)}
                        placeholder="e.g. Goodwill adjustment"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={applyCredit}
                    disabled={applyingCredit}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {applyingCredit ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    Apply Adjustment
                  </button>
                </div>

                {/* Recent AI Events */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <FileText size={16} className="text-gray-400" /> Recent AI Events
                    </h2>
                    <button
                      onClick={() => { setAiEventsLoaded(false); loadAiEvents() }}
                      className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                    >
                      Refresh
                    </button>
                  </div>
                  {loadingAiEvents ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-gray-300" />
                    </div>
                  ) : aiEvents.length === 0 ? (
                    <div className="px-5 py-8 text-center text-gray-400 text-xs">No AI events recorded yet.</div>
                  ) : (
                    <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                      {aiEvents.slice(0, 20).map((ev) => (
                        <div key={ev.id} className="flex items-center gap-3 px-5 py-2.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            ev.request_status === 'success' ? 'bg-green-400' :
                            ev.request_status === 'blocked' ? 'bg-red-400' : 'bg-gray-300'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate capitalize">
                              {ev.action_type.replace(/_/g, ' ')}
                            </p>
                            <p className="text-[10px] text-gray-400">{new Date(ev.created_at).toLocaleString()}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {ev.request_status === 'success' && (
                              <span className="text-xs font-semibold text-purple-600">−{ev.credits_charged} cr</span>
                            )}
                            {ev.request_status === 'blocked' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">Blocked</span>
                            )}
                            {ev.request_status === 'failed' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">Failed</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>

          {/* ── Right Sidebar (always visible) ── */}
          <div className="space-y-4">

            {/* Businesses */}
            {linkedBusinesses.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Building2 size={18} className="text-gray-500" /> Businesses
                </h2>
                <div className="space-y-2">
                  {linkedBusinesses.map((business) => (
                    <Link
                      key={business.id}
                      href={`/admin/members/${business.id}`}
                      className={`block rounded-xl border px-3 py-2.5 transition-colors ${
                        business.is_current
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{business.label}</p>
                          <div className="mt-1 space-y-1 text-[11px] text-gray-500">
                            <p>
                              {business.role} · {business.account_state.replace('_', ' ')} · subscription {business.subscription_status}
                            </p>
                            <p>
                              Status: {business.business_status} · Program: {business.assigned_program ? getProgramShortLabel(business.assigned_program as ProgramId) : 'None selected'}
                            </p>
                            <p>
                              Entity: {business.entity_type ?? '—'} · Industry: {business.industry ?? '—'}
                            </p>
                            <p>
                              Created: {business.created_at ? fmtDate(business.created_at) : '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {business.is_default && (
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-700">Default</span>
                          )}
                          {business.is_current && (
                            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-green-700">Open</span>
                          )}
                          {business.portal_blocked && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600">Blocked</span>
                          )}
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            business.business_status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : business.business_status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-600'
                          }`}>
                            {business.business_status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                        <span>{business.subscription_status === 'active' || business.subscription_status === 'trialing' ? 'Paid business' : 'Unpaid business'}</span>
                        <span className="font-medium text-green-700">Open business record →</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Stripe Info */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart2 size={18} className="text-gray-500" /> Stripe
              </h2>
              <div className="space-y-2 font-mono text-xs text-gray-600">
                <div><span className="text-gray-400">Customer: </span>{subscription?.stripe_customer_id ?? <span className="text-gray-300">—</span>}</div>
                <div><span className="text-gray-400">Sub: </span>{subscription?.stripe_subscription_id ?? <span className="text-gray-300">—</span>}</div>
                <div>
                  <span className="text-gray-400">Period end: </span>
                  {subscription?.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString()
                    : <span className="text-gray-300">—</span>}
                </div>
              </div>
            </div>

            {/* Account Info */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <User size={18} className="text-gray-500" /> Account Info
              </h2>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div><span className="text-gray-400">Joined: </span>{fmtDate(profile.created_at)}</div>
                <div><span className="text-gray-400">Score: </span>{profile.credit_score_range ?? '—'}</div>
                <div><span className="text-gray-400">Utilization: </span>{profile.utilization_range ?? '—'}</div>
                <div><span className="text-gray-400">Inquiries: </span>{profile.inquiry_range ?? '—'}</div>
                <div><span className="text-gray-400">Entity: </span>{profile.entity_type ?? '—'}</div>
                <div><span className="text-gray-400">Industry: </span>{profile.industry ?? '—'}</div>
                <div><span className="text-gray-400">Revenue: </span>{profile.monthly_revenue_range ?? '—'}</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 text-sm">Partner Relationship</h2>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div>
                  <span className="text-gray-400">Path: </span>
                  {profile.acquisition_path === 'partner_assisted' ? 'Partner-Assisted' : 'Self-Serve'}
                </div>
                <div><span className="text-gray-400">Assigned partner: </span>{profile.assigned_partner_name ?? '—'}</div>
                <div><span className="text-gray-400">Partner ID: </span>{profile.assigned_partner_affiliate_id ?? '—'}</div>
                <div><span className="text-gray-400">Onboarding: </span>{profile.partner_onboarding_status ?? '—'}</div>
                <div>
                  <span className="text-gray-400">Delegate consent: </span>
                  {profile.delegate_access_authorized ? 'Authorized' : 'Not authorized'}
                </div>
                <div>
                  <span className="text-gray-400">Relationship started: </span>
                  {profile.partner_relationship_started_at ? fmtDate(profile.partner_relationship_started_at) : '—'}
                </div>
              </div>
            </div>

            {/* CRM Quick Stats */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 text-sm">CRM Summary</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-gray-900">{notes.length}</div>
                  <div className="text-[10px] text-gray-400">Notes</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-gray-900">{tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length}</div>
                  <div className="text-[10px] text-gray-400">Open Tickets</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-gray-900">{taskStats.completed}</div>
                  <div className="text-[10px] text-gray-400">Tasks Done</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className={`text-lg font-bold ${profile.notion_page_id ? 'text-green-600' : 'text-gray-300'}`}>
                    {profile.notion_page_id ? '✓' : '—'}
                  </div>
                  <div className="text-[10px] text-gray-400">Notion Linked</div>
                </div>
              </div>
            </div>

            {/* Portal Invite */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <ExternalLink size={18} className="text-green-600" /> Portal Invite
              </h2>
              <div className="space-y-3">
                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Status:</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    inviteStatus === 'accepted' ? 'bg-green-100 text-green-700' :
                    inviteStatus === 'sent' ? 'bg-blue-100 text-blue-700' :
                    inviteStatus === 'expired' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {inviteStatus === 'not_sent' ? 'not sent' : inviteStatus}
                  </span>
                </div>

                {/* Timestamps */}
                {inviteSentAt && (
                  <div className="text-xs text-gray-500">
                    Sent: <span className="text-gray-700">{fmtDateTime(inviteSentAt)}</span>
                  </div>
                )}
                {inviteAcceptedAt && (
                  <div className="text-xs text-gray-500">
                    Accepted: <span className="text-green-700 font-medium">{fmtDateTime(inviteAcceptedAt)}</span>
                  </div>
                )}
                {inviteExpiresAt && inviteStatus === 'sent' && (
                  <div className="text-xs text-gray-500">
                    Expires: <span className={new Date(inviteExpiresAt) < new Date() ? 'text-red-600 font-medium' : 'text-gray-700'}>{fmtDateTime(inviteExpiresAt)}</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col gap-2 pt-1">
                  {inviteStatus !== 'accepted' && (
                    <button
                      onClick={() => sendInvite(inviteStatus === 'sent')}
                      disabled={sendingInvite}
                      className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-3 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {sendingInvite ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                      {inviteStatus === 'sent' ? 'Resend Invite' : 'Send Portal Invite'}
                    </button>
                  )}
                  {inviteToken && inviteStatus === 'sent' && inviteExpiresAt && new Date(inviteExpiresAt) > new Date() && (
                    <button
                      onClick={copyInviteLink}
                      className="w-full flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-xs font-semibold py-2 px-3 rounded-xl transition-colors"
                    >
                      {inviteCopied ? <CheckCircle size={12} className="text-green-500" /> : <ExternalLink size={12} />}
                      {inviteCopied ? 'Copied!' : 'Copy Invite Link'}
                    </button>
                  )}
                  {inviteStatus === 'accepted' && (
                    <p className="text-xs text-green-600 text-center font-medium">Member has claimed their account.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Send Notification */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Bell size={18} className="text-amber-500" /> Send Notification
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="Notification title…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Message</label>
                  <textarea
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Message body…"
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                </div>
                <button
                  onClick={sendNotification}
                  disabled={sendingNotif || !notifTitle.trim() || !notifMessage.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {sendingNotif ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                  Send to Member
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
