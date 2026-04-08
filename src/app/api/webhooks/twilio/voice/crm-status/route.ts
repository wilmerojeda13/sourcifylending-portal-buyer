import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { mapAmdAnsweredByToOutcome, mapTwilioStatusToAttemptStatus, mapTwilioStatusToCrmCallStatus, mapTwilioStatusToOutcome } from '@/lib/crm-dialer'
import { syncDialerSessionState, type DialerAttemptRow } from '@/lib/crm-dialer-attempts'

async function readBody(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text()
    const params = new URLSearchParams(text)
    const body: Record<string, string> = {}
    params.forEach((value, key) => { body[key] = value })
    return body
  }
  return await req.json().catch(() => ({}))
}

export async function POST(req: NextRequest) {
  console.log('[CRM STATUS WEBHOOK] === PRODUCTION WEBHOOK TRACE START ===')
  console.log('[CRM STATUS WEBHOOK] Request timestamp:', new Date().toISOString())
  
  const crmCallId = req.nextUrl.searchParams.get('crmCallId')
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  const leg = req.nextUrl.searchParams.get('leg') ?? 'lead'
  const body = await readBody(req)

  console.log('[CRM STATUS WEBHOOK] Webhook params:', { crmCallId, sessionId, leg })
  console.log('[CRM STATUS WEBHOOK] Twilio status update:', {
    callSid: body.CallSid,
    callStatus: body.CallStatus,
    answeredBy: body.AnsweredBy,
    callDuration: body.CallDuration,
    from: body.From,
    to: body.To
  })

  const callSid = body.CallSid
  const callStatus = body.CallStatus
  const answeredBy = body.AnsweredBy
  const durationSeconds = parseInt(body.CallDuration ?? '0', 10) || 0

  const supabase = await createServiceClient()

  if (sessionId && leg === 'agent_session') {
    const sessionUpdates: Record<string, unknown> = {
      twilio_agent_call_sid: callSid ?? null,
      updated_at: new Date().toISOString(),
    }

    if (callStatus === 'answered') {
      sessionUpdates.answered_at = new Date().toISOString()
      sessionUpdates.session_status = 'waiting'
    } else if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(callStatus ?? '')) {
      sessionUpdates.session_status = callStatus === 'completed' ? 'ended' : 'failed'
      sessionUpdates.ended_at = new Date().toISOString()
      sessionUpdates.last_error = ['busy', 'failed', 'no-answer', 'canceled'].includes(callStatus ?? '') ? callStatus : null
      sessionUpdates.current_lead_id = null
      sessionUpdates.current_crm_call_id = null
    }

    await supabase.from('crm_dialer_sessions').update(sessionUpdates).eq('id', sessionId)
    return NextResponse.json({ ok: true })
  }

  if (!crmCallId) return NextResponse.json({ ok: true })

  const { data: currentCall } = await supabase
    .from('crm_calls')
    .select('id, lead_id, call_outcome, metadata, dialer_session_id, dialer_attempt_id, answered_by, amd_status')
    .eq('id', crmCallId)
    .maybeSingle()

  if (!currentCall) return NextResponse.json({ ok: true })

  const outcomeFromStatus = mapTwilioStatusToOutcome(callStatus)
  const outcomeFromAmd = mapAmdAnsweredByToOutcome(answeredBy)
  const currentMetadata = (currentCall.metadata as Record<string, unknown> | null) ?? {}
  const dispositionLocked = Boolean(currentMetadata.manual_disposition_locked)
  const callOutcome = dispositionLocked
    ? currentCall.call_outcome || 'Follow Up'
    : outcomeFromAmd || outcomeFromStatus || currentCall.call_outcome || 'Follow Up'

  const updates: Record<string, unknown> = {
    call_status: mapTwilioStatusToCrmCallStatus(callStatus),
    twilio_status: callStatus ?? null,
    updated_at: new Date().toISOString(),
    metadata: {
      ...currentMetadata,
      [`${leg}_status_callback`]: {
        call_status: callStatus ?? null,
        answered_by: answeredBy ?? null,
        timestamp: new Date().toISOString(),
      },
    },
  }

  if (leg === 'agent') {
    updates.twilio_agent_call_sid = callSid ?? null
  } else {
    updates.twilio_call_sid = callSid ?? null
    updates.answered_by = answeredBy ?? null
  }

  if (callStatus === 'answered') {
    updates.call_started_at = new Date().toISOString()
  }

  if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(callStatus ?? '')) {
    updates.call_ended_at = new Date().toISOString()
    updates.duration_seconds = durationSeconds
    const dialerLeadLeg = Boolean(currentCall.dialer_session_id) && leg === 'lead'
    if (!dialerLeadLeg && (!dispositionLocked || !currentCall.call_outcome)) {
      updates.call_outcome = callOutcome
    }
  }

  await supabase.from('crm_calls').update(updates).eq('id', crmCallId)

  let currentAttempt: DialerAttemptRow | null = null

  if (currentCall.dialer_attempt_id) {
    const { data: attempt } = await supabase
      .from('crm_dialer_attempts')
      .select('*')
      .eq('id', currentCall.dialer_attempt_id)
      .maybeSingle<DialerAttemptRow>()

    if (attempt) {
      currentAttempt = attempt
      const attemptMetadata = (attempt.metadata as Record<string, unknown> | null) ?? {}
      const attemptStatus = mapTwilioStatusToAttemptStatus(callStatus)
      await supabase
        .from('crm_dialer_attempts')
        .update({
          attempt_status: attempt.is_winner && attempt.attempt_status === 'bridged' && callStatus === 'completed'
            ? 'completed'
            : attemptStatus,
          last_twilio_status: callStatus ?? null,
          answered_by: answeredBy ?? attempt.answered_by,
          amd_status: answeredBy ?? attempt.amd_status,
          resolved_at: ['busy', 'failed', 'no-answer', 'canceled', 'completed'].includes(callStatus ?? '') ? new Date().toISOString() : attempt.resolved_at,
          metadata: {
            ...attemptMetadata,
            status_callback: body,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', attempt.id)

    }
  }

  // Power dialer: outcomes are saved only when the rep chooses a disposition — do not mutate
  // the lead row from Twilio status callbacks while this call belongs to a dialer session.
  if (
    currentCall.lead_id &&
    !currentCall.dialer_session_id &&
    ['busy', 'failed', 'no-answer', 'canceled', 'completed'].includes(callStatus ?? '')
  ) {
    await supabase
      .from('crm_leads')
      .update({
        last_call_at: new Date().toISOString(),
        last_call_outcome: dispositionLocked && currentCall.call_outcome ? currentCall.call_outcome : callOutcome,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentCall.lead_id)
  }

  if (
    sessionId &&
    leg === 'lead' &&
    currentCall.dialer_session_id &&
    ['busy', 'failed', 'no-answer', 'canceled', 'completed'].includes(callStatus ?? '')
  ) {
    const requiresManualDisposition = true

    console.log('[CRM STATUS WEBHOOK] Dialer terminal leg disposition gate:', {
      crmCallId,
      callStatus,
      answeredBy,
      currentCallAnsweredBy: currentCall.answered_by,
      currentCallAmdStatus: currentCall.amd_status,
      isWinner: currentAttempt?.is_winner ?? false,
      requiresManualDisposition,
    })

    if (requiresManualDisposition) {
      await supabase
        .from('crm_dialer_sessions')
        .update({
          waiting_for_disposition: true,
          current_lead_id: currentCall.lead_id,
          current_crm_call_id: currentCall.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    }
  }

  if (sessionId) {
    await syncDialerSessionState(supabase, sessionId)
  }

  console.log('[CRM STATUS WEBHOOK] Database updates completed for call:', crmCallId)
  console.log('[CRM STATUS WEBHOOK] === PRODUCTION WEBHOOK TRACE END ===')
  
  return NextResponse.json({ ok: true })
}
