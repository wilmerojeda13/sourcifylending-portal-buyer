import twilio from 'twilio'
import { getRetryFollowUpAt, isActiveAttemptStatus, mapTwilioStatusToCrmCallStatus, type CRMDialerRepState } from '@/lib/crm-dialer'
import { outcomeToLegacyStage, probabilityFromTemperature } from '@/lib/crm'

type ServiceClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>

// Debounce map to prevent redundant session syncs within 2-second windows
// This reduces Supabase write load from high-frequency Twilio webhooks
const syncDebounceMap = new Map<string, number>()
const DEBOUNCE_MS = 2000

function shouldDebounce(sessionId: string): boolean {
  const now = Date.now()
  const lastSync = syncDebounceMap.get(sessionId)
  if (lastSync && (now - lastSync) < DEBOUNCE_MS) {
    return true // Skip this sync
  }
  syncDebounceMap.set(sessionId, now)
  return false
}

export type DialerAttemptRow = {
  id: string
  dialer_session_id: string
  crm_call_id: string
  lead_id: string
  agent_user_id: string
  attempt_status: string
  resolution_type: string | null
  queue_slot: number
  is_winner: boolean
  was_auto_dispositioned: boolean
  twilio_call_sid: string | null
  answered_by: string | null
  amd_status: string | null
  last_twilio_status: string | null
  resolved_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type DialerSessionRow = {
  id: string
  session_status: string
  rep_state: string | null
  current_lead_id: string | null
  current_crm_call_id: string | null
  winning_attempt_id: string | null
  waiting_for_disposition: boolean | null
  active_attempt_count: number | null
  target_parallel_lines: number | null
}

export async function loadSessionAttempts(supabase: ServiceClient, sessionId: string) {
  const { data, error } = await supabase
    .from('crm_dialer_attempts')
    .select('*')
    .eq('dialer_session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error
  return (data ?? []) as DialerAttemptRow[]
}

export function mapRepStateToSessionStatus(repState: CRMDialerRepState) {
  switch (repState) {
    case 'error':
      return 'failed'
    case 'not_ready':
      return 'not_ready'
    default:
      return repState
  }
}

export async function syncDialerSessionState(supabase: ServiceClient, sessionId: string) {
  // Debounce: skip redundant syncs within 2-second window to reduce Supabase writes
  if (shouldDebounce(sessionId)) {
    return null
  }

  const [{ data: session }, attempts] = await Promise.all([
    supabase
      .from('crm_dialer_sessions')
      .select('id, session_status, rep_state, current_lead_id, current_crm_call_id, winning_attempt_id, waiting_for_disposition, active_attempt_count, target_parallel_lines')
      .eq('id', sessionId)
      .maybeSingle<DialerSessionRow>(),
    loadSessionAttempts(supabase, sessionId),
  ])

  if (!session) return null

  const activeAttempts = attempts.filter((attempt) => isActiveAttemptStatus(attempt.attempt_status))
  const winner = attempts.find((attempt) => attempt.is_winner && !attempt.resolved_at) ?? null

  let repState: CRMDialerRepState
  if (session.session_status === 'connecting') {
    repState = 'connecting'
  } else if (session.session_status === 'not_ready' || session.session_status === 'ended') {
    repState = 'not_ready'
  } else if (session.session_status === 'failed' || session.rep_state === 'error') {
    repState = 'error'
  } else if (winner || session.waiting_for_disposition) {
    repState = 'in_call'
  } else {
    repState = 'waiting'
  }

  // Preserve waiting_for_disposition=true after any power-dial attempt ends. The rep must
  // manually disposition before the next lead is allowed to start. Only auto-clear it when
  // the session itself is dead (not_ready/ended/error), or when the manual disposition API
  // explicitly sets waiting_for_disposition=false on the session row before syncing state.
  const sessionIsLive = repState !== 'not_ready' && repState !== 'error'
  const waitingForDisposition = sessionIsLive
    ? Boolean(winner) || (session.waiting_for_disposition ?? false)
    : false
  const pendingLeadId = waitingForDisposition
    ? winner?.lead_id ?? session.current_lead_id ?? null
    : null
  const pendingCallId = waitingForDisposition
    ? winner?.crm_call_id ?? session.current_crm_call_id ?? null
    : null

  const update = {
    rep_state: repState,
    session_status: mapRepStateToSessionStatus(repState),
    current_lead_id: pendingLeadId,
    current_crm_call_id: pendingCallId,
    winning_attempt_id: winner?.id ?? null,
    waiting_for_disposition: waitingForDisposition,
    active_attempt_count: activeAttempts.length,
    updated_at: new Date().toISOString(),
  }

  await supabase
    .from('crm_dialer_sessions')
    .update(update)
    .eq('id', sessionId)

  return {
    ...session,
    ...update,
    attempts,
  }
}

export async function getNextQueueSlot(supabase: ServiceClient, sessionId: string, maxLines: number) {
  const attempts = await loadSessionAttempts(supabase, sessionId)
  const used = new Set(
    attempts
      .filter((attempt) => isActiveAttemptStatus(attempt.attempt_status))
      .map((attempt) => attempt.queue_slot),
  )

  for (let slot = 1; slot <= maxLines; slot += 1) {
    if (!used.has(slot)) return slot
  }
  return maxLines
}

export async function createDialerAttempt(
  supabase: ServiceClient,
  payload: {
    dialerSessionId: string
    crmCallId: string
    leadId: string
    agentUserId: string
    queueSlot: number
    priorityScore?: number | null
  },
) {
  const { data, error } = await supabase
    .from('crm_dialer_attempts')
    .insert({
      dialer_session_id: payload.dialerSessionId,
      crm_call_id: payload.crmCallId,
      lead_id: payload.leadId,
      agent_user_id: payload.agentUserId,
      attempt_status: 'queued',
      queue_slot: payload.queueSlot,
      priority_score: payload.priorityScore ?? null,
    })
    .select('*')
    .single<DialerAttemptRow>()

  if (error || !data) throw error ?? new Error('Failed to create dialer attempt')
  return data
}

export async function updateAttemptStatus(
  supabase: ServiceClient,
  attemptId: string,
  updates: Partial<DialerAttemptRow> & { metadata?: Record<string, unknown> | null },
) {
  const { error } = await supabase
    .from('crm_dialer_attempts')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', attemptId)

  if (error) throw error
}

export async function applyAutoDisposition(
  supabase: ServiceClient,
  input: {
    attempt: DialerAttemptRow
    outcome: string
    resolutionType: string
    twilioStatus?: string | null
    answeredBy?: string | null
    durationSeconds?: number | null
  },
) {
  const timestamp = new Date().toISOString()
  const metadata = input.attempt.metadata ?? {}
  if (input.attempt.resolved_at || input.attempt.was_auto_dispositioned) {
    return
  }

  const { data: call } = await supabase
    .from('crm_calls')
    .select('id, lead_id, call_started_at, lead_temperature')
    .eq('id', input.attempt.crm_call_id)
    .maybeSingle<{ id: string; lead_id: string; call_started_at: string | null; lead_temperature: 'cold' | 'warm' | 'hot' | null }>()

  if (!call) return

  const nextFollowUpAt = getRetryFollowUpAt(input.outcome, timestamp)

  await supabase
    .from('crm_dialer_attempts')
    .update({
      attempt_status:
        input.outcome === 'Voicemail' ? 'completed'
        : input.outcome === 'No Answer' ? 'no_answer'
        : input.outcome === 'Busy' ? 'busy'
        : input.outcome === 'Bad Number' ? 'failed'
        : 'completed',
      resolution_type: input.resolutionType,
      was_auto_dispositioned: true,
      answered_by: input.answeredBy ?? input.attempt.answered_by,
      amd_status: input.answeredBy ?? input.attempt.amd_status,
      last_twilio_status: input.twilioStatus ?? input.attempt.last_twilio_status,
      resolved_at: timestamp,
      metadata: {
        ...metadata,
        auto_disposition_outcome: input.outcome,
        auto_disposition_at: timestamp,
      },
      updated_at: timestamp,
    })
    .eq('id', input.attempt.id)

  await supabase
    .from('crm_calls')
    .update({
      call_status: mapTwilioStatusToCrmCallStatus(input.twilioStatus ?? null),
      call_outcome: input.outcome,
      auto_dispositioned: true,
      auto_disposition_reason: input.resolutionType,
      resolution_type: input.resolutionType,
      twilio_status: input.twilioStatus ?? null,
      answered_by: input.answeredBy ?? input.attempt.answered_by,
      amd_status: input.answeredBy ?? input.attempt.amd_status,
      duration_seconds: input.durationSeconds ?? undefined,
      next_follow_up_at: nextFollowUpAt,
      call_ended_at: timestamp,
      metadata: {
        ...(metadata ?? {}),
        auto_disposition_outcome: input.outcome,
        auto_disposition_reason: input.resolutionType,
        disposition_saved_at: timestamp,
      },
      updated_at: timestamp,
    })
    .eq('id', input.attempt.crm_call_id)

  const mappedStage = outcomeToLegacyStage(input.outcome as never)
  const temperature = (call.lead_temperature ?? 'cold') as 'cold' | 'warm' | 'hot'
  const leadUpdate: Record<string, unknown> = {
    last_call_at: timestamp,
    last_call_outcome: input.outcome,
    callback_due_at: nextFollowUpAt,
    close_probability: probabilityFromTemperature(temperature),
    updated_at: timestamp,
  }
  if (mappedStage) leadUpdate.stage = mappedStage

  await supabase
    .from('crm_leads')
    .update(leadUpdate)
    .eq('id', call.lead_id)

  await supabase
    .from('crm_activities')
    .insert({
      lead_id: call.lead_id,
      type: 'call',
      body: `Auto disposition: ${input.outcome}`,
      metadata: {
        call_id: call.id,
        dialer_attempt_id: input.attempt.id,
        auto_dispositioned: true,
        resolution_type: input.resolutionType,
      },
      created_by: 'Dialer Automation',
    })
}

export async function cancelOtherActiveAttempts(
  supabase: ServiceClient,
  input: {
    sessionId: string
    winnerAttemptId: string
  },
) {
  const attempts = await loadSessionAttempts(supabase, input.sessionId)
  return attempts.filter((attempt) => attempt.id !== input.winnerAttemptId && isActiveAttemptStatus(attempt.attempt_status))
}

export async function endTwilioCallsBySid(callSids: string[]) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken || callSids.length === 0) return

  const client = twilio(accountSid, authToken)
  await Promise.all(
    callSids.map((sid) => client.calls(sid).update({ status: 'completed' }).catch(() => null)),
  )
}

export async function updateConferenceParticipant(
  input: {
    conferenceSid: string
    callSid: string
    muted?: boolean
    hold?: boolean
  },
) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return

  const client = twilio(accountSid, authToken)
  await client
    .conferences(input.conferenceSid)
    .participants(input.callSid)
    .update({
      ...(typeof input.muted === 'boolean' ? { muted: input.muted } : {}),
      ...(typeof input.hold === 'boolean' ? { hold: input.hold } : {}),
    })
    .catch(() => null)
}
