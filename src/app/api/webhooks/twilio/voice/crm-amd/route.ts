import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { mapAmdAnsweredByToOutcome } from '@/lib/crm-dialer'
import { applyAutoDisposition, cancelOtherActiveAttempts, endTwilioCallsBySid, syncDialerSessionState, type DialerAttemptRow, updateConferenceParticipant } from '@/lib/crm-dialer-attempts'

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
  const crmCallId = req.nextUrl.searchParams.get('crmCallId')
  if (!crmCallId) return NextResponse.json({ ok: true })

  const body = await readBody(req)
  const answeredBy = body.AnsweredBy ?? body.AnsweredByResult ?? null
  const outcome = mapAmdAnsweredByToOutcome(answeredBy)

  const supabase = await createServiceClient()
  const { data: crmCall } = await supabase
    .from('crm_calls')
    .select('id, lead_id, call_outcome, metadata, dialer_session_id, dialer_attempt_id, twilio_call_sid')
    .eq('id', crmCallId)
    .maybeSingle()

  if (!crmCall) return NextResponse.json({ ok: true })
  const currentMetadata = (crmCall.metadata as Record<string, unknown> | null) ?? {}
  const dispositionLocked = Boolean(currentMetadata.manual_disposition_locked)

  await supabase
    .from('crm_calls')
    .update({
      answered_by: answeredBy,
      amd_status: answeredBy,
      call_outcome: dispositionLocked ? undefined : outcome ?? undefined,
      metadata: {
        ...currentMetadata,
        amd_callback: body,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', crmCallId)

  if (crmCall.dialer_attempt_id) {
    const { data: attempt } = await supabase
      .from('crm_dialer_attempts')
      .select('*')
      .eq('id', crmCall.dialer_attempt_id)
      .maybeSingle<DialerAttemptRow>()

    if (attempt) {
      if (answeredBy === 'human') {
        // ATOMIC WINNER SELECTION: Use database transaction to prevent race conditions
        // This ensures only ONE winner per session, even with simultaneous answers
        try {
          const { data: attempt } = await supabase
            .from('crm_dialer_attempts')
            .select('*')
            .eq('id', crmCall.dialer_attempt_id)
            .single()
        
          if (!attempt) {
            console.error(`[AMD] Attempt ${crmCall.dialer_attempt_id} not found`)
            return NextResponse.json({ ok: true })
          }
        
          // Check if this attempt is already resolved (race condition guard)
          if (attempt.resolved_at && attempt.is_winner) {
            console.log(`[AMD] Attempt ${crmCall.dialer_attempt_id} already resolved as winner, skipping`)
            return NextResponse.json({ ok: true })
          }
        
          // Use RPC to ensure atomic winner selection
          const { data: winnerResult } = await supabase.rpc('mark_dialer_winner_atomic', {
            session_id: crmCall.dialer_session_id,
            winning_attempt_id: crmCall.dialer_attempt_id,
            timestamp: new Date().toISOString(),
          })
        
          if (!winnerResult.success) {
            console.error(`[AMD] Failed to mark winner atomically:`, winnerResult.error)
            // Fallback to non-atomic behavior
            await supabase
              .from('crm_dialer_attempts')
              .update({
                attempt_status: 'answered_human',
                is_winner: true,
                answered_by: answeredBy,
                amd_status: answeredBy,
                updated_at: new Date().toISOString(),
              })
              .eq('id', crmCall.dialer_attempt_id)
          } else {
            console.log(`[AMD] Atomically marked winner: ${crmCall.dialer_attempt_id} at ${winnerResult.timestamp}`)
          }

          await supabase
            .from('crm_dialer_attempts')
            .update({
              attempt_status: 'answered_human',
              is_winner: true,
              answered_by: answeredBy,
              amd_status: answeredBy,
              updated_at: new Date().toISOString(),
            })
            .eq('id', attempt.id)

        if (crmCall.dialer_session_id) {
          const { data: session } = await supabase
            .from('crm_dialer_sessions')
            .select('twilio_conference_sid')
            .eq('id', crmCall.dialer_session_id)
            .maybeSingle<{ twilio_conference_sid: string | null }>()

          if (session?.twilio_conference_sid && crmCall.twilio_call_sid) {
            await updateConferenceParticipant({
              conferenceSid: session.twilio_conference_sid,
              callSid: crmCall.twilio_call_sid,
              muted: false,
              hold: false,
            })
          }

          const others = await cancelOtherActiveAttempts(supabase, {
            sessionId: crmCall.dialer_session_id,
            winnerAttemptId: attempt.id,
          })

          await Promise.all(
            others.map((other) =>
              supabase
                .from('crm_dialer_attempts')
                .update({
                  attempt_status: 'canceled',
                  resolution_type: 'canceled_for_live_answer',
                  resolved_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', other.id),
            ),
          )

          await Promise.all(
            others.map((other) =>
              supabase
                .from('crm_calls')
                .update({
                  call_outcome: 'Follow Up',
                  resolution_type: 'canceled_for_live_answer',
                  twilio_status: 'canceled',
                  call_ended_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', other.crm_call_id),
            ),
          )

          await endTwilioCallsBySid(
            others
              .map((other) => other.twilio_call_sid)
              .filter((sid): sid is string => Boolean(sid)),
          )
        }
      } catch (error) {
        console.error(`[AMD] Error marking winner:`, error)
        return NextResponse.json({ ok: true })
      }
      } else if (!dispositionLocked && outcome) {
        // First write answered_machine so the client sees which line got voicemail
        // before we hang up and auto-dispose (Realtime fires on this update)
        await supabase
          .from('crm_dialer_attempts')
          .update({
            attempt_status: 'answered_machine',
            answered_by: answeredBy,
            amd_status: answeredBy,
            updated_at: new Date().toISOString(),
          })
          .eq('id', attempt.id)

        if (crmCall.twilio_call_sid) {
          await endTwilioCallsBySid([crmCall.twilio_call_sid])
        }

        await applyAutoDisposition(supabase, {
          attempt,
          outcome,
          resolutionType: outcome === 'Voicemail' ? 'auto_voicemail' : 'auto_bad_number',
          answeredBy,
          twilioStatus: 'completed',
        })
      }
    }
  }

  if (crmCall.dialer_session_id) {
    await syncDialerSessionState(supabase, crmCall.dialer_session_id)
  }

  return NextResponse.json({ ok: true })
}
