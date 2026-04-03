import type { CRMCallOutcome, CRMCallStatus } from '@/lib/crm'

export const CRM_DIALER_SESSION_STATES = [
  'ready',
  'not_ready',
  'connecting',
  'waiting',
  'in_call',
  'ended',
  'failed',
] as const

export type CRMDialerSessionState = typeof CRM_DIALER_SESSION_STATES[number]

export const CRM_DIALER_REP_STATES = [
  'connecting',
  'waiting',
  'in_call',
  'not_ready',
  'error',
] as const

export type CRMDialerRepState = typeof CRM_DIALER_REP_STATES[number]

export const CRM_DIALER_ACTIVE_ATTEMPT_STATUSES = [
  'queued',
  'dialing',
  'ringing',
  'answered_human',
  'answered_machine',
  'bridged',
] as const

export const CRM_DIALER_TERMINAL_ATTEMPT_STATUSES = [
  'busy',
  'no_answer',
  'failed',
  'canceled',
  'completed',
  'disconnected',
] as const

export const CRM_DIALER_RETRY_OUTCOMES = new Set<string>([
  'No Answer',
  'Busy',
  'Voicemail',
  'Left Voicemail',
  'Call Back',
  'Call Back Later',
])

export function getConfiguredTwilioVoiceNumber(settings: { twilio_caller_id?: string | null } | null | undefined) {
  return settings?.twilio_caller_id?.trim()
    || process.env.TWILIO_PHONE_NUMBER?.trim()
    || process.env.TWILIO_CALLER_ID?.trim()
    || null
}

export function buildDialerConferenceName(agentUserId: string) {
  return `crm-rep-${agentUserId}-${Date.now()}`
}

export function isDialerSessionActive(state: string | null | undefined) {
  return state === 'ready' || state === 'connecting' || state === 'waiting' || state === 'in_call'
}

export function isActiveAttemptStatus(status: string | null | undefined) {
  return CRM_DIALER_ACTIVE_ATTEMPT_STATUSES.includes((status ?? '') as typeof CRM_DIALER_ACTIVE_ATTEMPT_STATUSES[number])
}

export function isTerminalAttemptStatus(status: string | null | undefined) {
  return CRM_DIALER_TERMINAL_ATTEMPT_STATUSES.includes((status ?? '') as typeof CRM_DIALER_TERMINAL_ATTEMPT_STATUSES[number])
}

export function mapTwilioStatusToCrmCallStatus(status: string | null | undefined): CRMCallStatus {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'busy':
    case 'no-answer':
    case 'failed':
    case 'canceled':
      return 'missed'
    default:
      return 'attempted'
  }
}

export function mapTwilioStatusToOutcome(status: string | null | undefined): CRMCallOutcome | null {
  switch (status) {
    case 'busy':
      return 'Busy'
    case 'no-answer':
      return 'No Answer'
    case 'failed':
      return 'Bad Number'
    default:
      return null
  }
}

export function mapTwilioStatusToAttemptStatus(status: string | null | undefined) {
  switch (status) {
    case 'queued':
    case 'initiated':
      return 'dialing'
    case 'ringing':
      return 'ringing'
    case 'busy':
      return 'busy'
    case 'no-answer':
      return 'no_answer'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'canceled'
    case 'completed':
      return 'completed'
    default:
      return 'dialing'
  }
}

export function mapAmdAnsweredByToOutcome(answeredBy: string | null | undefined): CRMCallOutcome | null {
  if (!answeredBy) return null
  if (answeredBy === 'human') return null
  if (answeredBy === 'fax') return 'Bad Number'
  if (answeredBy.startsWith('machine_')) return 'Voicemail'
  return null
}

export function mapAnsweredByToAttemptStatus(answeredBy: string | null | undefined) {
  if (!answeredBy) return null
  if (answeredBy === 'human') return 'answered_human'
  if (answeredBy === 'fax' || answeredBy.startsWith('machine_')) return 'answered_machine'
  return null
}

export function getRetryFollowUpAt(outcome: string | null | undefined, baseIso = new Date().toISOString()) {
  const base = new Date(baseIso)

  switch (outcome) {
    case 'Busy':
      base.setHours(base.getHours() + 2)
      return base.toISOString()
    case 'No Answer':
    case 'Voicemail':
    case 'Left Voicemail':
      base.setHours(base.getHours() + 4)
      return base.toISOString()
    case 'Call Back':
    case 'Call Back Later':
      base.setHours(base.getHours() + 24)
      return base.toISOString()
    default:
      return null
  }
}

export function getLeadDialerPriority(lead: {
  call_window_status?: string | null
  callback_due_at?: string | null
  follow_up_at?: string | null
  lead_temperature?: string | null
  last_call_outcome?: string | null
  last_call_at?: string | null
}) {
  let score = 0

  if (lead.call_window_status === 'callable_now') score += 100
  if (lead.callback_due_at && new Date(lead.callback_due_at).getTime() <= Date.now()) score += 50
  if (lead.follow_up_at && new Date(lead.follow_up_at).getTime() <= Date.now()) score += 35
  if (lead.lead_temperature === 'hot') score += 30
  if (lead.lead_temperature === 'warm') score += 15
  if (lead.last_call_outcome === 'Interested' || lead.last_call_outcome === 'Appointment Set' || lead.last_call_outcome === 'Booked Call') score += 20
  if (lead.last_call_at) score -= Math.min(Math.floor((Date.now() - new Date(lead.last_call_at).getTime()) / (1000 * 60 * 60)), 24)

  return score
}
