import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildDialerConferenceName } from '@/lib/crm-dialer'
import { loadSessionAttempts, syncDialerSessionState } from '@/lib/crm-dialer-attempts'
import { normalizePhone } from '@/modules/voice-agent/utils/phone'

type SessionRow = {
  id: string
  agent_user_id: string
  agent_name: string
  rep_phone_number: string
  session_status: string
  rep_state?: string | null
  conference_name: string
  twilio_agent_call_sid: string | null
  twilio_conference_sid: string | null
  current_lead_id: string | null
  current_crm_call_id: string | null
  last_error: string | null
  started_at: string | null
  answered_at: string | null
  ended_at: string | null
  target_parallel_lines?: number | null
  rep_session_mode?: string | null
  metadata: Record<string, unknown> | null
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
    email: profile.email || null,
    userPhone: profile.phone || null,
  }
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


export async function GET() {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeSession = await loadActiveSession(admin.supabase, admin.userId)
  const normalizedPhone = admin.userPhone ? normalizePhone(admin.userPhone) : { valid: false, e164: null }

  const attempts = activeSession ? await loadSessionAttempts(admin.supabase, activeSession.id) : []

  return NextResponse.json({
    session: activeSession,
    attempts,
    rep_phone_number: normalizedPhone.valid ? normalizedPhone.e164 : null,
    has_rep_phone: normalizedPhone.valid,
    action_href: normalizedPhone.valid ? null : '/admin/profile',
  })
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { mode = 'browser', target_parallel_lines = 3 } = await req.json().catch(() => ({}))

  const existingSession = await loadActiveSession(admin.supabase, admin.userId)
  if (existingSession) {
    // Return existing session + fresh token so browser can reconnect
    const token = mode === 'browser' ? buildAccessToken(admin.userId) : null
    const attempts = await loadSessionAttempts(admin.supabase, existingSession.id)
    return NextResponse.json({
      session: existingSession,
      attempts,
      token,
      message: 'Session already active.',
    })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return NextResponse.json({
      error: 'Twilio is not configured. Required: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
    }, { status: 503 })
  }

  const normalizedProfilePhone = admin.userPhone ? normalizePhone(admin.userPhone) : { valid: false, e164: null }
  
  if (mode === 'phone' && !normalizedProfilePhone.valid) {
    return NextResponse.json({
      error: 'Your profile does not have a valid phone number. Please update your profile to use Phone Leg mode.',
      action_label: 'Update Profile',
      action_href: '/admin/profile',
    }, { status: 400 })
  }

  const token = mode === 'browser' ? buildAccessToken(admin.userId) : null
  if (mode === 'browser' && !token) {
    return NextResponse.json({
      error: 'Browser dialing requires TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_TWIML_APP_SID.',
      action_label: 'Configure Twilio',
    }, { status: 503 })
  }

  const conferenceName = buildDialerConferenceName(admin.userId)
  const startedAt = new Date().toISOString()
  
  const repPhoneNumber = mode === 'phone' ? (normalizedProfilePhone.e164 as string) : 'browser'
  const initialParallelLines = Math.min(Math.max(Number(target_parallel_lines) || 1, 1), 5)

  const { data: session, error: createError } = await admin.supabase
    .from('crm_dialer_sessions')
    .insert({
      agent_user_id: admin.userId,
      agent_name: admin.userName,
      rep_phone_number: repPhoneNumber,
      session_status: 'connecting',
      rep_state: 'connecting',
      conference_name: conferenceName,
      started_at: startedAt,
      target_parallel_lines: initialParallelLines,
      rep_session_mode: initialParallelLines > 1 ? 'parallel' : 'single_line',
      metadata: {
        source: mode === 'browser' ? 'crm_dialer_browser' : 'crm_dialer_phone',
        requested_mode: mode,
      },
    })
    .select('*')
    .single<SessionRow>()

  if (createError || !session) {
    return NextResponse.json({ error: createError?.message ?? 'Failed to create dialer session.' }, { status: 500 })
  }

  // If phone mode, trigger the outbound call to the agent immediately
  if (mode === 'phone') {
    try {
      const client = twilio(accountSid, authToken)
      const origin = req.nextUrl.origin
      const callerId = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_CALLER_ID
      
      if (!callerId) {
        throw new Error('TWILIO_PHONE_NUMBER is not configured for outbound agent leg.')
      }

      const agentCall = await client.calls.create({
        to: repPhoneNumber,
        from: callerId,
        url: `${origin}/api/webhooks/twilio/voice/crm-agent-session?sessionId=${session.id}`,
        statusCallback: `${origin}/api/webhooks/twilio/voice/crm-status?sessionId=${session.id}&leg=agent`,
        statusCallbackEvent: ['answered', 'completed'],
      })

      await admin.supabase
        .from('crm_dialer_sessions')
        .update({ twilio_agent_call_sid: agentCall.sid })
        .eq('id', session.id)

    } catch (dialError) {
      await admin.supabase
        .from('crm_dialer_sessions')
        .update({
          session_status: 'failed',
          last_error: dialError instanceof Error ? dialError.message : 'agent_dial_failed',
        })
        .eq('id', session.id)

      return NextResponse.json({
        error: `Failed to call your phone: ${dialError instanceof Error ? dialError.message : 'Unknown error'}`,
      }, { status: 500 })
    }
  }

  return NextResponse.json({
    session,
    attempts: [],
    token,
    message: mode === 'browser' 
      ? 'Browser audio ready. Connect to go live.'
      : `Calling your phone at ${repPhoneNumber}... Answer to start.`,
  })
}

