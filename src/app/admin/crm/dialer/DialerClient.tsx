'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Phone, ChevronLeft, ChevronRight, Building2, Mail,
  ThumbsUp, ThumbsDown, Voicemail, PhoneMissed, CalendarPlus,
  Ban, Loader2, Users, CheckCircle2, Filter, X, Flame, Send, PhoneOff, Clock3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import OfflineCRMSilentMirror from '@/components/offline-crm/OfflineCRMSilentMirror'
import LiveCallFeed from '@/components/admin/crm/dialer/LiveCallFeed'
import BrowserAudio from '@/components/admin/crm/dialer/BrowserAudio'
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
  program_interest: string | null
  source: string
  notes: string | null
  follow_up_at: string | null
  callback_due_at?: string | null
  last_call_outcome?: string | null
  last_call_at?: string | null
  do_not_call?: boolean
  duplicate_phone_count?: number
  phone_invalid?: boolean
  lead_temperature?: 'cold' | 'warm' | 'hot'
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
  last_sms_sent_at?: string | null
  last_sms_status?: string | null
  last_sms_clicked_at?: string | null
  sms_account_created?: boolean
  sms_account_created_at?: string | null
}

interface CRMDialerSession {
  id: string
  rep_phone_number: string | null
  rep_session_mode?: 'browser' | 'phone' | 'single_line' | null
  session_status: 'ready' | 'not_ready' | 'connecting' | 'waiting' | 'in_call' | 'ended' | 'failed'
  rep_state?: 'connecting' | 'waiting' | 'in_call' | 'not_ready' | 'error' | null
  conference_name: string
  current_lead_id: string | null
  current_crm_call_id: string | null
  winning_attempt_id?: string | null
  waiting_for_disposition?: boolean
  target_parallel_lines?: number
  active_attempt_count?: number
  last_error: string | null
  started_at: string | null
  answered_at: string | null
}

interface CRMDialerAttempt {
  id: string
  crm_call_id: string
  lead_id: string
  attempt_status: string
  queue_slot: number
  is_winner: boolean
  resolved_at?: string | null
  last_twilio_status?: string | null
  answered_by?: string | null
  amd_status?: string | null
}

interface CRMCallRecord {
  id: string
  lead_id?: string
  twilio_status: string | null
  call_status: string | null
  call_outcome: string | null
  twilio_call_sid?: string | null
  call_started_at?: string | null
  call_ended_at?: string | null
  duration_seconds?: number | null
  answered_by?: string | null
  amd_status?: string | null
  metadata?: Record<string, unknown> | null
}

type InviteType = 'portal' | 'pre_analyzer'
type CallDispositionKey =
  | 'no_answer'
  | 'voicemail'
  | 'busy'
  | 'bad_number'
  | 'call_back'
  | 'interested'
  | 'not_interested'
  | 'dnc'
  | 'follow_up'
  | 'appointment_set'

// ─── Dispositions ─────────────────────────────────────────────────────────────
const DISPOSITIONS = [
  { key: 'interested', label: 'Interested', icon: ThumbsUp, color: 'bg-green-500 hover:bg-green-600 text-white', outcome: 'Interested', newStage: 'qualified' as Stage },
  { key: 'appointment_set', label: 'Appointment Set', icon: CalendarPlus, color: 'bg-purple-500 hover:bg-purple-600 text-white', outcome: 'Appointment Set', newStage: 'demo_scheduled' as Stage },
  { key: 'follow_up', label: 'Follow Up', icon: Clock3, color: 'bg-blue-500 hover:bg-blue-600 text-white', outcome: 'Follow Up', newStage: 'follow_up' as Stage },
  { key: 'call_back', label: 'Call Back', icon: Clock3, color: 'bg-cyan-500 hover:bg-cyan-600 text-white', outcome: 'Call Back', newStage: 'follow_up' as Stage },
  { key: 'voicemail', label: 'Voicemail', icon: Voicemail, color: 'bg-amber-500 hover:bg-amber-600 text-white', outcome: 'Voicemail', newStage: 'contacted' as Stage },
  { key: 'no_answer', label: 'No Answer', icon: PhoneMissed, color: 'bg-gray-400 hover:bg-gray-500 text-white', outcome: 'No Answer', newStage: 'contacted' as Stage },
  { key: 'busy', label: 'Busy', icon: PhoneOff, color: 'bg-gray-600 hover:bg-gray-700 text-white', outcome: 'Busy', newStage: 'contacted' as Stage },
  { key: 'bad_number', label: 'Bad Number', icon: X, color: 'bg-orange-700 hover:bg-orange-800 text-white', outcome: 'Bad Number', newStage: 'closed_lost' as Stage },
  { key: 'not_interested', label: 'Not Interested', icon: ThumbsDown, color: 'bg-red-400 hover:bg-red-500 text-white', outcome: 'Not Interested', newStage: 'closed_lost' as Stage },
  { key: 'dnc', label: 'DNC / Remove', icon: Ban, color: 'bg-red-700 hover:bg-red-800 text-white', outcome: 'Do Not Call', newStage: null },
] as const satisfies ReadonlyArray<{
  key: CallDispositionKey
  label: string
  icon: typeof Phone
  color: string
  outcome: string
  newStage: Stage | null
}>

const PROGRAM_LABEL: Record<string, string> = { program_a: 'Program A', program_b: 'Program B', program_c: 'Program C' }
const PROGRAM_BADGE: Record<string, string> = {
  program_a: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  program_b: 'bg-emerald-100 text-emerald-700',
  program_c: 'bg-blue-100 text-blue-700',
}

function buildCallStatusLabel(lead: CRMLead | undefined) {
  if (!lead) return 'Unknown Timezone'
  if (lead.call_window_status === 'callable_now') return 'Callable Now'
  if (lead.call_window_status === 'blocked_by_timezone') {
    return `Blocked Until ${lead.blocked_until_label ?? ''}`.trim()
  }
  return lead.timezone_reason_label ? `Unknown: ${lead.timezone_reason_label}` : 'Unknown Timezone'
}

