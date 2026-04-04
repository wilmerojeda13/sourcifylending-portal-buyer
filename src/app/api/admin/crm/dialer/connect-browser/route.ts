import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null
  return { supabase, userId: user.id }
}

/**
 * POST /api/admin/crm/dialer/connect-browser
 *
 * Called by the browser after device.register() completes.
 * Places a Twilio outbound call to `client:rep-{userId}` so the browser
 * Device receives an incoming call, accepts it, and joins the conference.
 *
 * This is the server-side trigger for the browser-mode agent leg:
 *   server → Twilio → crm-browser-agent webhook → conference TwiML → browser Device
 */
export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await req.json().catch(() => ({}))
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  const { data: session } = await admin.supabase
    .from('crm_dialer_sessions')
    .select('id, conference_name, session_status')
    .eq('id', sessionId)
    .eq('agent_user_id', admin.userId)
    .maybeSingle<{ id: string; conference_name: string; session_status: string }>()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const callerId = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_CALLER_ID

  if (!accountSid || !authToken || !callerId) {
    return NextResponse.json({ error: 'Twilio credentials not configured.' }, { status: 503 })
  }

  const origin = req.nextUrl.origin
  const client = twilio(accountSid, authToken)

  try {
    const call = await client.calls.create({
      to: `client:rep-${admin.userId}`,
      from: callerId,
      url: `${origin}/api/webhooks/twilio/voice/crm-browser-agent?sessionId=${sessionId}`,
      statusCallback: `${origin}/api/webhooks/twilio/voice/crm-status?sessionId=${sessionId}&leg=agent`,
      statusCallbackEvent: ['answered', 'completed'],
    })

    await admin.supabase
      .from('crm_dialer_sessions')
      .update({ twilio_agent_call_sid: call.sid, updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true, call_sid: call.sid })
  } catch (err) {
    console.error('[connect-browser] Twilio call error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to connect browser audio.',
    }, { status: 500 })
  }
}
