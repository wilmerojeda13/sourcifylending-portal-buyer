/**
 * POST /api/voice/twilio/status
 * Twilio status callback — updates call record with final status and duration.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { AUTO_SUPPRESS_DISPOSITIONS } from '@/modules/voice-agent/compliance/suppression'

export async function POST(req: NextRequest) {
  let body: Record<string, string> = {}

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text()
    const params = new URLSearchParams(text)
    params.forEach((val, key) => { body[key] = val })
  } else {
    body = await req.json().catch(() => ({}))
  }

  const callSid          = body.CallSid
  const callStatus       = body.CallStatus       // initiated | ringing | in-progress | completed | busy | failed | no-answer | canceled
  const callDuration     = parseInt(body.CallDuration ?? '0') || 0
  const answeredBy       = body.AnsweredBy       // human | machine_start | fax | unknown
  const to               = body.To
  const from             = body.From

  if (!callSid) return NextResponse.json({ ok: true })

  const supabase = await createServiceClient()

  // Find our call record by Twilio SID
  const { data: callRecord } = await supabase
    .from('voice_calls')
    .select('id, lead_id, campaign_id, disposition')
    .eq('twilio_call_sid', callSid)
    .maybeSingle()

  if (!callRecord) return NextResponse.json({ ok: true })

  const updates: Record<string, unknown> = {
    status: callStatus,
  }

  if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'failed' || callStatus === 'no-answer' || callStatus === 'canceled') {
    updates.ended_at         = new Date().toISOString()
    updates.duration_seconds = callDuration

    // Auto-disposition if not already set by voice server
    if (!callRecord.disposition) {
      if (callStatus === 'no-answer')  updates.disposition = 'no_answer'
      if (callStatus === 'busy')       updates.disposition = 'no_answer'
      if (callStatus === 'failed')     updates.disposition = 'bad_number'
    }
  }

  // Handle AMD (answering machine detection)
  if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence') {
    updates.disposition = 'voicemail'
  }

  await supabase.from('voice_calls').update(updates).eq('id', callRecord.id)

  // Log status event
  await supabase.from('voice_call_events').insert({
    call_id:    callRecord.id,
    event_type: `twilio_status_${callStatus}`,
    event_data: { call_status: callStatus, duration: callDuration, answered_by: answeredBy, to, from },
    timestamp:  new Date().toISOString(),
  })

  // Update lead disposition and stats
  if (callRecord.lead_id) {
    const finalDisp = (updates.disposition ?? callRecord.disposition) as string | undefined

    const leadUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (finalDisp) {
      leadUpdates.last_disposition = finalDisp

      // Auto-suppress if needed
      if (AUTO_SUPPRESS_DISPOSITIONS.has(finalDisp)) {
        const { data: lead } = await supabase
          .from('voice_leads')
          .select('phone_e164')
          .eq('id', callRecord.lead_id)
          .single()

        if (lead?.phone_e164) {
          await supabase.from('voice_suppression_list').upsert(
            { phone_e164: lead.phone_e164, reason: finalDisp, source: callRecord.id },
            { onConflict: 'phone_e164' }
          )
          leadUpdates.do_not_call = true
        }
      }

      if (finalDisp === 'do_not_call') {
        leadUpdates.do_not_call   = true
        leadUpdates.opted_out_at  = new Date().toISOString()
      }
      if (finalDisp === 'send_link')          leadUpdates.analyzer_link_sent = true
      if (finalDisp === 'callback_requested') leadUpdates.callback_requested = true
      if (finalDisp === 'transferred_live')   leadUpdates.transferred_live   = true
    }

    await supabase.from('voice_leads').update(leadUpdates).eq('id', callRecord.lead_id)
  }

  // Update campaign counters on completion
  if (callRecord.campaign_id && (callStatus === 'completed')) {
    const finalDisp = (updates.disposition ?? callRecord.disposition) as string | undefined
    const isConnect = callStatus === 'completed' && callDuration > 5
    const isQualified = ['decision_maker','interested','send_link','callback_requested','transferred_live'].includes(finalDisp ?? '')

    if (isConnect || isQualified) {
      const { data: campaign } = await supabase
        .from('voice_campaigns')
        .select('total_connects, total_qualified')
        .eq('id', callRecord.campaign_id)
        .single()

      if (campaign) {
        await supabase.from('voice_campaigns').update({
          total_connects:  isConnect   ? (campaign.total_connects  + 1) : campaign.total_connects,
          total_qualified: isQualified ? (campaign.total_qualified + 1) : campaign.total_qualified,
          updated_at:      new Date().toISOString(),
        }).eq('id', callRecord.campaign_id)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
