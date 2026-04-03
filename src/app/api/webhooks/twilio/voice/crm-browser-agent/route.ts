import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServiceClient } from '@/lib/supabase/server'

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

function buildErrorTwiml(message: string) {
  const response = new twilio.twiml.VoiceResponse()
  response.say({ voice: 'alice' }, message)
  response.hangup()
  return response.toString()
}

// Called by Twilio TwiML App when browser Device.connect() fires.
// Params passed via device.connect({ params: { sessionId } }) arrive as form fields.
export async function POST(req: NextRequest) {
  const body = await readBody(req)
  const sessionId = body.sessionId ?? req.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    return new NextResponse(buildErrorTwiml('Missing dialer session.'), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const supabase = await createServiceClient()
  const { data: session } = await supabase
    .from('crm_dialer_sessions')
    .select('id, conference_name')
    .eq('id', sessionId)
    .maybeSingle<{ id: string; conference_name: string }>()

  if (!session?.conference_name) {
    return new NextResponse(buildErrorTwiml('Dialer session not found.'), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const origin = req.nextUrl.origin
  const conferenceStatus = `${origin}/api/webhooks/twilio/voice/crm-conference-status?sessionId=${sessionId}&participant=agent`
  const waitAudioUrl = `${origin}/api/webhooks/twilio/voice/crm-wait-audio`

  const response = new twilio.twiml.VoiceResponse()
  const dial = response.dial()
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: true,
    beep: false,
    waitUrl: waitAudioUrl,
    waitMethod: 'GET',
    participantLabel: `agent:${session.id}`,
    statusCallback: conferenceStatus,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['start', 'end', 'join', 'leave'],
  }, session.conference_name)

  return new NextResponse(response.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
