import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getLeadCompliance } from '@/lib/crm-call-compliance'
import { getConfiguredTwilioVoiceNumber, getLeadDialerPriority, mapTwilioStatusToAttemptStatus } from '@/lib/crm-dialer'
import { createDialerAttempt, getNextQueueSlot, syncDialerSessionState } from '@/lib/crm-dialer-attempts'

type SessionRow = {
  id: string
  agent_user_id: string
  rep_phone_number: string
  session_status: string
  rep_state?: string | null
  rep_session_mode?: string | null
  conference_name: string
  current_lead_id: string | null
  current_crm_call_id: string | null
  target_parallel_lines?: number | null
  waiting_for_disposition?: boolean | null
  active_attempt_count?: number | null
  twilio_agent_call_sid?: string | null
}

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email, phone')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    supabase,
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
    userPhone: profile.phone || null,
  }
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function loadActiveSession(supabase: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data } = await supabase
    .from('crm_dialer_sessions')
    .select('*')
    .eq('agent_user_id', userId)
    .in('session_status', ['ready', 'connecting', 'waiting', 'in_call'])
    .order('created_at', { ascending: false })
    .maybeSingle<SessionRow>()

  return data ?? null
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lead_id, auto_advance } = await req.json().catch(() => ({})) as {
    lead_id?: string
    auto_advance?: boolean
  }

  if (!lead_id) {
    return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })
  }

  const activeSession = await loadActiveSession(admin.supabase, admin.userId)
  if (!activeSession) {
    return NextResponse.json({
      error: 'Click Ready first. The rep session must be live before you can dial leads.',
      action_label: 'Start Ready Session',
      action: 'ready_required',
    }, { status: 409 })
  }

  if (activeSession.session_status === 'connecting' || activeSession.rep_state === 'connecting') {
    return NextResponse.json({
      error: 'Twilio is still connecting your phone. Answer that call first.',
      action_label: 'Update Admin Phone',
      action_href: '/admin/profile',
    }, { status: 409 })
  }

  if (activeSession.waiting_for_disposition) {
    return NextResponse.json({
      error: 'Finish the live conversation disposition before starting new outbound attempts.',
      call_id: activeSession.current_crm_call_id ?? null,
    }, { status: 409 })
  }

  const maxParallelLines = Math.min(Math.max(activeSession.target_parallel_lines ?? 1, 1), 5)
  const activeAttemptCount = Math.max(activeSession.active_attempt_count ?? 0, 0)
  if (activeAttemptCount >= maxParallelLines) {
    return NextResponse.json({
      error: `All ${maxParallelLines} dialer lines are already in use.`,
    }, { status: 409 })
  }

  const { data: lead, error } = await admin.supabase
    .from('crm_leads')
    .select('*')
    .eq('id', lead_id)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  if (lead.do_not_call) {
    return NextResponse.json({ error: 'Lead is on DNC' }, { status: 400 })
  }

  const compliance = await getLeadCompliance(lead)

  const needsPersist =
    lead.phone_e164 !== compliance.phone_e164 ||
    (lead.likely_timezone ?? null) !== (compliance.likely_timezone ?? null) ||
    (lead.timezone_confidence ?? 'unknown') !== compliance.timezone_confidence ||
    (lead.timezone_source ?? null) !== (compliance.timezone_source ?? null)

  if (needsPersist) {
    await admin.supabase
      .from('crm_leads')
      .update({
        phone_e164: compliance.phone_e164,
        likely_timezone: compliance.likely_timezone,
        timezone_confidence: compliance.timezone_confidence,
        timezone_source: compliance.timezone_source,
        last_timezone_checked_at: compliance.last_timezone_checked_at,
      })
      .eq('id', lead_id)
  }

  if (compliance.call_window_status !== 'callable_now') {
    await admin.supabase.from('crm_call_compliance_logs').insert({
      lead_id,
      original_phone: lead.phone,
      normalized_phone: compliance.diagnostics.normalized_phone,
      phone_e164: compliance.phone_e164,
      likely_timezone: compliance.likely_timezone,
      local_time_at_recipient: compliance.recipient_local_time,
      rule_applied: compliance.call_window_rule_applied,
      blocked_reason: compliance.blocked_reason ?? 'unknown_timezone',
      parse_result: compliance.diagnostics.parse_result,
      libphonenumber_result: compliance.diagnostics.libphonenumber_result,
      fallback_result: compliance.diagnostics.fallback_result,
      final_reason: compliance.diagnostics.final_reason,
      timezone_source: compliance.timezone_source,
    })

    return NextResponse.json({
      allowed: false,
      ...compliance,
      error: compliance.call_window_message,
    }, { status: 409 })
  }

  if (!compliance.phone_e164) {
    return NextResponse.json({ error: 'Lead needs a valid phone number before dialing.' }, { status: 400 })
  }

  const { data: existingLeadCall } = await admin.supabase
    .from('crm_calls')
    .select('id')
    .eq('lead_id', lead_id)
    .in('twilio_status', ['queued', 'initiated', 'ringing', 'in-progress'])
    .maybeSingle()

  if (existingLeadCall) {
    return NextResponse.json({ error: 'There is already an active Twilio call for this lead.' }, { status: 409 })
  }

  const { data: settings } = await admin.supabase
    .from('voice_agent_settings')
    .select('twilio_caller_id')
    .eq('id', 'default')
    .maybeSingle()

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const callerId = getConfiguredTwilioVoiceNumber(settings)

  if (!accountSid || !authToken || !callerId) {
    return NextResponse.json({
      error: 'Twilio outbound calling is not configured. Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.',
    }, { status: 503 })
  }

  const startedAt = new Date().toISOString()
  const { data: createdCall, error: createError } = await admin.supabase
    .from('crm_calls')
    .insert({
      lead_id,
      agent_user_id: admin.userId,
      agent_name: admin.userName,
      lead_name: `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim(),
      company_name: lead.business_name || null,
      phone_number: lead.phone,
      call_started_at: startedAt,
      call_status: 'attempted',
      call_outcome: 'Follow Up',
      lead_temperature: lead.lead_temperature || 'cold',
      source: lead.source || null,
      call_provider: 'twilio',
      twilio_status: 'queued',
      lead_leg_status: 'queued',
      rep_phone_number: activeSession.rep_phone_number,
      from_number: callerId,
      to_number_e164: compliance.phone_e164,
      dialer_session_id: activeSession.id,
      session_mode: 'persistent',
      conference_name: activeSession.conference_name,
      queue_slot: null,
      metadata: {
        auto_advance: Boolean(auto_advance),
        dialer_source: 'crm_dialer',
        session_status: activeSession.session_status,
      },
    })
    .select('*')
    .single()

  if (createError || !createdCall) {
    return NextResponse.json({ error: createError?.message ?? 'Failed to create CRM call record' }, { status: 500 })
  }

  const origin = req.nextUrl.origin
  const leadJoinUrl = `${origin}/api/webhooks/twilio/voice/crm-lead-session?sessionId=${activeSession.id}&crmCallId=${createdCall.id}`
  const statusUrl = `${origin}/api/webhooks/twilio/voice/crm-status?crmCallId=${createdCall.id}&sessionId=${activeSession.id}&leg=lead`
  const amdUrl = `${origin}/api/webhooks/twilio/voice/crm-amd?crmCallId=${createdCall.id}`
  const queueSlot = await getNextQueueSlot(admin.supabase, activeSession.id, maxParallelLines)
  const attempt = await createDialerAttempt(admin.supabase, {
    dialerSessionId: activeSession.id,
    crmCallId: createdCall.id,
    leadId: lead_id,
    agentUserId: admin.userId,
    queueSlot,
    priorityScore: getLeadDialerPriority({
      call_window_status: compliance.call_window_status,
      callback_due_at: lead.callback_due_at,
      follow_up_at: lead.follow_up_at,
      lead_temperature: lead.lead_temperature,
      last_call_outcome: lead.last_call_outcome,
      last_call_at: lead.last_call_at,
    }),
  })

  try {
    const client = twilio(accountSid, authToken)
    const outboundCall = await client.calls.create({
      to: compliance.phone_e164,
      from: callerId,
      url: leadJoinUrl,
      method: 'POST',
      statusCallback: statusUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      machineDetection: 'Enable',
      asyncAmd: true,
      asyncAmdStatusCallback: amdUrl,
      asyncAmdStatusCallbackMethod: 'POST',
      timeout: 25,
    } as unknown as Parameters<typeof client.calls.create>[0])

    await admin.supabase
      .from('crm_calls')
      .update({
        dialer_attempt_id: attempt.id,
        queue_slot: queueSlot,
        twilio_call_sid: outboundCall.sid,
        twilio_status: outboundCall.status ?? 'queued',
        metadata: {
          ...(createdCall.metadata as Record<string, unknown> | null ?? {}),
          dialer_attempt_id: attempt.id,
          queue_slot: queueSlot,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', createdCall.id)

    await admin.supabase
      .from('crm_dialer_attempts')
      .update({
        twilio_call_sid: outboundCall.sid,
        attempt_status: mapTwilioStatusToAttemptStatus(outboundCall.status ?? 'queued'),
        last_twilio_status: outboundCall.status ?? 'queued',
        updated_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)

    const synced = await syncDialerSessionState(admin.supabase, activeSession.id)

    await admin.supabase.from('crm_activities').insert({
      lead_id,
      type: 'call',
      body: `Lead leg started inside persistent Twilio rep session from ${callerId} to ${compliance.phone_e164}`,
      metadata: {
        crm_call_id: createdCall.id,
        dialer_session_id: activeSession.id,
        twilio_call_sid: outboundCall.sid,
        twilio_status: outboundCall.status ?? 'queued',
        rep_phone_number: activeSession.rep_phone_number,
        to_number_e164: compliance.phone_e164,
        session_mode: 'persistent',
        dialer_attempt_id: attempt.id,
        queue_slot: queueSlot,
      },
      created_by: admin.userName,
    })

    return NextResponse.json({
      allowed: true,
      ...compliance,
      call_id: createdCall.id,
      attempt_id: attempt.id,
      queue_slot: queueSlot,
      session_id: activeSession.id,
      active_attempt_count: synced?.active_attempt_count ?? activeAttemptCount + 1,
      target_parallel_lines: maxParallelLines,
      twilio_status: outboundCall.status ?? 'queued',
      rep_phone_number: activeSession.rep_phone_number,
      from_number: callerId,
      session_status: synced?.session_status ?? activeSession.session_status,
      session: synced ?? null,
      attempts: synced?.attempts ?? [],
      message: maxParallelLines > 1
        ? `Lead attempt launched on line ${queueSlot}.`
        : 'Dialing the lead into your live Twilio rep session.',
    })
  } catch (dialError) {
    await admin.supabase
      .from('crm_calls')
      .update({
        twilio_status: 'failed',
        call_ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...(createdCall.metadata as Record<string, unknown> | null ?? {}),
          dial_error: dialError instanceof Error ? dialError.message : 'twilio_dial_failed',
        },
      })
      .eq('id', createdCall.id)

    await admin.supabase
      .from('crm_dialer_attempts')
      .update({
        attempt_status: 'failed',
        resolution_type: 'system_cleanup',
        last_twilio_status: 'failed',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)

    await syncDialerSessionState(admin.supabase, activeSession.id)

    return NextResponse.json({
      error: dialError instanceof Error ? dialError.message : 'Failed to initiate Twilio lead call',
    }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { call_id } = await req.json().catch(() => ({})) as { call_id?: string }
  if (!call_id) {
    return NextResponse.json({ error: 'call_id is required' }, { status: 400 })
  }

  const { data: call } = await admin.supabase
    .from('crm_calls')
    .select('id, agent_user_id, twilio_call_sid, dialer_session_id')
    .eq('id', call_id)
    .maybeSingle<{ id: string; agent_user_id: string; twilio_call_sid: string | null; dialer_session_id: string | null }>()

  if (!call || call.agent_user_id !== admin.userId) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  if (!call.twilio_call_sid) {
    if (call.dialer_session_id) {
      await syncDialerSessionState(admin.supabase, call.dialer_session_id)
    }

    return NextResponse.json({
      ok: true,
      already_ended: true,
      message: 'Lead leg was already ended.',
    })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return NextResponse.json({ ok: true, message: 'No active lead leg to disconnect.' })
  }

  const client = twilio(accountSid, authToken)
  await client.calls(call.twilio_call_sid).update({ status: 'completed' }).catch(() => {})

  if (call.dialer_session_id) {
    await syncDialerSessionState(admin.supabase, call.dialer_session_id)
  }

  return NextResponse.json({ ok: true, message: 'Lead leg disconnected. Rep session is still live.' })
}
