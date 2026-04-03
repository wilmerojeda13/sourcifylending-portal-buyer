import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { syncDialerSessionState } from '@/lib/crm-dialer-attempts'

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
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  const crmCallId = req.nextUrl.searchParams.get('crmCallId')
  const participant = req.nextUrl.searchParams.get('participant')
  if (!sessionId || !participant) return NextResponse.json({ ok: true })

  const body = await readBody(req)
  const event = body.StatusCallbackEvent ?? body.SequenceNumber ?? null
  const conferenceSid = body.ConferenceSid ?? null
  const callSid = body.CallSid ?? null
  const timestamp = new Date().toISOString()

  const supabase = await createServiceClient()

  if (participant === 'agent') {
    const updates: Record<string, unknown> = {
      twilio_conference_sid: conferenceSid,
      updated_at: timestamp,
    }

    if (event === 'participant-join' || event === 'conference-start') {
      updates.answered_at = timestamp
    } else if (event === 'participant-leave' || event === 'conference-end') {
      updates.session_status = 'not_ready'
      updates.rep_state = 'not_ready'
      updates.ended_at = timestamp
      updates.current_lead_id = null
      updates.current_crm_call_id = null
      updates.active_attempt_count = 0
      updates.waiting_for_disposition = false
    }

    await supabase.from('crm_dialer_sessions').update(updates).eq('id', sessionId)
    await syncDialerSessionState(supabase, sessionId)
    return NextResponse.json({ ok: true })
  }

  if (crmCallId) {
    const callUpdates: Record<string, unknown> = {
      twilio_conference_sid: conferenceSid,
      lead_leg_status: event,
      updated_at: timestamp,
    }

    if (callSid) {
      callUpdates.twilio_call_sid = callSid
    }

    await supabase.from('crm_calls').update(callUpdates).eq('id', crmCallId)

    const { data: call } = await supabase
      .from('crm_calls')
      .select('dialer_attempt_id')
      .eq('id', crmCallId)
      .maybeSingle<{ dialer_attempt_id: string | null }>()

    if (call?.dialer_attempt_id && conferenceSid) {
      const { data: attempt } = await supabase
        .from('crm_dialer_attempts')
        .select('is_winner, metadata')
        .eq('id', call.dialer_attempt_id)
        .maybeSingle<{ is_winner: boolean; metadata: Record<string, unknown> | null }>()

      const attemptUpdates: Record<string, unknown> = {
        updated_at: timestamp,
        metadata: {
          ...(attempt?.metadata ?? {}),
          conference_sid: conferenceSid,
          participant_event: event,
          participant_timestamp: timestamp,
        },
      }
      if (event === 'participant-join') {
        if (attempt?.is_winner) {
          attemptUpdates.attempt_status = 'bridged'
          attemptUpdates.bridged_at = timestamp
        }
      }

      await supabase
        .from('crm_dialer_attempts')
        .update(attemptUpdates)
        .eq('id', call.dialer_attempt_id)
    }
  }
  await supabase
    .from('crm_dialer_sessions')
    .update({
      twilio_conference_sid: conferenceSid,
      updated_at: timestamp,
    })
    .eq('id', sessionId)
  await syncDialerSessionState(supabase, sessionId)
  return NextResponse.json({ ok: true })
}
