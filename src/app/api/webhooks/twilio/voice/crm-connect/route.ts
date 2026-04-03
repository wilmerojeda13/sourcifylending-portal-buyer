import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServiceClient } from '@/lib/supabase/server'
import { getConfiguredTwilioVoiceNumber } from '@/lib/crm-dialer'

function buildErrorTwiml(message: string) {
  const response = new twilio.twiml.VoiceResponse()
  response.say({ voice: 'alice' }, message)
  response.hangup()
  return response.toString()
}

export async function POST(req: NextRequest) {
  const crmCallId = req.nextUrl.searchParams.get('crmCallId')
  if (!crmCallId) {
    return new NextResponse(buildErrorTwiml('Missing CRM call ID.'), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const supabase = await createServiceClient()
  const { data: crmCall } = await supabase
    .from('crm_calls')
    .select('id, from_number, to_number_e164')
    .eq('id', crmCallId)
    .maybeSingle()

  if (!crmCall?.to_number_e164) {
    return new NextResponse(buildErrorTwiml('Lead phone number is unavailable.'), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const { data: settings } = await supabase
    .from('voice_agent_settings')
    .select('twilio_caller_id')
    .eq('id', 'default')
    .maybeSingle()

  const callerId = crmCall.from_number || getConfiguredTwilioVoiceNumber(settings)
  if (!callerId) {
    return new NextResponse(buildErrorTwiml('Twilio caller ID is not configured.'), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const origin = req.nextUrl.origin
  const statusCallback = `${origin}/api/webhooks/twilio/voice/crm-status?crmCallId=${crmCallId}&leg=lead`
  const amdCallback = `${origin}/api/webhooks/twilio/voice/crm-amd?crmCallId=${crmCallId}`

  const response = new twilio.twiml.VoiceResponse()
  response.say({ voice: 'alice' }, 'Connecting your CRM call now.')

  const dial = response.dial({
    answerOnBridge: true,
    callerId,
  })

  dial.number({
    statusCallback,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    amdStatusCallback: amdCallback,
    amdStatusCallbackMethod: 'POST',
    machineDetection: 'Enable',
    machineDetectionTimeout: 8,
  }, crmCall.to_number_e164)

  return new NextResponse(response.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