function buildAccessToken(userId: string): string | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const apiKeySid = process.env.TWILIO_API_KEY_SID
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) return null

  const { AccessToken } = twilio.jwt
  const { VoiceGrant } = AccessToken

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: `rep-${userId}`,
    ttl: 3600,
  })
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: false }))
  return token.toJwt()
}

export async function DELETE() {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeSession = await loadActiveSession(admin.supabase, admin.userId)
  if (!activeSession) {
    return NextResponse.json({ ok: true, message: 'No active rep session.' })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (accountSid && authToken) {
    const client = twilio(accountSid, authToken)

    if (activeSession.current_crm_call_id) {
      const { data: currentCall } = await admin.supabase
        .from('crm_calls')
        .select('twilio_call_sid')
        .eq('id', activeSession.current_crm_call_id)
        .maybeSingle<{ twilio_call_sid: string | null }>()

      if (currentCall?.twilio_call_sid) {
        await client.calls(currentCall.twilio_call_sid).update({ status: 'completed' }).catch(() => {})
      }
    }

    if (activeSession.twilio_agent_call_sid) {
      await client.calls(activeSession.twilio_agent_call_sid).update({ status: 'completed' }).catch(() => {})
    }
  }

  await admin.supabase
    .from('crm_dialer_sessions')
    .update({
      session_status: 'not_ready',
      rep_state: 'not_ready',
      ended_at: new Date().toISOString(),
      current_lead_id: null,
      current_crm_call_id: null,
      active_attempt_count: 0,
      waiting_for_disposition: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activeSession.id)

  return NextResponse.json({ ok: true, message: 'Persistent rep session ended.' })
}

export async function PATCH(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeSession = await loadActiveSession(admin.supabase, admin.userId)
  if (!activeSession) {
    return NextResponse.json({ error: 'No active rep session.' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({})) as { target_parallel_lines?: number }
  const lines = Math.min(Math.max(Number(body.target_parallel_lines ?? 1) || 1, 1), 5)

  await admin.supabase
    .from('crm_dialer_sessions')
    .update({
      target_parallel_lines: lines,
      rep_session_mode: lines > 1 ? 'parallel' : 'single_line',
      settings: {
        ...(activeSession.metadata ?? {}),
        target_parallel_lines: lines,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', activeSession.id)

  const synced = await syncDialerSessionState(admin.supabase, activeSession.id)
  return NextResponse.json({
    session: synced,
    attempts: synced?.attempts ?? [],
    message: `Parallel lines set to ${lines}.`,
  })
}
