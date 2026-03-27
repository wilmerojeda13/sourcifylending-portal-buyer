/**
 * POST /api/voice/vapi/webhook
 * VAPI server-side webhook — handles tool-calls and end-of-call-report events.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAvailableSlots, createCalendarEvent } from '@/lib/calendar'
import { AUTO_SUPPRESS_DISPOSITIONS } from '@/modules/voice-agent/compliance/suppression'
import twilio from 'twilio'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VapiCall {
  id: string
  metadata?: { callId?: string; leadId?: string }
  startedAt?: string
  endedAt?: string
}

interface ToolCallFunction {
  name: string
  arguments: string // JSON string
}

interface ToolCallItem {
  id: string
  type: 'function'
  function: ToolCallFunction
}

interface VapiMessage {
  type: string
  call?: VapiCall
  toolCallList?: ToolCallItem[]
  // end-of-call-report fields
  endedReason?: string
  transcript?: string
  summary?: string
  recordingUrl?: string
  // status-update fields
  status?: string
}

interface VapiWebhookBody {
  message: VapiMessage
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs<T>(raw: string): T {
  try { return JSON.parse(raw) as T } catch { return {} as T }
}

/** Extract [DISPOSITION:code] from the end of a VAPI transcript */
function parseDisposition(transcript: string | undefined): string | null {
  if (!transcript) return null
  const m = transcript.match(/\[DISPOSITION:(\w+)\]/)
  return m ? m[1] : null
}

/** Extract [SUMMARY:...] from the transcript */
function parseSummary(transcript: string | undefined): string | null {
  if (!transcript) return null
  const m = transcript.match(/\[SUMMARY:([^\]]+)\]/)
  return m ? m[1].trim() : null
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

async function handleCheckAvailability(
  args: { num_slots?: number },
  callId: string,
): Promise<string> {
  const supabase = await createServiceClient()
  const numSlots = args.num_slots ?? 3

  const { data: settings } = await supabase
    .from('voice_agent_settings')
    .select('*')
    .eq('id', 'default')
    .single()

  if (!settings?.google_refresh_token && !process.env.GOOGLE_REFRESH_TOKEN) {
    return 'Calendar is not configured. Please offer the analyzer link instead.'
  }

  try {
    const slots = await getAvailableSlots(settings ?? {}, numSlots)
    if (!slots.length) return 'No available slots found in the next few days. Offer the analyzer link instead.'

    // Cache slots in voice_call_events for book_appointment to retrieve later
    await supabase.from('voice_call_events').insert({
      call_id:    callId,
      event_type: 'availability_slots',
      event_data: { slots },
      timestamp:  new Date().toISOString(),
    })

    const slotText = slots.map(s => `Slot ${s.index}: ${s.speech}`).join(', ')
    return `Available slots: ${slotText}`
  } catch (err) {
    console.error('[vapi/webhook] check_availability error:', err)
    return 'Unable to check calendar right now. Offer the analyzer link instead.'
  }
}

async function handleBookAppointment(
  args: { slot_index?: number; lead_email?: string; lead_name?: string; business_name?: string },
  callId: string,
  leadId: string,
): Promise<string> {
  const supabase = await createServiceClient()
  const { slot_index = 0, lead_email, lead_name, business_name } = args

  // Retrieve cached slots
  const { data: slotEvent } = await supabase
    .from('voice_call_events')
    .select('event_data')
    .eq('call_id', callId)
    .eq('event_type', 'availability_slots')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle()

  const slots = (slotEvent?.event_data as { slots?: Array<{ index: number; isoStart: string; isoEnd: string; timezone: string }> })?.slots
  if (!slots?.length) return 'I lost track of the available slots. Please check availability again.'

  const slot = slots.find(s => s.index === slot_index) ?? slots[0]

  const { data: settings } = await supabase
    .from('voice_agent_settings')
    .select('*')
    .eq('id', 'default')
    .single()

  try {
    const lead = leadId ? (await supabase.from('voice_leads').select('phone_e164, owner_name, business_name').eq('id', leadId).maybeSingle()).data : null

    await createCalendarEvent(settings ?? {}, {
      slotStart:          slot.isoStart,
      slotEnd:            slot.isoEnd,
      timezone:           slot.timezone,
      leadName:           lead_name  || lead?.owner_name   || undefined,
      businessName:       business_name || lead?.business_name || undefined,
      email:              lead_email  || undefined,
      phone:              lead?.phone_e164 || undefined,
      callId,
    })

    // Mark demo booked on call record
    await supabase.from('voice_calls').update({ disposition: 'demo_booked' }).eq('id', callId)
    await supabase.from('voice_call_events').insert({
      call_id:    callId,
      event_type: 'demo_booked',
      event_data: { slot_index, slot_start: slot.isoStart, lead_name, lead_email, business_name },
      timestamp:  new Date().toISOString(),
    })

    return 'Appointment booked successfully.'
  } catch (err) {
    console.error('[vapi/webhook] book_appointment error:', err)
    return 'Failed to book the appointment. Please offer the analyzer link as a fallback.'
  }
}

