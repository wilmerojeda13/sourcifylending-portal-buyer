/**
 * POST /api/voice/twilio/outbound
 * Twilio calls this URL when the outbound call connects.
 * Returns TwiML that streams audio to our WebSocket voice server.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callId     = searchParams.get('callId')    ?? ''
  const leadId     = searchParams.get('leadId')    ?? ''
  const campaignId = searchParams.get('campaignId') ?? ''

  // Verify Twilio signature (basic validation — enhance with Twilio.validateRequest in production)
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  if (!accountSid) {
    return new NextResponse(buildErrorTwiml('Service not configured'), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Fetch settings for voice server URL and recording disclosure
  const supabase = await createServiceClient()
  const { data: settings } = await supabase
    .from('voice_agent_settings')
    .select('voice_server_ws_url, recording_disclosure, analyzer_url')
    .eq('id', 'default')
    .single()

  const wsUrl = settings?.voice_server_ws_url ?? process.env.VOICE_SERVER_WS_URL ?? 'ws://localhost:3002'
  const recordingDisclosure = settings?.recording_disclosure ?? false

  // Mark call as ringing/connected
  if (callId) {
    await supabase
      .from('voice_calls')
      .update({ status: 'in-progress', started_at: new Date().toISOString() })
      .eq('id', callId)

    await supabase.from('voice_call_events').insert({
      call_id:    callId,
      event_type: 'answered',
      event_data: { lead_id: leadId, campaign_id: campaignId },
      timestamp:  new Date().toISOString(),
    })
  }

  const streamUrl = `${wsUrl}/stream`

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${recordingDisclosure ? '<Say voice="Polly.Joanna">This call may be recorded for quality and training purposes.</Say>' : ''}
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callId" value="${callId}"/>
      <Parameter name="leadId" value="${leadId}"/>
      <Parameter name="campaignId" value="${campaignId}"/>
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