function formatInviteTimestamp(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function buildSmsTemplate(type: 'portal_invite' | 'follow_up' | 'demo_booking', lead: CRMLead | undefined) {
  const firstName = lead?.first_name?.trim() || 'there'
  const portalLink = 'https://app.sourcifylending.com/signup'

  if (type === 'follow_up') {
    return `Hi ${firstName}, this is Abel with SourcifyLending. Following up from my call. Here’s the portal link when you’re ready: ${portalLink}`
  }
  if (type === 'demo_booking') {
    return `Hi ${firstName}, this is Abel with SourcifyLending. Here’s the portal link so you can get started before we book your demo: ${portalLink}`
  }
  return `Hi ${firstName}, this is Abel with SourcifyLending. Here’s the link to get started in the portal: ${portalLink}`
}

function buildSessionStatusCopy(session: CRMDialerSession | null, deviceStatus: string) {
  if (!session) {
    return {
      label: 'Not Ready',
      message: 'Click Ready to connect browser audio and go live.',
      tone: 'border-gray-700 bg-gray-950 text-gray-300',
    }
  }

  if (deviceStatus === 'connecting') {
    return {
      label: 'Connecting',
      message: 'Connecting browser audio...',
      tone: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
    }
  }

  switch (session.session_status) {
    case 'connecting':
      return {
        label: 'Connecting',
        message: 'Connecting browser audio...',
        tone: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
      }
    case 'waiting':
    case 'ready':
      return {
        label: 'Live',
        message: 'Browser audio connected. Dial leads when ready.',
        tone: 'border-green-500/30 bg-green-500/10 text-green-200',
      }
    case 'in_call':
      return {
        label: 'In Call',
        message: session.waiting_for_disposition
          ? 'Conversation ended — save disposition to continue.'
          : 'Lead is connected. Dialing...',
        tone: 'border-purple-500/30 bg-purple-500/10 text-purple-200',
      }
    case 'failed':
      return {
        label: 'Failed',
        message: session.last_error || 'Session failed. Click Ready to retry.',
        tone: 'border-red-500/30 bg-red-500/10 text-red-200',
      }
    default:
      return {
        label: 'Not Ready',
        message: 'Click Ready to connect browser audio.',
        tone: 'border-gray-700 bg-gray-950 text-gray-300',
      }
  }
}

function isTerminalTwilioStatus(status: string | null | undefined) {
  return ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status ?? '')
}