async function handleSendAnalyzerLink(
  args: { reason?: string },
  callId: string,
  leadId: string,
): Promise<string> {
  const supabase = await createServiceClient()

  const [settingsRes, leadRes] = await Promise.all([
    supabase.from('voice_agent_settings').select('analyzer_url, twilio_caller_id').eq('id', 'default').single(),
    leadId ? supabase.from('voice_leads').select('phone_e164, owner_name').eq('id', leadId).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const analyzerUrl = settingsRes.data?.analyzer_url || process.env.ANALYZER_URL || 'https://app.sourcifylending.com/analyzer'
  const phoneE164   = (leadRes as { data: { phone_e164?: string; owner_name?: string } | null }).data?.phone_e164
  const firstName   = (leadRes as { data: { phone_e164?: string; owner_name?: string } | null }).data?.owner_name?.trim().split(/\s+/)[0] || ''

  // Send SMS immediately
  if (phoneE164) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const callerId   = settingsRes.data?.twilio_caller_id || process.env.TWILIO_CALLER_ID

    if (accountSid && authToken && callerId) {
      const greeting = firstName ? `Hi ${firstName}! ` : 'Hi! '
      const smsBody  = `${greeting}Here's your free business funding analyzer from SourcifyLending — takes 2 min and shows exactly where you stand: ${analyzerUrl}`
      try {
        const client = twilio(accountSid, authToken)
        await client.messages.create({ to: phoneE164, from: callerId, body: smsBody })
      } catch (err) {
        console.error('[vapi/webhook] SMS send error:', err)
      }
    }
  }

  await Promise.all([
    supabase.from('voice_calls').update({ disposition: 'send_link' }).eq('id', callId),
    supabase.from('voice_call_events').insert({
      call_id:    callId,
      event_type: 'send_analyzer_link',
      event_data: { reason: args.reason, sms_sent: !!phoneE164 },
      timestamp:  new Date().toISOString(),
    }),
    leadId
      ? supabase.from('voice_leads').update({ analyzer_link_sent: true, updated_at: new Date().toISOString() }).eq('id', leadId)
      : Promise.resolve(),
  ])

  return 'Analyzer link sent via text message.'
}

async function handleLogQualification(
  args: { classification?: string; notes?: string },
  callId: string,
): Promise<string> {
  const supabase = await createServiceClient()

  await supabase.from('voice_call_events').insert({
    call_id:    callId,
    event_type: 'qualification',
    event_data: { classification: args.classification, notes: args.notes },
    timestamp:  new Date().toISOString(),
  })

  return 'Qualification logged.'
}

// ─── End-of-Call Processing ───────────────────────────────────────────────────

async function handleEndOfCall(message: VapiMessage, callId: string, leadId: string) {
  const supabase = await createServiceClient()
  const { transcript, summary, endedReason, call } = message

  const disposition = parseDisposition(transcript) ?? undefined
  const aiSummary   = parseSummary(transcript) ?? summary ?? undefined

  // Compute duration
  let durationSeconds: number | undefined
  if (call?.startedAt && call?.endedAt) {
    durationSeconds = Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
  }

  // Update call record
  const callUpdates: Record<string, unknown> = {
    status:     'completed',
    ended_at:   call?.endedAt ?? new Date().toISOString(),
  }
  if (disposition)     callUpdates.disposition      = disposition
  if (aiSummary)       callUpdates.summary          = aiSummary
  if (durationSeconds) callUpdates.duration_seconds = durationSeconds
  if (endedReason)     callUpdates.ended_reason     = endedReason

  await supabase.from('voice_calls').update(callUpdates).eq('id', callId)

  // Log the end-of-call event
  await supabase.from('voice_call_events').insert({
    call_id:    callId,
    event_type: 'end_of_call',
    event_data: { disposition, summary: aiSummary, ended_reason: endedReason, duration_seconds: durationSeconds },
    timestamp:  new Date().toISOString(),
  })

  // Update lead
  if (leadId && disposition) {
    const leadUpdates: Record<string, unknown> = {
      last_disposition: disposition,
      updated_at:       new Date().toISOString(),
    }

    if (disposition === 'send_link')          leadUpdates.analyzer_link_sent = true
    if (disposition === 'callback_requested') leadUpdates.callback_requested = true
    if (disposition === 'transferred_live')   leadUpdates.transferred_live   = true
    if (disposition === 'do_not_call') {
      leadUpdates.do_not_call  = true
      leadUpdates.opted_out_at = new Date().toISOString()
    }

    await supabase.from('voice_leads').update(leadUpdates).eq('id', leadId)

    // Auto-suppress
    if (AUTO_SUPPRESS_DISPOSITIONS.has(disposition)) {
      const { data: lead } = await supabase.from('voice_leads').select('phone_e164').eq('id', leadId).single()
      if (lead?.phone_e164) {
        await supabase.from('voice_suppression_list').upsert(
          { phone_e164: lead.phone_e164, reason: disposition, source: callId },
          { onConflict: 'phone_e164' },
        )
        await supabase.from('voice_leads').update({ do_not_call: true }).eq('id', leadId)
      }
    }
  }

  // Update campaign counters
  const { data: callRecord } = await supabase
    .from('voice_calls')
    .select('campaign_id, is_test')
    .eq('id', callId)
    .maybeSingle()

  if (callRecord?.campaign_id && !callRecord.is_test) {
    const isConnect   = (durationSeconds ?? 0) > 5
    const isQualified = ['decision_maker', 'interested', 'send_link', 'callback_requested', 'transferred_live', 'demo_booked'].includes(disposition ?? '')

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
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (secret) {
    const incoming = req.headers.get('x-vapi-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
    if (incoming !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = await req.json() as VapiWebhookBody
  const { message } = body

  if (!message) return NextResponse.json({ ok: true })

  const vapiId  = message.call?.id ?? ''
  let   callId  = message.call?.metadata?.callId  ?? ''
  let   leadId  = message.call?.metadata?.leadId  ?? ''

  // Fallback: if metadata didn't come through, look up by VAPI call ID
  if (!callId && vapiId) {
    const supabase = await createServiceClient()
    const { data: row } = await supabase
      .from('voice_calls')
      .select('id, lead_id')
      .eq('twilio_call_sid', vapiId)
      .maybeSingle()
    if (row) {
      callId = row.id
      if (!leadId) leadId = row.lead_id ?? ''
    }
  }

  // ── tool-calls ──────────────────────────────────────────────────────────────
  if (message.type === 'tool-calls' && message.toolCallList?.length) {
    const results: Array<{ toolCallId: string; result: string }> = []

    for (const tc of message.toolCallList) {
      const fnName = tc.function.name
      let result   = 'Done.'

      if (fnName === 'check_availability') {
        const args = parseArgs<{ num_slots?: number }>(tc.function.arguments)
        result = await handleCheckAvailability(args, callId || vapiId)

      } else if (fnName === 'book_appointment') {
        const args = parseArgs<{ slot_index?: number; lead_email?: string; lead_name?: string; business_name?: string }>(tc.function.arguments)
        result = await handleBookAppointment(args, callId || vapiId, leadId)

      } else if (fnName === 'send_analyzer_link') {
        const args = parseArgs<{ reason?: string }>(tc.function.arguments)
        result = await handleSendAnalyzerLink(args, callId || vapiId, leadId)

      } else if (fnName === 'log_qualification') {
        const args = parseArgs<{ classification?: string; notes?: string }>(tc.function.arguments)
        result = await handleLogQualification(args, callId || vapiId)
      }

      results.push({ toolCallId: tc.id, result })
    }

    return NextResponse.json({ results })
  }

  // ── status-update ───────────────────────────────────────────────────────────
  if (message.type === 'status-update' && callId) {
    const supabase = await createServiceClient()
    const statusMap: Record<string, string> = {
      queued:        'initiated',
      ringing:       'ringing',
      'in-progress': 'in-progress',
      forwarding:    'in-progress',
      ended:         'completed',
      completed:     'completed',
    }
    const newStatus = statusMap[message.status ?? '']
    if (newStatus) {
      await supabase.from('voice_calls').update({ status: newStatus }).eq('id', callId)
    }
  }

  // ── end-of-call-report ──────────────────────────────────────────────────────
  if (message.type === 'end-of-call-report') {
    if (callId) await handleEndOfCall(message, callId, leadId)
  }

  return NextResponse.json({ ok: true })
}
