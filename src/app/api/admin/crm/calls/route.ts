import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  CRM_CALL_OUTCOMES,
  CRM_CALL_STATUSES,
  CRM_LEAD_TEMPERATURES,
} from '@/lib/crm'
import { syncDialerSessionState } from '@/lib/crm-dialer-attempts'
import { isMissingRelationError } from '@/lib/supabase-schema'
import { applyCrmDisposition, getDispositionKeyForOutcome } from '@/lib/crm-dispositions'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    supabase,
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
  }
}

export async function GET(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const outcome = searchParams.get('outcome')
  const temperature = searchParams.get('temperature')
  const leadId = searchParams.get('lead_id')
  const owner = searchParams.get('owner')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const page = Math.max(parseInt(searchParams.get('page') ?? '0', 10), 0)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1), 250)

  let query = admin.supabase
    .from('crm_calls')
    .select('*, crm_leads(id, first_name, last_name, business_name, source, stage)', { count: 'exact' })
    .order('call_started_at', { ascending: false })

  if (outcome) query = query.eq('call_outcome', outcome)
  if (temperature) query = query.eq('lead_temperature', temperature)
  if (leadId) query = query.eq('lead_id', leadId)
  if (owner) query = query.eq('agent_user_id', owner)
  if (from) query = query.gte('call_started_at', from)
  if (to) query = query.lte('call_started_at', to)

  query = query.range(page * limit, page * limit + limit - 1)

  const { data, error, count } = await query
  if (error) {
    if (isMissingRelationError(error, 'crm_calls')) {
      console.error('crm_calls unavailable in GET /api/admin/crm/calls', error)
      return NextResponse.json({
        calls: [],
        total: 0,
        page,
        limit,
        unavailable: true,
        message: 'Call history is not available in this workspace yet, but the dialer can still save lead progress.',
      })
    }
    return NextResponse.json({ error: 'Unable to load call history right now.' }, { status: 500 })
  }

  return NextResponse.json({
    calls: data ?? [],
    total: count ?? 0,
    page,
    limit,
  })
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const outcome = body.call_outcome as string
  const status = body.call_status as string
  const temperature = (body.lead_temperature || 'cold') as string

  if (!body.lead_id || !body.phone_number || !body.lead_name) {
    return NextResponse.json({ error: 'lead_id, phone_number, and lead_name are required' }, { status: 400 })
  }
  if (outcome && !CRM_CALL_OUTCOMES.includes(outcome as never)) {
    return NextResponse.json({ error: 'Invalid call outcome' }, { status: 400 })
  }
  if (status && !CRM_CALL_STATUSES.includes(status as never)) {
    return NextResponse.json({ error: 'Invalid call status' }, { status: 400 })
  }
  if (temperature && !CRM_LEAD_TEMPERATURES.includes(temperature as never)) {
    return NextResponse.json({ error: 'Invalid lead temperature' }, { status: 400 })
  }

  const startedAt = body.call_started_at || new Date().toISOString()
  const endedAt = body.call_ended_at || null
  const durationSeconds = typeof body.duration_seconds === 'number'
    ? body.duration_seconds
    : startedAt && endedAt
      ? Math.max(Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000), 0)
      : null

  let resolvedCallId = body.call_id as string | null | undefined
  let existingMetadata: Record<string, unknown> | null = null
  let existingDialerSessionId: string | null = null
  let existingDialerAttemptId: string | null = null

  if (resolvedCallId) {
    const { data: existingCall } = await admin.supabase
      .from('crm_calls')
      .select('id, metadata, dialer_session_id, dialer_attempt_id')
      .eq('id', resolvedCallId)
      .maybeSingle<{ id: string; metadata: Record<string, unknown> | null; dialer_session_id: string | null; dialer_attempt_id: string | null }>()

    if (existingCall) {
      existingMetadata = existingCall.metadata ?? null
      existingDialerSessionId = existingCall.dialer_session_id ?? null
      existingDialerAttemptId = existingCall.dialer_attempt_id ?? null
    }
  }

  if (!resolvedCallId) {
    const { data: fallbackCall } = await admin.supabase
      .from('crm_calls')
      .select('id, metadata, dialer_session_id, dialer_attempt_id')
      .eq('lead_id', body.lead_id)
      .eq('agent_user_id', admin.userId)
      .eq('session_mode', 'persistent')
      .order('call_started_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; metadata: Record<string, unknown> | null; dialer_session_id: string | null; dialer_attempt_id: string | null }>()

    if (fallbackCall) {
      resolvedCallId = fallbackCall.id
      existingMetadata = fallbackCall.metadata ?? null
      existingDialerSessionId = fallbackCall.dialer_session_id ?? null
      existingDialerAttemptId = fallbackCall.dialer_attempt_id ?? null
    }
  }

  const mergedMetadata = body.metadata
    ? {
        ...(existingMetadata ?? {}),
        ...(body.metadata as Record<string, unknown>),
      }
    : existingMetadata

  const callPayload = {
    lead_id: body.lead_id,
    agent_user_id: admin.userId,
    agent_name: admin.userName,
    lead_name: body.lead_name,
    company_name: body.company_name || null,
    phone_number: body.phone_number,
    call_started_at: startedAt,
    call_ended_at: endedAt,
    duration_seconds: durationSeconds,
    call_status: status || 'completed',
    call_outcome: outcome || 'Follow Up',
    notes: body.notes?.trim() || null,
    next_follow_up_at: body.next_follow_up_at || null,
    lead_temperature: temperature || 'cold',
    strategy_call_booked: Boolean(body.strategy_call_booked),
    converted_to_client: Boolean(body.converted_to_client),
    booked_event_id: body.booked_event_id || null,
    booked_event_source: body.booked_event_source || null,
    source: body.source || null,
    twilio_status: body.twilio_status || null,
    twilio_call_sid: body.twilio_call_sid || null,
    twilio_agent_call_sid: body.twilio_agent_call_sid || null,
    answered_by: body.answered_by || null,
    amd_status: body.amd_status || null,
    from_number: body.from_number || null,
    to_number_e164: body.to_number_e164 || null,
    rep_phone_number: body.rep_phone_number || null,
    call_provider: body.call_provider || null,
    metadata: mergedMetadata,
    updated_at: new Date().toISOString(),
  }

  const callQuery = resolvedCallId
    ? admin.supabase
        .from('crm_calls')
        .update(callPayload)
        .eq('id', resolvedCallId)
        .select()
        .single()
    : admin.supabase
        .from('crm_calls')
        .insert(callPayload)
        .select()
        .single()

  const { data: inserted, error: callError } = await callQuery

  const callLoggingUnavailable = isMissingRelationError(callError, 'crm_calls')
  if (callError && !callLoggingUnavailable) {
    console.error('crm_calls insert failed in POST /api/admin/crm/calls', callError)
    return NextResponse.json({ error: 'Unable to save this call right now.' }, { status: 500 })
  }
  if (callLoggingUnavailable) {
    console.error('crm_calls unavailable in POST /api/admin/crm/calls', callError)
  }

  const dispositionKey = getDispositionKeyForOutcome(outcome || 'Follow Up')
  if (!dispositionKey) {
    return NextResponse.json({ error: `Unsupported disposition outcome: ${outcome}` }, { status: 400 })
  }

  let dispositionResult: Awaited<ReturnType<typeof applyCrmDisposition>> | null = null
  try {
    dispositionResult = await applyCrmDisposition(admin.supabase, {
      leadId: body.lead_id,
      dispositionKey,
      note: body.notes?.trim() || null,
      followUpAt: body.callback_due_at ?? body.next_follow_up_at ?? body.follow_up_at ?? body.appointment_at ?? null,
      callId: inserted?.id ?? null,
      leadTemperature: (temperature || 'cold') as 'cold' | 'warm' | 'hot',
      strategyCallBooked: Boolean(body.strategy_call_booked),
      convertedToClient: Boolean(body.converted_to_client),
      actorUserId: admin.userId,
      actorName: admin.userName,
      createFollowUpTask: Boolean(body.callback_due_at ?? body.next_follow_up_at ?? body.follow_up_at),
    })
  } catch (error) {
    console.error('shared disposition failed after call log attempt', error)
    return NextResponse.json({ error: 'Call outcome could not be saved to the lead.' }, { status: 500 })
  }

  const dialerSessionId =
    (inserted as { dialer_session_id?: string | null } | null)?.dialer_session_id
    ?? existingDialerSessionId
    ?? null
  const dialerAttemptId =
    (inserted as { dialer_attempt_id?: string | null } | null)?.dialer_attempt_id
    ?? existingDialerAttemptId
    ?? null

  if (dialerAttemptId) {
    await admin.supabase
      .from('crm_dialer_attempts')
      .update({
        attempt_status: 'completed',
        resolution_type: 'manual_disposition',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', dialerAttemptId)
  }

  if (dialerSessionId) {
    // Explicitly clear waiting_for_disposition before syncing so that
    // syncDialerSessionState does not re-preserve it from the DB value.
    // This is the only authorized path for clearing the manual-disposition block.
    await admin.supabase
      .from('crm_dialer_sessions')
      .update({ waiting_for_disposition: false, updated_at: new Date().toISOString() })
      .eq('id', dialerSessionId)
    await syncDialerSessionState(admin.supabase, dialerSessionId)
  }

  if (callLoggingUnavailable) {
    return NextResponse.json({
      call: inserted ?? null,
      lead: dispositionResult?.lead ?? null,
      degraded: true,
      message: 'Call outcome was saved to the lead, but detailed call logging is still being set up.',
    }, { status: 202 })
  }

  if ((dispositionResult?.warnings?.length ?? 0) > 0) {
    return NextResponse.json({
      call: inserted,
      lead: dispositionResult?.lead ?? null,
      task: dispositionResult?.task ?? null,
      degraded: true,
      warnings: dispositionResult?.warnings ?? [],
      message: 'Call outcome was saved to the lead, but some CRM workflow tracking tables are not available yet.',
    }, { status: 202 })
  }

  return NextResponse.json({
    call: inserted,
    lead: dispositionResult?.lead ?? null,
    task: dispositionResult?.task ?? null,
  }, { status: 201 })
}
