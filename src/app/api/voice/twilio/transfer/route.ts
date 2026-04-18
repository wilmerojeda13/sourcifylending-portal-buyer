/**
 * POST /api/voice/twilio/transfer
 * TwiML response for live call transfer to the operator.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callId = searchParams.get('callId') ?? ''

  const supabase     = await createServiceClient()
  const { data: settings } = await supabase
    .from('voice_agent_settings')
    .select('transfer_number')
    .eq('id', 'default')
    .single()

  const transferNumber = settings?.transfer_number || process.env.TRANSFER_NUMBER || ''

  if (!transferNumber) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Transfer is not configured. Please try again later.</Say><Hangup/></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }

  // Log transfer event
  if (callId) {
    await supabase.from('voice_call_events').insert({
      call_id:    callId,
      event_type: 'transferred_live',
      event_data: { transfer_number: transferNumber },
      timestamp:  new Date().toISOString(),
    })
    await supabase.from('voice_calls').update({
      disposition: 'transferred_live',
    }).eq('id', callId)
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Please hold while I connect you with our advisor.</Say>
  <Dial timeout="30" record="record-from-answer-dual">
    <Number>${transferNumber}</Number>
  </Dial>
</Response>`

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
