import { NextResponse } from 'next/server'
import twilio from 'twilio'

function buildSilentTwiml() {
  const response = new twilio.twiml.VoiceResponse()
  response.pause({ length: 60 })
  return response.toString()
}

export async function GET() {
  return new NextResponse(buildSilentTwiml(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST() {
  return GET()
}
