import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { mapTwilioSmsStatus, markCrmSmsEvent, normalizePhoneMatchCandidates } from '@/lib/crm-sms'
import { logPortalEvent } from '@/lib/portal-events'

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const messageSid = String(form.get('MessageSid') ?? '').trim()
  const rawStatus = String(form.get('MessageStatus') ?? '').trim()
  const rawSmsStatus = String(form.get('SmsStatus') ?? '').trim()
  const from = String(form.get('From') ?? '').trim()
  const to = String(form.get('To') ?? '').trim()
  const body = String(form.get('Body') ?? '').trim()
  const errorMessage = String(form.get('ErrorMessage') ?? '').trim() || null
  const inboundReceived = [rawStatus, rawSmsStatus].some((value) => value.toLowerCase() === 'received')

  if (!messageSid) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const supabase = await createServiceClient()

  if (body && from && inboundReceived) {
    const candidates = normalizePhoneMatchCandidates(from)
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, first_name, last_name, phone, phone_e164, business_name')

    const lead = (leads ?? []).find((row) => {
      const rowCandidates = normalizePhoneMatchCandidates(row.phone_e164 || row.phone)
      return rowCandidates.some((value) => candidates.includes(value))
    })

    if (!lead?.id) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'lead_not_found' })
    }

    const { data: lastOutbound } = await supabase
      .from('crm_lead_sms')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const now = new Date().toISOString()
    const { data: inserted } = await supabase
      .from('crm_lead_sms')
      .insert({
        lead_id: lead.id,
        phone_number: from,
        message_body: body,
        direction: 'inbound',
        twilio_message_sid: messageSid,
        status: 'sent',
        delivery_status: rawStatus || 'received',
        clicked: false,
        unread: true,
        parent_sms_id: lastOutbound?.id ?? null,
        sent_by_user_id: null,
        destination_url: null,
        metadata: {
          source: 'twilio_inbound_sms',
          to,
          from,
        },
        sent_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    await supabase.from('crm_activities').insert({
      lead_id: lead.id,
      type: 'sms',
      body: `Inbound SMS: ${body}`,
      metadata: {
        sms_id: inserted?.id ?? null,
        direction: 'inbound',
        from,
        to,
        twilio_message_sid: messageSid,
      },
      created_by: 'Twilio SMS',
    }).then(() => {})

    await logPortalEvent({
      eventType: 'crm_inbound_sms',
      category: 'leads',
      severity: 'info',
      title: 'Inbound SMS reply received',
      message: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || from,
      metadata: {
        lead_id: lead.id,
        phone_number: from,
        preview: body.slice(0, 120),
      },
    })

    return NextResponse.json({ ok: true, inbound: true })
  }

  if (!rawStatus) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { data: sms } = await supabase
    .from('crm_lead_sms')
    .select('id')
    .eq('twilio_message_sid', messageSid)
    .maybeSingle()

  if (!sms?.id) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  await markCrmSmsEvent(supabase, {
    smsId: sms.id,
    status: mapTwilioSmsStatus(rawStatus),
    deliveryStatus: rawStatus,
    errorMessage,
    metadata: {
      webhook_source: 'twilio_sms',
      message_status: rawStatus,
      error_code: String(form.get('ErrorCode') ?? '').trim() || null,
      to: to || null,
      from: from || null,
    },
  })

  return NextResponse.json({ ok: true })
}
