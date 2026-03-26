/**
 * POST /api/voice/twilio/outbound
 * Twilio calls this URL when the outbound call connects.
 * Returns TwiML that streams audio to our WebSocket voice server.
 * Falls back to <Say> greeting if voice server is not configured.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callId     = searchParams.get('callId')    ?? ''
  const leadId     = searchParams.get('leadId')    ?? ''
  const campaignId = searchParams.get('campaignId') ?? ''
  const isTest     = searchParams.get('isTest')    === 'true'

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  if (!accountSid) {
    return new NextResponse(buildErrorTwiml('Service not configured'), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Fetch settings
  const supabase = await createServiceClient()
  const { data: settings } = await supabase
    .from('voice_agent_settings')
    .select('voice_server_ws_url, recording_disclosure, analyzer_url')
    .eq('id', 'default')
    .single()

  const wsUrlRaw = settings?.voice_server_ws_url ?? process.env.VOICE_SERVER_WS_URL ?? ''
  const recordingDisclosure = settings?.recording_disclosure ?? false

  // Mark call as in-progress
  if (callId) {
    await supabase
      .from('voice_calls')
      .update({ status: 'in-progress', started_at: new Date().toISOString() })
      .eq('id', callId)

    await supabase.from('voice_call_events').insert({
      call_id:    callId,
      event_type: 'answered',
      event_data: { lead_id: leadId, campaign_id: campaignId, is_test: isTest },
      timestamp:  new Date().toISOString(),
    })
  }

  // ── Fallback mode: voice server not configured ────────────────────────────
  // Use Twilio <Say> so the call is audible and you can verify end-to-end flow.
  const voiceServerReady = wsUrlRaw && !wsUrlRaw.includes('localhost')
  if (!voiceServerReady) {
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">
    Hi, this is Sarah from Sourcify Lending. ${isTest
      ? 'This is a test call to verify your voice system is working correctly. Your call setup is complete. Goodbye!'
      : 'We help business owners build credit and access funding. Please visit sourcify lending dot com to learn more. Have a great day!'
    }
  </Say>
  <Hangup/>
</Response>`

    // Log that we used fallback
    if (callId) {
      await supabase.from('voice_call_events').insert({
        call_id:    callId,
        event_type: 'fallback_say_used',
        event_data: { reason: 'voice_server_not_configured', ws_url: wsUrlRaw || 'not set' },
        timestamp:  new Date().toISOString(),
      }).catch(() => {})
    }

    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // ── Normal mode: stream to voice server ──────────────────────────────────
  const streamUrl = `${wsUrlRaw}/stream`

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${recordingDisclosure ? '<Say voice="Polly.Joanna">This call may be recorded for quality and training purposes.</Say>' : ''}
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callId" value="${callId}"/>
      <Parameter name="leadId" value="${leadId}"/>
      <Parameter name="campaignId" value="${campaignId}"/>
      <Parameter name="isTest" value="${isTest}"/>
    </Stream>
  </Connect>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Also handle GET (some Twilio configs use GET)
export async function GET(req: NextRequest) {
  return POST(req)
}

function buildErrorTwiml(msg: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${msg}</Say>
  <Hangup/>
</Response>`
}
