import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServiceClient } from '@/lib/supabase/server'

async function readBody(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text()
    console.log('[crm-browser-agent] raw request body:', text)
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

function buildXmlResponse(xml: string) {
  return new NextResponse(xml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Called by Twilio TwiML App when browser Device.connect() fires.
// Params passed via device.connect({ params: { sessionId } }) are sent with the webhook payload.
export async function POST(req: NextRequest) {
  console.log('[crm-browser-agent] === START ===')
  try {
    const body = await readBody(req)
    const sessionIdFromBody = typeof body.sessionId === 'string' ? body.sessionId : null
    const sessionIdFromQuery = req.nextUrl.searchParams.get('sessionId')
    const sessionId = sessionIdFromBody || sessionIdFromQuery
    
    console.log('[crm-browser-agent] query params:', Array.from(req.nextUrl.searchParams.keys()).join(', '))
    console.log('[crm-browser-agent] request body:', body)
    console.log('[crm-browser-agent] sessionId from body:', sessionIdFromBody)
    console.log('[crm-browser-agent] sessionId from query:', sessionIdFromQuery)
    console.log('[crm-browser-agent] resolved sessionId:', sessionId)
    
    if (!sessionId) {
      console.log('[crm-browser-agent] missing sessionId - returning error')
      return buildXmlResponse(buildErrorTwiml('Missing dialer session ID.'))
    }

    console.log('[crm-browser-agent] looking up session in database')
    const supabase = await createServiceClient()
    
    if (!supabase) {
      console.error('[crm-browser-agent] Failed to create Supabase service client')
      throw new Error('Service client initialization failed')
    }
    
    const { data: session, error: sessionError } = await supabase
      .from('crm_dialer_sessions')
      .select('id, conference_name')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; conference_name: string }>()

    console.log('[crm-browser-agent] session lookup result:', { found: Boolean(session), error: sessionError })

    if (sessionError) {
      console.error('[crm-browser-agent] database error:', sessionError)
      throw new Error(`Database error: ${sessionError.message}`)
    }

    if (!session) {
      console.log('[crm-browser-agent] session not found in database')
      return buildXmlResponse(buildErrorTwiml('Dialer session not found.'))
    }

    if (!session.conference_name) {
      console.log('[crm-browser-agent] conference_name missing')
      return buildXmlResponse(buildErrorTwiml('Dialer session not found.'))
    }

    console.log('[crm-browser-agent] session found, conference:', session.conference_name)

    // Mark session as waiting so the client-side canDialLead check passes
    console.log('[crm-browser-agent] updating session status to waiting')
    const { error: updateError } = await supabase
      .from('crm_dialer_sessions')
      .update({ session_status: 'waiting', rep_state: 'waiting', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    
    if (updateError) {
      console.error('[crm-browser-agent] update error:', updateError)
      throw new Error(`Failed to update session: ${updateError.message}`)
    }
    console.log('[crm-browser-agent] session status updated successfully')

    const origin = req.nextUrl.origin
    const conferenceStatus = `${origin}/api/webhooks/twilio/voice/crm-conference-status?sessionId=${sessionId}&participant=agent`
    const waitAudioUrl = `${origin}/api/webhooks/twilio/voice/crm-wait-audio`

    const response = new twilio.twiml.VoiceResponse()
    const dial = response.dial()
    
    if (!dial) {
      console.error('[crm-browser-agent] Failed to create dial verb')
      throw new Error('Failed to create dial verb')
    }
    
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

    console.log('[crm-browser-agent] returning success TwiML for conference:', session.conference_name)
    const twimlString = response.toString()
    console.log('[crm-browser-agent] TwiML length:', twimlString.length)
    return buildXmlResponse(twimlString)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[crm-browser-agent] EXCEPTION:', errorMessage)
    console.error('[crm-browser-agent] Stack:', error instanceof Error ? error.stack : 'unknown')
    // Temporarily return specific error for debugging
    return buildXmlResponse(buildErrorTwiml(`TEST ERROR MESSAGE FOR DEBUGGING: ${errorMessage}`))
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
