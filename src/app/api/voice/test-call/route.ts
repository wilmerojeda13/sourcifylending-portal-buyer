/**
 * POST /api/voice/test-call
 * Fire an immediate test call to any phone number without needing a CSV or lead record.
 * Creates a temporary test lead, initiates the call via VAPI, returns call_id for status polling.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildVapiAssistant } from '@/lib/vapi'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, supabase: null }
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return { error: 'Forbidden', status: 403, supabase: null }
  return { error: null, status: 200, supabase }
}

/** Normalize phone to E.164 (basic US handling) */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 7) return `+${digits}`
  return null
}

export async function POST(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json() as {
    phone: string
    contact_name?: string
    business_name?: string
  }

  const { phone, contact_name, business_name } = body

  if (!phone) return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })

  const phoneE164 = toE164(phone)
  if (!phoneE164) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })

  const vapiApiKey = process.env.VAPI_API_KEY
  if (!vapiApiKey) return NextResponse.json({ error: 'VAPI_API_KEY not configured' }, { status: 500 })

  // Load settings
  const { data: settings } = await supabase
    .from('voice_agent_settings')
    .select('*')
    .eq('id', 'default')
    .single()

  const callerId = settings?.twilio_caller_id || process.env.TWILIO_CALLER_ID
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN

  if (!callerId || !accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio caller credentials not configured' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''

  // Create a temporary test lead so call record has something to reference
  const { data: testLead } = await supabase
    .from('voice_leads')
    .insert({
      phone_raw:          phone,
      phone_e164:         phoneE164,
      owner_name:         contact_name?.trim() || 'Test Call',
      business_name:      business_name?.trim() || contact_name?.trim() || 'Test Call',
      lead_status:        'test',
      do_not_call:        false,
      call_attempt_count: 0,
      lead_priority_tier: 1,
      created_at:         new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    })
    .select()
    .single()

  if (!testLead) return NextResponse.json({ error: 'Failed to create test lead' }, { status: 500 })

  // Create call record
  const { data: callRecord, error: callErr } = await supabase
    .from('voice_calls')
    .insert({
      lead_id:     testLead.id,
      campaign_id: null,
      status:      'initiated',
      direction:   'outbound-api',
      from_number: callerId,
      to_number:   phoneE164,
      is_test:     true,
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
      owner_name:          testLead.owner_name,
      business_name:       testLead.business_name,
      prior_inquiry_flag:  false,
      prior_facebook_flag: false,
      prior_portal_flag:   false,
      prior_analyzer_flag: false,
    },
    settings: {
      analyzer_url:         settings?.analyzer_url,
      transfer_number:      settings?.transfer_number,
      google_refresh_token: settings?.google_refresh_token,
    },
    callId:     callRecord.id,
    leadId:     testLead.id,
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
          number: phoneE164,
          name:   contact_name || undefined,
        },
      }),
    })

    const vapiData = await vapiRes.json() as Record<string, unknown>

    if (!vapiRes.ok) {
      console.error('[voice/test-call] VAPI error:', vapiData)
      await supabase.from('voice_calls').update({ status: 'failed', ended_at: new Date().toISOString() }).eq('id', callRecord.id)
      return NextResponse.json({ error: (vapiData.message as string) ?? 'VAPI call initiation failed' }, { status: 500 })
    }

    const vapiCallId = vapiData.id as string | undefined

    await supabase
      .from('voice_calls')
      .update({ twilio_call_sid: vapiCallId, started_at: new Date().toISOString() })
      .eq('id', callRecord.id)

    return NextResponse.json({
      success:      true,
      call_id:      callRecord.id,
      vapi_call_id: vapiCallId,
      phone:        phoneE164,
    })
  } catch (err: unknown) {
    console.error('[voice/test-call] VAPI error:', err)
    await supabase.from('voice_calls').update({ status: 'failed', ended_at: new Date().toISOString() }).eq('id', callRecord.id)
    const msg = err instanceof Error ? err.message : 'Failed to initiate call'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
