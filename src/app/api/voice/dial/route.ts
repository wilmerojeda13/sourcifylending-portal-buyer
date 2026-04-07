/**
 * POST /api/voice/dial
 * Triggers an outbound call to a lead via VAPI.
 * Creates a voice_calls record and initiates the VAPI call.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildVapiAssistant } from '@/lib/vapi'
import { evaluateLeadCallWindow, inferLeadPhoneIntelligence } from '@/lib/crm-call-compliance'

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

  const vapiApiKey = process.env.VAPI_API_KEY
  if (!vapiApiKey) return NextResponse.json({ error: 'VAPI_API_KEY not configured' }, { status: 500 })

  // Load lead
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('*')
    .eq('id', lead_id)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.do_not_call) return NextResponse.json({ error: 'Lead is on DNC list' }, { status: 400 })
  if (!lead.phone_e164) return NextResponse.json({ error: 'Lead has no valid phone number' }, { status: 400 })

  // Check timezone compliance for manual CRM dialing with proper fallback chain
  const phoneIntelligence = await inferLeadPhoneIntelligence(lead.phone_e164)
  const callWindow = evaluateLeadCallWindow(phoneIntelligence)
  
  // For manual CRM dialing, allow calls with unknown timezone but show warning
  if (callWindow.status === 'unknown_timezone') {
    // Allow manual dialing with warning for unknown timezone
    console.warn('[voice dial] Allowing manual dial with unknown timezone:', {
      lead_id: lead_id,
      phone: lead.phone_e164,
      timezone_source: phoneIntelligence.timezone_source,
      reason: phoneIntelligence.timezone_reason_label || 'Unknown timezone'
    })
    
    // Update lead with timezone verification flag
    await supabase
      .from('crm_leads')
      .update({
        timezone_verified: false,
        timezone_verification_note: `Manual dial allowed - ${phoneIntelligence.timezone_reason_label || 'Unknown timezone'}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead_id)
    
    return NextResponse.json({ 
      success: true, 
      warning: `Timezone unverified - ${phoneIntelligence.timezone_reason_label || 'Unknown timezone'}. Manual dialing allowed.`,
      call_id: 'pending' 
    })
  }
  
  // For known timezones, enforce calling hours strictly
  if (callWindow.status === 'blocked_by_timezone') {
    return NextResponse.json({ error: callWindow.message }, { status: 400 })
  }
  
  // Allow manual dialing during callable hours
  if (callWindow.status === 'callable_now') {
    return NextResponse.json({ 
      success: true, 
      message: `Ready to dial - ${callWindow.message}`,
      call_id: 'pending' 
    })
  }

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

  // CRM leads don't have priority tiers or attempt counts - skip these checks for now
  const maxAttempts = 3

  // if (lead.call_attempt_count >= maxAttempts) {
  //   return NextResponse.json({ error: `Lead has reached max attempts (${maxAttempts})` }, { status: 400 })
  // }

  // Check for an active call to this lead already
  const { data: activeCall } = await supabase
    .from('voice_calls')
    .select('id')
    .eq('lead_id', lead_id)
    .in('status', ['initiated', 'ringing', 'in-progress'])
    .maybeSingle()

  if (activeCall) return NextResponse.json({ error: 'Call already in progress for this lead' }, { status: 400 })

  const callerId   = settings?.twilio_caller_id || process.env.TWILIO_CALLER_ID
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN

  if (!callerId || !accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio caller credentials not configured' }, { status: 500 })
  }

  const appUrl          = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const campaignIdParam = campaign_id ?? lead.campaign_id ?? ''

  // Create call record first
  const { data: callRecord, error: callErr } = await supabase
    .from('voice_calls')
    .insert({
      campaign_id: campaignIdParam || null,
      lead_id,
      status:      'initiated',
      direction:   'outbound-api',
      from_number: callerId,
      to_number:   lead.phone_e164,
      created_at:  new Date().toISOString(),
    })
    .select()
    .single()

  if (callErr || !callRecord) {
    return NextResponse.json({ error: 'Failed to create call record' }, { status: 500 })
  }

  // Build VAPI assistant config
  const webhookUrl = `${appUrl}/api/voice/vapi/webhook`
  const assistant  = buildVapiAssistant({
    lead: {
      owner_name:          lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}` : lead.first_name || '',
      business_name:       lead.business_name,
      // CRM leads don't have these flags - set to false
      prior_inquiry_flag:  false,
      prior_facebook_flag:  false,
      prior_portal_flag:    false,
      prior_analyzer_flag:  false,
    },
    settings: {
      analyzer_url:         settings?.analyzer_url,
      transfer_number:      settings?.transfer_number,
      google_refresh_token: settings?.google_refresh_token,
    },
    callId:     callRecord.id,
    leadId:     lead_id,
    webhookUrl,
  })

  // Initiate call via VAPI
  try {
    const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistant,
        phoneNumber: {
          twilioAccountSid:  accountSid,
          twilioAuthToken:   authToken,
          twilioPhoneNumber: callerId,
        },
        customer: {
          number: lead.phone_e164,
          name:   lead.owner_name || undefined,
        },
      }),
    })

    const vapiData = await vapiRes.json() as Record<string, unknown>

    if (!vapiRes.ok) {
      console.error('[voice/dial] VAPI error:', vapiData)
      await supabase.from('voice_calls').update({ status: 'failed', ended_at: new Date().toISOString() }).eq('id', callRecord.id)
      return NextResponse.json({ error: (vapiData.message as string) ?? 'VAPI call initiation failed' }, { status: 500 })
    }

    const vapiCallId = vapiData.id as string | undefined

    // Update call record with VAPI call ID (stored in twilio_call_sid for backwards compat)
    await supabase
      .from('voice_calls')
      .update({ twilio_call_sid: vapiCallId, started_at: new Date().toISOString() })
      .eq('id', callRecord.id)

    // CRM leads don't have call_attempt_count field - just update last_called_at
    await supabase
      .from('crm_leads')
      .update({
        last_called_at:     new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', lead_id)

    // Update campaign call counter
    if (campaignIdParam) {
      await supabase.rpc('increment_campaign_calls', { campaign_id_param: campaignIdParam })
    }

    return NextResponse.json({ success: true, call_id: callRecord.id, vapi_call_id: vapiCallId })
  } catch (err) {
    console.error('[voice/dial] VAPI error:', err)
    await supabase.from('voice_calls').update({ status: 'failed', ended_at: new Date().toISOString() }).eq('id', callRecord.id)
    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 })
  }
}
