import { NextResponse } from 'next/server'
import twilio from 'twilio'

// While the lead leg is ringing, the rep is alone in the conference with waitUrl.
// Silence made it seem like browser audio was dead; loop quiet hold audio so the line feels live.
// (True PSTN ring-back is not forwarded into the conference until the callee answers.)
function buildWaitTwiml() {
  const response = new twilio.twiml.VoiceResponse()
  response.play(
    { loop: 0 },
    'https://s3.amazonaws.com/com.twilio.music.classical/Haydn_Symph_104_2.mp3',
  )
  return response.toString()
}

export async function GET() {
  return new NextResponse(buildWaitTwiml(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST() {
  return GET()
}
