import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServiceClient } from '@/lib/supabase/server'

function buildErrorTwiml(message: string) {
  const response = new twilio.twiml.VoiceResponse()
  response.say({ voice: 'alice' }, message)
  response.hangup()
  return response.toString()
}

export async function POST(req: NextRequest) {
  try {
    // Twilio sends params as form data in the POST body
    const formData = await req.formData()
    const sessionId = formData.get('sessionId') as string
    
    if (!sessionId) {
      console.error('[CRM Agent Session] Missing sessionId in form data')
      return new NextResponse(buildErrorTwiml('Missing dialer session ID.'), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    console.log('[CRM Agent Session] Processing sessionId:', sessionId)

    const supabase = await createServiceClient()
    const { data: session, error: sessionError } = await supabase
      .from('crm_dialer_sessions')
      .select('id, conference_name')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; conference_name: string }>()

    console.log('[CRM Agent Session] session lookup result:', { found: Boolean(session), error: sessionError })

    if (sessionError) {
      console.error('[CRM Agent Session] database error:', sessionError)
      throw new Error(`Database error: ${sessionError.message}`)
    }

    if (!session?.conference_name) {
      console.error('[CRM Agent Session] Session not found or missing conference_name for sessionId:', sessionId, 'session:', session)
      return new NextResponse(buildErrorTwiml('Dialer session not found or invalid.'), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    console.log('[CRM Agent Session] Found session with conference:', session.conference_name)

    const origin = req.nextUrl.origin
    const conferenceStatus = `${origin}/api/webhooks/twilio/voice/crm-conference-status?sessionId=${sessionId}&participant=agent`
    const waitAudioUrl = `${origin}/api/webhooks/twilio/voice/crm-wait-audio`

    const response = new twilio.twiml.VoiceResponse()

    const dial = response.dial()
    dial.conference({
      startConferenceOnEnter: true,
      endConferenceOnExit: true,
      beep: 'false' as any,
      waitUrl: waitAudioUrl,
      waitMethod: 'GET',
      participantLabel: `agent:${session.id}`,
      statusCallback: conferenceStatus,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['start', 'end', 'join', 'leave'],
    }, session.conference_name)

    console.log('[CRM Agent Session] Generated TwiML for conference:', session.conference_name)

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[CRM Agent Session] Unexpected error:', error)
    return new NextResponse(buildErrorTwiml('Internal server error.'), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
