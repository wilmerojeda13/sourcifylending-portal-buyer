import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import twilio from 'twilio'

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

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { callId, digit } = await req.json().catch(() => ({})) as { callId?: string, digit?: string }

  if (!callId || !digit || !/^[0-9*#]$/.test(digit)) {
    return NextResponse.json({ error: 'Invalid call ID or DTMF digit' }, { status: 400 })
  }

  // Get call record to verify ownership and get Twilio SID
  const { data: call } = await admin.supabase
    .from('crm_calls')
    .select('twilio_call_sid, agent_user_id, twilio_status')
    .eq('id', callId)
    .single()

  if (!call || call.agent_user_id !== admin.userId) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  if (!call.twilio_call_sid) {
    return NextResponse.json({ error: 'No active Twilio call' }, { status: 400 })
  }

  // Only allow DTMF on connected/active calls
  if (!['in-progress', 'answered', 'ringing'].includes(call.twilio_status ?? '')) {
    return NextResponse.json({ error: 'Call not active for DTMF' }, { status: 400 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 503 })
  }

  try {
    const client = twilio(accountSid, authToken)
    
    // Send DTMF digit using Twilio's correct method
    await client.calls(call.twilio_call_sid)
      .update({
        url: `data:text/xml;charset=utf-8,<Response><Play digits="${digit}"/></Response>`,
        method: 'POST'
      })

    console.log(`[DTMF] Sent digit '${digit}' to call ${callId} (${call.twilio_call_sid})`)

    return NextResponse.json({ 
      success: true, 
      digit,
      callId,
      message: `DTMF digit ${digit} sent successfully`
    })

  } catch (error) {
    console.error('[DTMF] Error sending digit:', error)
    return NextResponse.json(
      { error: 'Failed to send DTMF digit' },
      { status: 500 }
    )
  }
}