function isActiveAttemptStatus(status: string | null | undefined) {
  return ['queued', 'dialing', 'ringing', 'answered_human', 'answered_machine', 'bridged'].includes(status ?? '')
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DialerClient() {
  const [leads, setLeads]         = useState<CRMLead[]>([])
  const [index, setIndex]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [acting, setActing]       = useState(false)
  const [called, setCalled]       = useState(false)
  const [note, setNote]           = useState('')
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null)
  const [nextFollowUpAt, setNextFollowUpAt] = useState('')
  const [temperature, setTemperature] = useState<'cold' | 'warm' | 'hot'>('cold')
  const [strategyBooked, setStrategyBooked] = useState(false)
  const [converted, setConverted] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [programFilter, setProgramFilter] = useState('')
  const [skipped, setSkipped]     = useState(0)
  const [done, setDone]           = useState(0)
  const [callLoggingNotice, setCallLoggingNotice] = useState<string | null>(null)
  const [authorizingCall, setAuthorizingCall] = useState(false)
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [callProviderStatus, setCallProviderStatus] = useState<string | null>(null)
  const [callProviderMessage, setCallProviderMessage] = useState<string | null>(null)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [inviteSending, setInviteSending] = useState<InviteType | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<InviteType | null>(null)
  const [showSmsComposer, setShowSmsComposer] = useState(false)
  const [smsBody, setSmsBody] = useState('')
  const [smsTemplateKey, setSmsTemplateKey] = useState<'portal_invite' | 'follow_up' | 'demo_booking'>('portal_invite')
  const [smsSending, setSmsSending] = useState(false)
  const [session, setSession] = useState<CRMDialerSession | null>(null)
  const [attempts, setAttempts] = useState<CRMDialerAttempt[]>([])
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [pacingBusy, setPacingBusy] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState<'offline' | 'connecting' | 'connected' | 'error'>('offline')
  const [dialerMode, setDialerMode] = useState<'power' | 'manual'>('power')
  const [connectionMode, setConnectionMode] = useState<'browser' | 'phone'>('browser')
  const [profileActionHref, setProfileActionHref] = useState<string | null>(null)
  const [repPhoneConfigured, setRepPhoneConfigured] = useState(false)
  const autoDialLeadIdsRef = useRef<Set<string>>(new Set())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deviceRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentCallRef = useRef<any>(null)

  const load = useCallback(async (stage: string) => {
    setLoading(true)
    setIndex(0)
    setCalled(false)
    setNote('')
    setCallStartedAt(null)
    setActiveCallId(null)
    setCallProviderStatus(null)
    setCallProviderMessage(null)
    setNextFollowUpAt('')
    setTemperature('cold')
    setStrategyBooked(false)
    setConverted(false)
    autoDialLeadIdsRef.current.clear()
    try {
      const p = new URLSearchParams()
      p.set('stage', stage)
      p.set('dialer_mode', 'true')
      if (programFilter) p.set('program', programFilter)
      const res  = await fetch(`/api/admin/crm/leads?${p}`)
      const json = await res.json()
      setLeads((json.leads ?? []).filter((l: CRMLead & { do_not_call: boolean }) => !l.do_not_call))
    } catch { toast.error('Failed to load leads') }
    finally { setLoading(false) }
  }, [programFilter])

  const loadSession = useCallback(async () => {
    setSessionLoading(true)
    try {
      const res = await fetch('/api/admin/crm/dialer/session')
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load dialer session')
      }
      const sessionData = (json.session ?? null) as CRMDialerSession | null
      setSession(sessionData)
      setAttempts(json.attempts ?? [])
      setRepPhoneConfigured(Boolean(json.has_rep_phone))
      setProfileActionHref(json.action_href ?? null)
      // For phone-leg sessions, mirror Twilio session state into deviceStatus
      // so canDialLead works the same way regardless of connection mode
      if (sessionData?.rep_phone_number && sessionData.rep_phone_number !== 'browser') {
        if (['waiting', 'in_call', 'ready'].includes(sessionData.session_status)) {
          setDeviceStatus((prev) => (prev === 'connected' ? 'connected' : 'connected'))
        } else if (['not_ready', 'ended', 'failed'].includes(sessionData.session_status)) {
          setDeviceStatus((prev) => (prev === 'offline' ? 'offline' : 'offline'))
        }
      }
    } catch {
      setSession(null)
      setAttempts([])
    } finally {
      setSessionLoading(false)
    }
  }, [])

  // Suppress admin notification bell and AI panel on the dialer page
  useEffect(() => {
    const el = document.getElementById('admin-shell-floaters')
    if (el) el.style.display = 'none'

    // Extra guard against floating widgets
    const style = document.createElement('style')
    style.id = 'dialer-suppress-floaters'
    style.innerHTML = '#admin-shell-floaters, .floating-ai-button, [data-testid="notification-bell"] { display: none !important; }'
    document.head.appendChild(style)

    return () => {
      if (el) el.style.display = ''
      document.getElementById('dialer-suppress-floaters')?.remove()
    }
  }, [])

  useEffect(() => {
    if (stageFilter) load(stageFilter)
  }, [stageFilter, load])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!session || session.session_status === 'not_ready' || session.session_status === 'ended' || session.session_status === 'failed') {
      return
    }

    const timer = window.setInterval(() => {
      loadSession().catch(() => {})
    }, 1500)

    return () => window.clearInterval(timer)
  }, [session?.id, session?.session_status, loadSession])

  const total   = leads.length
  const winnerLead = session?.current_lead_id ? leads.find((lead) => lead.id === session.current_lead_id) : undefined
  const nextQueueLead = leads[index]
  const current = winnerLead ?? nextQueueLead ?? (total > 0 ? leads[Math.max(total - 1, 0)] : undefined)
  const remaining = Math.max(total - index, 0)
  const targetParallelLines = Math.min(Math.max(session?.target_parallel_lines ?? 1, 1), 5)
  const activeAttempts = attempts.filter((attempt) => isActiveAttemptStatus(attempt.attempt_status))
  const activeAttemptCount = activeAttempts.length
  const callStatusLabel = buildCallStatusLabel(current)
  const sessionStatus = buildSessionStatusCopy(session, deviceStatus)
  const callStatusTone = current?.call_window_status === 'callable_now'
    ? 'border-green-500/30 bg-green-500/10 text-green-200'
    : current?.call_window_status === 'blocked_by_timezone'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-gray-700 bg-gray-950 text-gray-300'
  const callBlocked = nextQueueLead?.call_window_status === 'blocked_by_timezone' || nextQueueLead?.call_window_status === 'unknown_timezone'
  const canDialLead = Boolean(
    session
    && deviceStatus === 'connected'
    && ['ready', 'waiting', 'in_call'].includes(session.session_status)
    && !session.waiting_for_disposition
    && activeAttemptCount < targetParallelLines
  )
  const leadAttemptActive = Boolean(
    nextQueueLead
    && activeAttempts.some((attempt) => attempt.lead_id === nextQueueLead.id)
  )

  useEffect(() => {
    if (!current) return
    setTemperature(current.lead_temperature ?? 'cold')
    setNextFollowUpAt((current.callback_due_at || current.follow_up_at) ? new Date(current.callback_due_at || current.follow_up_at || '').toISOString().slice(0, 16) : '')
    setInviteSuccess(null)
    setShowSmsComposer(false)
    setSmsTemplateKey('portal_invite')
    setSmsBody(buildSmsTemplate('portal_invite', current))
  }, [current?.id])

  useEffect(() => {
    if (!session) {
      setCalled(false)
      setActiveCallId(null)
      return
    }
    setCalled(Boolean(session.current_crm_call_id))
    setActiveCallId(session.current_crm_call_id ?? null)
  }, [session])

  useEffect(() => {
    if (!activeCallId) return

    const syncCall = async () => {
      try {
        const res = await fetch(`/api/admin/crm/calls/${activeCallId}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.call) return

        const call = json.call as CRMCallRecord
        const nextStatus = call.twilio_status ?? null
        const terminal = isTerminalTwilioStatus(nextStatus)
        const humanAnswered = `${call.answered_by ?? call.amd_status ?? ''}`.toLowerCase() === 'human'

        setCallProviderStatus(nextStatus)

        if (terminal) {
          setCalled(false)
          setActiveCallId(null)

          if (humanAnswered) {
            setCallProviderMessage('Conversation ended. Choose a disposition to continue.')
          } else if (autoAdvance && !session?.waiting_for_disposition) {
            setCallProviderMessage(call.call_outcome ? `Auto-dispositioned: ${call.call_outcome}` : 'Lead leg ended.')
            // Refill logic in useEffect will pick this up when activeAttemptCount drops
            advance()
          } else if (call.call_outcome) {
            setCallProviderMessage(`Lead leg ended: ${call.call_outcome}`)
          } else if (nextStatus) {
            setCallProviderMessage(`Lead leg ended: ${nextStatus}`)
          } else {
            setCallProviderMessage('Lead leg ended.')
          }
          return
        }

        if (nextStatus === 'ringing') {
          setCallProviderMessage('Lead leg is ringing now.')
        } else if (nextStatus === 'in-progress' || nextStatus === 'answered') {
          setCallProviderMessage('Lead is connected inside the live rep session.')
        } else if (nextStatus === 'queued' || nextStatus === 'initiated') {
          setCallProviderMessage('Lead leg is dialing into your live session.')
        }
      } catch {
        // Ignore transient poll errors.
      }
    }

    void syncCall()
    const timer = window.setInterval(() => {
      void syncCall()
    }, 2500)

    return () => window.clearInterval(timer)
  }, [activeCallId, autoAdvance, callStartedAt, session?.waiting_for_disposition, targetParallelLines])

  // 3-line dialer refill logic
  useEffect(() => {
    if (!autoAdvance || !session || pacingBusy || authorizingCall || sessionBusy) return
    if (session.waiting_for_disposition || !nextQueueLead || callBlocked || !canDialLead) return
    if (activeAttemptCount >= targetParallelLines) return
    
    // Prevent double-dialing the same lead ID in parallel
    if (autoDialLeadIdsRef.current.has(nextQueueLead.id)) return

    // Trigger parallel attempts more aggressively.
    // We fire and immediately move to next lead in queue.
    autoDialLeadIdsRef.current.add(nextQueueLead.id)
    void authorizeDial(nextQueueLead, { advanceCursor: true, silent: true }).finally(() => {
      // Small delay before allowing this lead ID to be auto-dialed again if needed
      setTimeout(() => {
        autoDialLeadIdsRef.current.delete(nextQueueLead.id)
      }, 5000)
    })
  }, [
    autoAdvance,
    targetParallelLines,
    session?.id,
    session?.waiting_for_disposition,
    authorizingCall,
    sessionBusy,
    pacingBusy,
    nextQueueLead?.id,
    callBlocked,
    canDialLead,
    activeAttemptCount,
  ])

  function inviteStatusMeta(type: InviteType) {
    if (type === 'portal') {
      return {
        sent: Boolean(current?.portal_invite_sent),
        sentAt: current?.portal_invite_last_sent_at ?? null,
        status: current?.portal_invite_last_status ?? null,
      }
    }
    return {
      sent: Boolean(current?.pre_analyzer_invite_sent),
      sentAt: current?.pre_analyzer_invite_last_sent_at ?? null,
      status: current?.pre_analyzer_invite_last_status ?? null,
    }
  }

  async function sendInvite(inviteType: InviteType) {
    if (!current || !current.email || inviteSending) return
    setInviteSending(inviteType)
    try {
      const res = await fetch(`/api/admin/crm/leads/${current.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_type: inviteType }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to send invite')
        return
      }

      setLeads(existing => existing.map(lead => lead.id === current.id ? { ...lead, ...(json.invite_summary ?? {}) } : lead))
      setInviteSuccess(inviteType)
      toast.success(inviteType === 'portal' ? 'Portal invite sent' : 'Pre-analyzer invite sent')
    } catch {
      toast.error('Failed to send invite')
    } finally {
      setInviteSending(null)
    }
  }

  async function sendSms() {
    if (!current || smsSending) return
    setSmsSending(true)
    try {
      const res = await fetch(`/api/admin/crm/leads/${current.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_body: smsBody,
          template_key: smsTemplateKey,
          dialer_stage: stageFilter,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to send text')
        return
      }

      setLeads(existing => existing.map(lead => lead.id === current.id ? {
        ...lead,
        ...(json.sms_summary ?? {}),
      } : lead))
      setShowSmsComposer(false)
      toast.success('Text sent')
    } catch {
      toast.error('Failed to send text')
    } finally {
      setSmsSending(false)
    }
  }

  async function setReady() {
    if (sessionBusy) return
    setSessionBusy(true)
    try {
      const res = await fetch('/api/admin/crm/dialer/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: connectionMode,
          target_parallel_lines: dialerMode === 'power' ? 3 : 1,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.action_href) setProfileActionHref(json.action_href)
        toast.error(json.error ?? 'Failed to start session')
        return
      }

      setSession(json.session ?? null)
      setAttempts(json.attempts ?? [])

      if (connectionMode === 'phone') {
        setDeviceStatus('connecting')
        setCallProviderMessage(`Calling your phone at ${json.session.rep_phone_number}... Answer to go live.`)
        // No browser device connection needed for phone mode
        setSessionBusy(false)
        return
      }

      if (!json.token) {
        toast.error('Browser audio token missing. Check Twilio env vars.')
        return
      }

      // Request mic permission so the browser dialog fires before Device connects.
      // Only hard-block on explicit permission denial — other errors (device busy, etc.)
      // are passed through to Twilio's own error handler.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())
      } catch (micErr: unknown) {
        const name = micErr instanceof Error ? (micErr as any).name : String((micErr as any)?.name ?? '')
        const isDenied = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
        if (isDenied) {
          toast.error('Microphone access is blocked. Allow it in your browser site settings, then try again.')
          setDeviceStatus('offline')
          return
        }
        // Non-permission error (e.g. NotReadableError / device busy) — log and continue;
        // Twilio Device will attempt its own access and surface a cleaner error if needed.
        console.warn('[Dialer] getUserMedia preflight failed (non-fatal):', name, micErr)
      }

      setDeviceStatus('connecting')
      setCallProviderMessage('Connecting browser audio...')

      const { Device } = await import('@twilio/voice-sdk')

      // Destroy any existing device before creating a new one
      if (deviceRef.current) {
        try { deviceRef.current.destroy() } catch { /* ignore */ }
        deviceRef.current = null
      }

      const device = new Device(json.token, {
        codecPreferences: ['opus', 'pcmu'] as any,
        disableAudioContextSounds: true,
      })
      deviceRef.current = device

      device.on('error', (error: unknown) => {
        console.error('[Dialer] Device error:', error)
        setDeviceStatus('error')
        setCallProviderMessage('Browser audio error. Click Not Ready then Ready to reconnect.')
      })

      const call = await device.connect({
        params: { sessionId: json.session.id },
      })
      agentCallRef.current = call

      call.on('accept', () => {
        setDeviceStatus('connected')
        setCallProviderMessage('Browser audio live. Dial leads when ready.')
        setSession((prev) => prev ? { ...prev, session_status: 'waiting', rep_state: 'waiting' } : prev)
      })

      call.on('disconnect', () => {
        setDeviceStatus('offline')
        agentCallRef.current = null
      })

      call.on('error', (error: unknown) => {
        console.error('[Dialer] Call error:', error)
        setDeviceStatus('error')
        setCallProviderMessage('Browser call error. Click Not Ready then Ready to reconnect.')
      })

    } catch (err) {
      console.error('[Dialer] setReady error:', err)
      setDeviceStatus('offline')
      toast.error('Failed to connect')
    } finally {
      setSessionBusy(false)
    }
  }

  async function setNotReady() {
    if (sessionBusy) return
    setSessionBusy(true)
    try {
      // Disconnect browser device first
      if (agentCallRef.current) {
        try { agentCallRef.current.disconnect() } catch { /* ignore */ }
        agentCallRef.current = null
      }
      if (deviceRef.current) {
        try { deviceRef.current.destroy() } catch { /* ignore */ }
        deviceRef.current = null
      }
      setDeviceStatus('offline')

      const res = await fetch('/api/admin/crm/dialer/session', { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to end session')
        return
      }
      setSession(null)
      setAttempts([])
      setCalled(false)
      setActiveCallId(null)
      setCallProviderStatus(null)
      setCallProviderMessage('Session ended. Click Ready to go live again.')
      toast.success('Session ended')
    } catch {
      toast.error('Failed to end the session')
    } finally {
      setSessionBusy(false)
    }
  }

  async function updateParallelLines(lines: number) {
    if (!session || pacingBusy) return
    setPacingBusy(true)
    try {
      const res = await fetch('/api/admin/crm/dialer/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_parallel_lines: lines }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update dialer pacing')
        return
      }
      setSession(json.session ?? session)
      setAttempts(json.attempts ?? attempts)
    } catch {
      toast.error('Failed to update dialer pacing')
    } finally {
      setPacingBusy(false)
    }
  }

  async function disconnectLeadLeg(callId: string | null) {
    if (!callId) return { ok: true, alreadyEnded: true }

    try {
      const res = await fetch('/api/admin/crm/dial', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        return {
          ok: false,
          error: json.error ?? 'Failed to disconnect lead leg',
        }
      }

      return {
        ok: true,
        alreadyEnded: Boolean(json.already_ended),
      }
    } catch {
      return {
        ok: false,
        error: 'Failed to disconnect lead leg',
      }
    }
  }

  async function authorizeDial(
    leadOverride?: CRMLead,
    options?: {
      advanceCursor?: boolean
      silent?: boolean
    },
  ) {
    const dialLead = leadOverride ?? nextQueueLead
    if (!dialLead) return

    // Manual clicks must wait for current authorization to finish
    if (!options?.silent && authorizingCall) return

    if (!options?.silent) setAuthorizingCall(true)

    try {
      const res = await fetch('/api/admin/crm/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: dialLead.id, auto_advance: autoAdvance }),
      })
      const json = await res.json()

      setLeads(existing => existing.map(lead => lead.id === dialLead.id ? { ...lead, ...json } : lead))

      if (!res.ok || !json.allowed) {
        if (json.action_href) setProfileActionHref(json.action_href)
        if (json.action === 'ready_required') {
          setCallProviderMessage(json.error ?? 'Click Ready first.')
        }
        if (!options?.silent) {
          toast.error(json.error ?? json.call_window_message ?? 'This lead cannot be called right now.')
        }
        return
      }

      const launchedSession = (json.session ?? null) as CRMDialerSession | null
      const launchedAttempts = (json.attempts ?? []) as CRMDialerAttempt[]

      setSession(launchedSession)
      setAttempts(launchedAttempts)
      setCallStartedAt(new Date().toISOString())
      setCallProviderStatus(json.twilio_status ?? 'queued')
      setCallProviderMessage(json.message ?? 'Dialing lead attempt.')

      const launchedParallel = Math.min(Math.max(launchedSession?.target_parallel_lines ?? targetParallelLines, 1), 5) > 1
      if (!launchedParallel) {
        setCalled(true)
        setActiveCallId(json.call_id ?? null)
      } else {
        setCalled(false)
        setActiveCallId(launchedSession?.current_crm_call_id ?? null)
      }

      if (options?.advanceCursor) {
        setIndex((value) => value + 1)
      }

      if (!options?.silent) {
        toast.success(json.message ?? 'Lead attempt launched.')
      }
    } catch {
      if (!options?.silent) {
        toast.error('Failed to authorize call')
      }
    } finally {
      if (!options?.silent) setAuthorizingCall(false)
    }
  }

  async function finalizeDisposition(
    disposition: typeof DISPOSITIONS[number],
    options?: {
      callIdOverride?: string | null
      statusOverride?: string | null
      startedAtOverride?: string | null
      endedAtOverride?: string | null
      durationOverride?: number | null
      skipDisconnect?: boolean
      autoTriggered?: boolean
    },
  ) {
    if (!current) return false

    const now = options?.endedAtOverride ?? new Date().toISOString()
    const resolvedCallId = options?.callIdOverride ?? activeCallId
    const effectiveCallStatus = options?.statusOverride ?? callProviderStatus
    const startedAt = options?.startedAtOverride ?? callStartedAt ?? now
    const defaultRetryFollowUp =
      !nextFollowUpAt && ['voicemail', 'no_answer', 'busy', 'call_back'].includes(disposition.key)
        ? new Date(Date.now() + (disposition.key === 'busy' ? 2 : disposition.key === 'call_back' ? 24 : 4) * 60 * 60 * 1000).toISOString().slice(0, 16)
        : nextFollowUpAt

    if (disposition.key === 'dnc') {
      await fetch(`/api/admin/crm/leads/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ do_not_call: true }),
      })
    }

    const durationSeconds = options?.durationOverride ?? (
      startedAt
        ? Math.max(Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 1000), 0)
        : null
    )

    const callRes = await fetch('/api/admin/crm/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: current.id,
        lead_name: `${current.first_name} ${current.last_name}`.trim(),
        company_name: current.business_name,
        phone_number: current.phone,
        call_id: resolvedCallId,
        call_started_at: startedAt,
        call_ended_at: now,
        duration_seconds: durationSeconds,
        call_status: called ? 'completed' : 'attempted',
        call_outcome: disposition.outcome,
        notes: note.trim() || null,
        next_follow_up_at: defaultRetryFollowUp ? new Date(defaultRetryFollowUp).toISOString() : null,
        lead_temperature: temperature,
        strategy_call_booked: strategyBooked || disposition.key === 'appointment_set',
        converted_to_client: converted,
        create_follow_up_task: Boolean(defaultRetryFollowUp) || ['voicemail', 'no_answer', 'busy', 'call_back', 'follow_up'].includes(disposition.key),
        source: current.source,
        twilio_status: effectiveCallStatus,
        metadata: {
          manual_disposition_locked: !options?.autoTriggered,
          manual_disposition_key: disposition.key,
          disposition_saved_at: now,
          lead_leg_cleanup_requested_at: now,
          auto_advance_enabled: autoAdvance,
          auto_disposition_applied: Boolean(options?.autoTriggered),
          auto_disposition_reason: options?.autoTriggered ? (effectiveCallStatus ?? disposition.outcome) : null,
        },
      }),
    })
    const callJson = await callRes.json()
    if (!callRes.ok) {
      toast.error(callJson.error ?? 'Failed to log call')
      return false
    }

    const disconnectResult = options?.skipDisconnect || isTerminalTwilioStatus(effectiveCallStatus)
      ? { ok: true, alreadyEnded: true }
      : await disconnectLeadLeg(resolvedCallId)

    if (!disconnectResult.ok) {
      toast.error(disconnectResult.error ?? 'Disposition saved, but lead leg cleanup failed')
      return false
    }

    if (callJson.degraded) {
      setCallLoggingNotice(callJson.message || 'Call outcomes are saving without full call history until CRM call logging is configured.')
    } else {
      setCallLoggingNotice(null)
    }

    setDone(d => d + 1)
    
    // Refresh session state immediately so refill logic can trigger without waiting for the poll
    void loadSession()

    if (autoAdvance) {
      advance()
    } else {
      setCalled(false)
      setActiveCallId(null)
      setCallProviderStatus(null)
      setCallProviderMessage(options?.autoTriggered ? `Auto-dispositioned: ${disposition.label}` : null)
      loadSession().catch(() => {})
      if (!options?.autoTriggered) {
        toast.success('Disposition saved')
      }
    }

    return true
  }

  async function logAndAdvance(disposition: typeof DISPOSITIONS[number]) {
    if (!current) return
    setActing(true)
    try {
      await finalizeDisposition(disposition)
    } catch {
      toast.error('Failed to log')
    } finally {
      setActing(false)
    }
  }

  function advance() {
    setCalled(false)
    setNote('')
    setCallStartedAt(null)
    setActiveCallId(null)
    setCallProviderStatus(null)
    setCallProviderMessage(null)
    setNextFollowUpAt('')
    setTemperature('cold')
    setStrategyBooked(false)
    setConverted(false)
    setSession((currentSession) => currentSession ? {
      ...currentSession,
      session_status: 'waiting',
      current_lead_id: null,
      current_crm_call_id: null,
    } : currentSession)
    setIndex(i => i + 1)
  }

  function skip() {
    setSkipped(s => s + 1)
    advance()
  }

  // ── Stage picker splash ──────────────────────────────────────────────────────
  if (!stageFilter) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
      <Link href="/admin/crm" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 mb-10 self-start absolute top-4 left-4">
        <ChevronLeft size={16}/> CRM
      </Link>
      <Phone size={36} className="text-green-500 mb-4"/>
      <h1 className="text-2xl font-bold text-white mb-2">Dialer Mode</h1>
      <p className="text-gray-400 text-sm mb-8 text-center">Choose a stage to dial through. Only leads in that stage will be loaded.</p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {[
          { k: 'new',            l: 'New',            sub: 'Cold outreach',       color: 'border-gray-600 hover:border-gray-400' },
          { k: 'contacted',      l: 'Contacted',      sub: 'Already reached',     color: 'border-blue-700 hover:border-blue-500' },
          { k: 'qualified',      l: 'Qualified',      sub: 'Warm leads',          color: 'border-amber-700 hover:border-amber-500' },
          { k: 'demo_scheduled', l: 'Demo Scheduled', sub: 'Confirm demo',        color: 'border-purple-700 hover:border-purple-500' },
          { k: 'demo_held',      l: 'Demo Held',      sub: 'Post-demo follow-up', color: 'border-indigo-700 hover:border-indigo-500' },
          { k: 'follow_up',      l: 'Follow Up',      sub: 'Scheduled callbacks', color: 'border-orange-700 hover:border-orange-500' },
        ].map(s => (
          <button key={s.k} onClick={() => setStageFilter(s.k)}
            className={cn('flex flex-col items-start px-4 py-3 rounded-xl border bg-gray-900 transition-colors text-left', s.color)}>
            <span className="text-white font-semibold text-sm">{s.l}</span>
            <span className="text-gray-500 text-xs mt-0.5">{s.sub}</span>
          </button>
        ))}
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-gray-400"/>
    </div>
  )

  // Done
  if (!current && !loading && activeAttemptCount === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <CheckCircle2 size={52} className="text-green-500 mb-4"/>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Queue Complete!</h2>
      <p className="text-gray-500 mb-2">{done} contacted · {skipped} skipped</p>
      <p className="text-sm text-gray-400 mb-8">You've gone through all leads in this filter.</p>
      <div className="flex gap-3">
        <button onClick={() => { setStageFilter(null); setLeads([]); setDone(0); setSkipped(0) }} className="btn-primary px-6 py-3">Change Stage</button>
        <button onClick={() => stageFilter && load(stageFilter)} className="btn-secondary px-6 py-3">Reload Queue</button>
        <Link href="/admin/crm" className="btn-secondary px-6 py-3">Back to CRM</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <OfflineCRMSilentMirror />

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex flex-col">
          <Link href="/admin" className="text-xs text-gray-600 hover:text-green-500 font-medium inline-flex items-center gap-0.5 leading-none mb-0.5">
            <ChevronLeft size={12}/> Admin
          </Link>
          <Link href="/admin/crm" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
            <ChevronLeft size={18}/> CRM
          </Link>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 font-medium">DIALER MODE</p>
          <p className="text-xs text-gray-400">
            {[
              {k:'new',l:'New'},{k:'contacted',l:'Contacted'},{k:'qualified',l:'Qualified'},
              {k:'demo_scheduled',l:'Demo Scheduled'},{k:'demo_held',l:'Demo Held'},{k:'follow_up',l:'Follow Up'},{k:'active_client',l:'Active Client'},
            ].find(s=>s.k===stageFilter)?.l ?? stageFilter} · {remaining} left · {done} done
          </p>
        </div>
        <button onClick={() => setShowFilters(p => !p)} className={cn('p-2 rounded-lg transition-colors', showFilters ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400')}>
          <Filter size={16}/>
        </button>
      </div>

      {/* ── Filters ── */}
      {showFilters && (
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 space-y-3">
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Stage</p>
            <div className="flex gap-2 flex-wrap">
              {[
                {k:'new',l:'New'},
                {k:'contacted',l:'Contacted'},
                {k:'qualified',l:'Qualified'},
                {k:'demo_scheduled',l:'Demo Scheduled'},
                {k:'demo_held',l:'Demo Held'},
                {k:'follow_up',l:'Follow Up'},
                {k:'active_client',l:'Active Client'},
              ].map(s=>(
                <button key={s.k} onClick={()=>{ setStageFilter(s.k); setShowFilters(false) }}
                  className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-colors', stageFilter===s.k ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400')}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Program</p>
            <div className="flex gap-2 flex-wrap">
              {[{k:'',l:'All'},{k:'program_a',l:'Prog A'},{k:'program_b',l:'Prog B'},{k:'program_c',l:'Prog C'}].map(p=>(
                <button key={p.k} onClick={()=>setProgramFilter(p.k)}
                  className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-colors', programFilter===p.k ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400')}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
          <button onClick={()=>setShowFilters(false)} className="w-full btn-primary text-sm py-2">Apply</button>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="h-1 bg-gray-800">
        <div className="h-1 bg-green-500 transition-all duration-300" style={{width:`${total ? ((index)/total)*100 : 0}%`}}/>
      </div>

      {callLoggingNotice && (
        <div className="border-b border-amber-900/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {callLoggingNotice}
        </div>
      )}

      {/* ── Lead card ── */}
      <div className="flex-1 px-4 pb-4 pt-6 lg:px-6 lg:pb-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:gap-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:items-start">
            <div className="space-y-4">
              <div className="rounded-3xl border border-gray-800 bg-gray-900 p-5 lg:p-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold text-white">{current.first_name} {current.last_name}</h2>
                    {current.business_name && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-400">
                        <Building2 size={13}/> {current.business_name}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {current.phone_invalid && (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                          Phone needs review
                        </span>
                      )}
                      {(current.duplicate_phone_count ?? 0) > 1 && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                          Duplicate phone x{current.duplicate_phone_count}
                        </span>
                      )}
                      {current.last_call_outcome && (
                        <span className="rounded-full border border-white/10 bg-gray-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                          Last call: {current.last_call_outcome}
                        </span>
                      )}
                    </div>
                  </div>
                  {current.program_interest && (
                    <span className={cn('badge shrink-0 px-2.5 py-1 text-xs', PROGRAM_BADGE[current.program_interest])}>
                      {PROGRAM_LABEL[current.program_interest]}
                    </span>
                  )}
                </div>

                <div className={cn('mb-4 rounded-2xl border px-4 py-3', callStatusTone)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Call Window</p>
                      <p className="mt-1 text-sm font-semibold">{callStatusLabel}</p>
                      {current.recipient_local_time && (
                        <p className="mt-1 text-xs opacity-80">Recipient local time: {current.recipient_local_time}</p>
                      )}
                      {(current.timezone_source_label || current.timezone_source) && (
                        <p className="mt-1 text-xs opacity-80">
                          Source: {current.timezone_source_label ?? current.timezone_source}
                          {current.timezone_reason_label ? ` • ${current.timezone_reason_label}` : ''}
                        </p>
                      )}
                      {current.call_window_message && (
                        <p className="mt-2 text-xs leading-relaxed opacity-90">{current.call_window_message}</p>
                      )}
                    </div>
                    {current.timezone_abbreviation && (
                      <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">
                        {current.timezone_abbreviation}
                      </span>
                    )}
                  </div>
                </div>

                <div className={cn('mb-4 rounded-2xl border px-4 py-3', sessionStatus.tone)}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Rep Session</p>
                      <p className="mt-1 text-sm font-semibold">{sessionStatus.label}</p>
                      <p className="mt-1 text-xs opacity-90">{sessionStatus.message}</p>
                      {session?.rep_phone_number && session.rep_phone_number !== 'browser' && (
                        <p className="mt-1 text-xs opacity-80 font-medium text-amber-200">Phone Leg: {session.rep_phone_number}</p>
                      )}
                      {session && (
                        <p className="mt-1 text-xs opacity-80">
                          {activeAttemptCount} active line{activeAttemptCount === 1 ? '' : 's'} / {targetParallelLines} configured
                        </p>
                      )}
                      {!repPhoneConfigured && profileActionHref && connectionMode === 'phone' && (
                        <Link href={profileActionHref} className="mt-2 inline-flex text-xs font-semibold text-green-300 underline underline-offset-2">
                          Add or fix admin phone number
                        </Link>
                      )}
                    </div>

                    {!session ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap gap-2">
                          <div className="flex rounded-xl bg-gray-950 p-1 border border-white/5">
                            <button
                              type="button"
                              onClick={() => setDialerMode('power')}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                                dialerMode === 'power' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                              )}
                            >
                              Power (3-Line)
                            </button>
                            <button
                              type="button"
                              onClick={() => setDialerMode('manual')}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                                dialerMode === 'manual' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                              )}
                            >
                              Manual
                            </button>
                          </div>
                          <div className="flex rounded-xl bg-gray-950 p-1 border border-white/5">
                            <button
                              type="button"
                              onClick={() => setConnectionMode('browser')}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                                connectionMode === 'browser' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                              )}
                            >
                              Browser
                            </button>
                            <button
                              type="button"
                              onClick={() => setConnectionMode('phone')}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                                connectionMode === 'phone' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                              )}
                            >
                              Phone
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={setReady}
                          disabled={sessionBusy || sessionLoading}
                          className={cn(
                            'flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]',
                            dialerMode === 'power' && connectionMode === 'browser'
                              ? 'bg-green-600 text-white shadow-lg shadow-green-900/20 hover:bg-green-500'
                              : 'bg-gray-100 text-gray-900 hover:bg-white'
                          )}
                        >
                          {sessionBusy ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
                          Go Live (Ready)
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={setNotReady}
                          disabled={sessionBusy}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-950/30 border border-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-950/50"
                        >
                          {sessionBusy ? <Loader2 size={15} className="animate-spin" /> : <PhoneOff size={15} />}
                          End Session
                        </button>
                      </div>
                    )}
                  </div>
                  {session && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Lines</span>
                      <select
                        value={targetParallelLines}
                        onChange={(event) => void updateParallelLines(Number(event.target.value))}
                        disabled={pacingBusy || sessionBusy}
                        className="rounded-lg border border-white/10 bg-gray-950 px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        {[1, 2, 3, 4, 5].map((lines) => (
                          <option key={lines} value={lines}>{lines}</option>
                        ))}
                      </select>
                      <span className="text-[11px] opacity-80">
                        {targetParallelLines > 1 ? 'Controlled parallel mode' : 'Single-line mode'}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void authorizeDial()}
                  disabled={authorizingCall || callBlocked || !canDialLead || leadAttemptActive}
                  className={cn(
                    'flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-lg font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 lg:py-5 lg:text-xl',
                    leadAttemptActive || called
                      ? 'bg-gray-700 text-gray-300'
                      : callBlocked || !canDialLead
                        ? 'bg-gray-800 text-gray-400'
                        : 'bg-green-500 text-white shadow-lg shadow-green-900/40 hover:bg-green-600 active:bg-green-700'
                  )}
                >
                  {authorizingCall ? <Loader2 size={22} className="animate-spin"/> : <Phone size={22}/>}
                  {authorizingCall
                    ? 'Dialing lead into live session...'
                    : leadAttemptActive
                      ? 'Line already active'
                    : callBlocked
                    ? 'Calling blocked'
                    : !canDialLead
                      ? session?.waiting_for_disposition
                        ? 'Save disposition first'
                        : 'Click Ready first'
                      : nextQueueLead
                        ? `Dial ${nextQueueLead.phone}`
                        : 'Queue complete'}
                </button>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Dialer Status</p>
                    <p className="mt-1 text-sm text-gray-200">
                      {callProviderMessage ?? (callProviderStatus ? `Twilio status: ${callProviderStatus}` : sessionStatus.message)}
                    </p>
                    {attempts.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {attempts
                          .filter((attempt) => isActiveAttemptStatus(attempt.attempt_status))
                          .sort((a, b) => a.queue_slot - b.queue_slot)
                          .map((attempt) => (
                            <div
                              key={attempt.id}
                              className={cn(
                                'flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                                attempt.is_winner
                                  ? 'border-purple-500/50 bg-purple-500/15 text-purple-300'
                                  : attempt.attempt_status === 'answered_human' || attempt.attempt_status === 'bridged'
                                  ? 'border-green-500/50 bg-green-500/15 text-green-300'
                                  : 'border-gray-800 bg-gray-900 text-gray-400'
                              )}
                            >
                              <div className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                attempt.is_winner || attempt.attempt_status === 'answered_human' || attempt.attempt_status === 'bridged'
                                  ? 'animate-pulse bg-green-500'
                                  : 'bg-gray-600'
                              )} />
                              Line {attempt.queue_slot}: {attempt.attempt_status.replace('_', ' ')}
                            </div>
                          ))}
                        {activeAttemptCount === 0 && sessionStatus.label === 'Live' && !session?.waiting_for_disposition && (
                          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                            Ready for next attempt...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-300">
                    <input
                      type="checkbox"
                      checked={autoAdvance}
                      onChange={e => setAutoAdvance(e.target.checked)}
                    />
                    Auto-next
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4 lg:hidden">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Call Outcome</p>
                    {acting && <Loader2 size={16} className="animate-spin text-gray-500" />}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {DISPOSITIONS.map(d => {
                      const Icon = d.icon
                      return (
                        <button
                          key={d.key}
                          onClick={() => logAndAdvance(d)}
                          disabled={acting}
                          className={cn('flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50', d.color)}
                        >
                          <Icon size={18}/> {d.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-gray-800 bg-gray-950 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Text Message</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {current.last_sms_sent_at
                          ? `${current.last_sms_status ?? 'sent'} · ${formatInviteTimestamp(current.last_sms_sent_at) ?? 'just now'}`
                          : 'No text sent yet'}
                        {current.sms_clicked_count ? ` • ${current.sms_clicked_count} clicked` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSmsComposer(value => !value)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                    >
                      <Send size={15} />
                      {showSmsComposer ? 'Hide Text' : 'Send Text'}
                    </button>
                  </div>

                  {showSmsComposer && (
                    <div className="mt-3 space-y-3 border-t border-gray-800 pt-3">
                      <div className="flex flex-wrap gap-2">
                        {([
                          { key: 'portal_invite', label: 'Portal Link' },
                          { key: 'follow_up', label: 'Follow Up' },
                          { key: 'demo_booking', label: 'Demo Prep' },
                        ] as const).map(template => (
                          <button
                            key={template.key}
                            type="button"
                            onClick={() => {
                              setSmsTemplateKey(template.key)
                              setSmsBody(buildSmsTemplate(template.key, current))
                            }}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              smsTemplateKey === template.key
                                ? 'border-blue-500 bg-blue-500/15 text-blue-200'
                                : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                            )}
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={smsBody}
                        onChange={e => setSmsBody(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                        placeholder="Write the text message..."
                      />
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] leading-relaxed text-gray-500">
                          The portal link is tracked automatically for clicks and signup attribution.
                        </p>
                        <button
                          type="button"
                          onClick={sendSms}
                          disabled={smsSending || !smsBody.trim()}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {smsSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                          {smsSending ? 'Sending…' : 'Send Now'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Queue Position</p>
                    <p className="mt-1 text-lg font-semibold text-white">{index + 1} / {total}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Remaining</p>
                    <p className="mt-1 text-lg font-semibold text-white">{remaining}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Completed</p>
                    <p className="mt-1 text-lg font-semibold text-white">{done}</p>
                  </div>
                </div>

                {current.email && (
                  <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invite Actions</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {([
                        { key: 'portal', label: 'Send Portal Invite' },
                        { key: 'pre_analyzer', label: 'Send Pre-Analyzer Invite' },
                      ] as const).map(action => {
                        const meta = inviteStatusMeta(action.key)
                        const sending = inviteSending === action.key
                        const success = inviteSuccess === action.key

                        return (
                          <button
                            key={action.key}
                            type="button"
                            onClick={() => sendInvite(action.key)}
                            disabled={Boolean(inviteSending)}
                            className={cn(
                              'rounded-2xl border px-4 py-3 text-left transition-colors disabled:opacity-60',
                              success
                                ? 'border-green-600 bg-green-600/10 text-green-100'
                                : 'border-gray-800 bg-gray-900 text-gray-100 hover:border-green-700 hover:bg-gray-900/80'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                              <span className="text-sm font-semibold">{sending ? 'Sending…' : action.label}</span>
                            </div>
                            <p className="mt-2 text-xs text-gray-400">
                              {meta.sent
                                ? `${meta.status ?? 'sent'} · ${formatInviteTimestamp(meta.sentAt) ?? 'just now'}`
                                : 'Not sent yet'}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {current.email && (
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-500">
                    <Mail size={11}/> {current.email}
                  </p>
                )}

                {current.notes && (
                  <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-800/80 p-4">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Existing Notes</p>
                    <p className="text-sm leading-relaxed text-gray-300">{current.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 lg:sticky lg:top-6">
              {/* Browser Audio Controls - Show when in browser mode */}
              {connectionMode === 'browser' && (
                <BrowserAudio
                  connectionMode={connectionMode}
                  deviceStatus={deviceStatus}
                  sessionBusy={sessionBusy}
                  onReconnect={() => {
                    setDeviceStatus('offline')
                    setSession(null)
                    setAttempts([])
                    setCalled(false)
                    setActiveCallId(null)
                    setCallProviderStatus(null)
                    setCallProviderMessage(null)
                    // Trigger reconnection
                    setTimeout(() => {
                      setReady()
                    }, 1000)
                  }}
                />
              )}

              {/* Live Call Feed - Show during active dialing */}
              {session && session.session_status !== 'not_ready' && (
                <LiveCallFeed
                  attempts={attempts}
                  targetParallelLines={targetParallelLines}
                  activeCallId={activeCallId}
                  leads={leads}
                />
              )}

              <div className="hidden rounded-3xl border border-gray-800 bg-gray-900/90 p-4 lg:block lg:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Call Outcome</p>
                  {acting && <Loader2 size={16} className="animate-spin text-gray-500" />}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {DISPOSITIONS.map(d => {
                    const Icon = d.icon
                    return (
                      <button
                        key={d.key}
                        onClick={() => logAndAdvance(d)}
                        disabled={acting}
                        className={cn('flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 lg:min-h-[54px]', d.color)}
                      >
                        <Icon size={18}/> {d.label}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <button onClick={skip} className="flex items-center justify-center gap-2 rounded-2xl bg-gray-800 py-3.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700">
                    <ChevronRight size={16}/> Skip
                  </button>
                  <div className="flex items-center justify-center text-center text-xs text-gray-600">
                    {index + 1} / {total}
                  </div>
                  <Link href={`/admin/crm/${current.id}`} className="flex items-center justify-center gap-2 rounded-2xl bg-gray-800 py-3.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700">
                    <Users size={15}/> Full Profile
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-800 bg-gray-900/90 p-4 lg:p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Call Details</p>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Call Notes</label>
                  <input
                    className="w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:border-green-600 focus:outline-none"
                    placeholder="Quick note (optional)..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                  />
                </div>

                <div className={cn('grid grid-cols-1 gap-3 xl:grid-cols-2', 'mt-0 lg:mt-4')}>
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                      <Flame size={12} /> Lead Temperature
                    </label>
                    <select
                      className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-200 focus:border-green-600 focus:outline-none"
                      value={temperature}
                      onChange={e => setTemperature(e.target.value as 'cold' | 'warm' | 'hot')}
                    >
                      <option value="cold">Cold</option>
                      <option value="warm">Warm</option>
                      <option value="hot">Hot</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Next Follow-Up</label>
                    <input
                      className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-200 focus:border-green-600 focus:outline-none"
                      type="datetime-local"
                      value={nextFollowUpAt}
                      onChange={e => setNextFollowUpAt(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-200">
                    <input type="checkbox" checked={strategyBooked} onChange={e => setStrategyBooked(e.target.checked)} />
                    Strategy call booked
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-200">
                    <input type="checkbox" checked={converted} onChange={e => setConverted(e.target.checked)} />
                    Converted to paying client
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
