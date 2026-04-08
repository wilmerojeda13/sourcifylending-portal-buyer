import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

function buildWaitTwiml(req: NextRequest) {
  const origin = req.nextUrl.origin
  const loopUrl = req.nextUrl.href
  const ringbackUrl = `${origin}/api/webhooks/twilio/voice/crm-ringback`
  const response = new twilio.twiml.VoiceResponse()
  response.play(ringbackUrl)
  response.redirect({ method: 'GET' }, loopUrl)
  return response.toString()
}

export async function GET(req: NextRequest) {
  return new NextResponse(buildWaitTwiml(req), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
