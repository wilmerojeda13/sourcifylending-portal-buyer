/**
 * POST /api/voice/dial
 * Triggers an outbound call to a lead via Twilio.
 * Creates a voice_calls record and initiates the Twilio call.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import twilio from 'twilio'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null, supabase: null }
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return { error: 'Forbidden', status: 403, user: null, supabase: null }
  return { error: null, status: 200, user, supabase }
}

export async function POST(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json() as { lead_id: string; campaign_id?: string }
  const { lead_id, campaign_id } = body

  if (!lead_id) return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })

  // Load lead
  const { data: lead } = await supabase
    .from('voice_leads')
    .select('*')
    .eq('id', lead_id)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.do_not_call) return NextResponse.json({ error: 'Lead is on DNC list' }, { status: 400 })
  if (!lead.phone_e164) return NextResponse.json({ error: 'Lead has no valid phone number' }, { status: 400 })

  // Check suppression
  const { data: suppressed } = await supabase
    .from('voice_suppression_list')
    .select('id')
    .eq('phone_e164', lead.phone_e164)
    .maybeSingle()

  if (suppressed) return NextResponse.json({ error: 'Phone is on suppression list' }, { status: 400 })

  // Check max attempts
  const { data: settings } = await supabase
    .from('voice_agent_settings')
    .select('*')
    .eq('id', 'default')
    .single()

  const maxAttempts = lead.lead_priority_tier === 1 ? (settings?.retry_rules as Record<string, number>)?.tier1_max ?? 3
    : lead.lead_priority_tier === 2 ? (settings?.retry_rules as Record<string, number>)?.tier2_max ?? 3
    : (settings?.retry_rules as Record<string, number>)?.tier3_max ?? 2

  if (lead.call_attempt_count >= maxAttempts) {
    return NextResponse.json({ error: `Lead has reached max attempts (${maxAttempts})` }, { status: 400 })
  }

  // Check for an active call to this lead already
  const { data: activeCall } = await supabase
    .from('voice_calls')
    .select('id')
    .eq('lead_id', lead_id)
    .in('status', ['initiated', 'ringing', 'in-progress'])
    .maybeSingle()

  if (activeCall) return NextResponse.json({ error: 'Call already in progress for this lead' }, { status: 400 })

  // Load Twilio credentials
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const callerId   = settings?.twilio_caller_id || process.env.TWILIO_CALLER_ID

  if (!accountSid || !authToken || !callerId) {
    return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 })
  }

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const campaignIdParam = campaign_id ?? lead.campaign_id ?? ''

  // Create call record first
  const { data: callRecord, error: callErr } = await supabase
    .from('voice_calls')
    .insert({
      campaign_id: campaignIdParam || null,
      lead_id,
      status:       'initiated',
      direction:    'outbound-api',
      from_number:  callerId,
      to_number:    lead.phone_e164,
      created_at:   new Date().toISOString(),
    })
    .select()
    .single()

  if (callErr || !callRecord) {
    return NextResponse.json({ error: 'Failed to create call record' }, { status: 500 })
  }

  // Initiate Twilio call
  try {
    const client = twilio(accountSid, authToken)

    const twimlUrl    = `${appUrl}/api/voice/twilio/outbound?callId=${callRecord.id}&leadId=${lead_id}&campaignId=${campaignIdParam}`
    const statusUrl   = `${appUrl}/api/voice/twilio/status`

    const call = await client.calls.create({
      to:                  lead.phone_e164,
      from:                callerId,
      url:                 twimlUrl,
      statusCallback:      statusUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      machineDetection:    'Enable',
      asyncAmd:            true,
      asyncAmdStatusCallback: `${appUrl}/api/voice/twilio/amd?callId=${callRecord.id}`,
      timeout:             30,
    })

    // Update call record with Twilio SID
    await supabase
      .from('voice_calls')
      .update({ twilio_call_sid: call.sid, started_at: new Date().toISOString() })
      .eq('id', callRecord.id)

    // Increment attempt count on lead
    await supabase
      .from('voice_leads')
      .update({
        call_attempt_count: lead.call_attempt_count + 1,
        last_called_at:     new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', lead_id)

    // Update campaign call counter
    if (campaignIdParam) {
      await supabase.rpc('increment_campaign_calls', { campaign_id_param: campaignIdParam }).catch(() => {})
    }

    return NextResponse.json({ success: true, call_id: callRecord.id, twilio_sid: call.sid })
  } catch (err) {
    console.error('[voice/dial] Twilio error:', err)
    // Mark call as failed
    await supabase
      .from('voice_calls')
      .update({ status: 'failed', ended_at: new Date().toISOString() })
      .eq('id', callRecord.id)

    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 })
  }
}
