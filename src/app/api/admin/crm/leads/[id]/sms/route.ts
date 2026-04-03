import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  buildCrmSmsSummary,
  buildCrmSmsTrackedLink,
  buildDefaultCrmSmsBody,
  CRM_SMS_SOURCE,
  getCrmPortalSignupUrl,
  getCrmSmsRows,
  injectTrackedPortalLink,
  mapTwilioSmsStatus,
  markCrmSmsEvent,
  renderCrmSmsTemplate,
} from '@/lib/crm-sms'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
    supabase,
  }
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const body = await req.json().catch(() => ({})) as {
    message_body?: string | null
    template_key?: string | null
    dialer_stage?: string | null
    campaign_id?: string | null
    parent_sms_id?: string | null
  }

  const { data: lead } = await admin.supabase
    .from('crm_leads')
    .select('id, first_name, last_name, phone, phone_e164, email, business_name, stage')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const normalizedPhone = getString(lead.phone_e164) || getString(lead.phone)
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Lead needs a phone number before a text can be sent' }, { status: 400 })
  }

  const { data: settings } = await admin.supabase
    .from('voice_agent_settings')
    .select('twilio_caller_id, sms_template')
    .eq('id', 'default')
    .maybeSingle()

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const callerId = getString(settings?.twilio_caller_id) || process.env.TWILIO_CALLER_ID

  if (!accountSid || !authToken || !callerId) {
    return NextResponse.json({ error: 'SMS provider is not configured' }, { status: 503 })
  }

  const now = new Date().toISOString()
  const { data: created, error: insertError } = await admin.supabase
    .from('crm_lead_sms')
    .insert({
      lead_id: lead.id,
      phone_number: normalizedPhone,
      message_body: '',
      direction: 'outbound',
      status: 'queued',
      delivery_status: 'queued',
      clicked: false,
      unread: false,
      campaign_id: body.campaign_id ?? null,
      parent_sms_id: body.parent_sms_id ?? null,
      sent_by_user_id: admin.userId,
      destination_url: getCrmPortalSignupUrl(req.nextUrl.origin),
      metadata: {
        source: CRM_SMS_SOURCE,
        template_key: body.template_key ?? 'portal_invite',
        dialer_stage: body.dialer_stage ?? lead.stage ?? null,
      },
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (insertError || !created) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create SMS log' }, { status: 500 })
  }

  const trackedLink = buildCrmSmsTrackedLink(created.id, req.nextUrl.origin)
  const template = getString(body.message_body)
    || getString(settings?.sms_template)
    || buildDefaultCrmSmsBody(lead.first_name, req.nextUrl.origin)

  const rendered = renderCrmSmsTemplate(template, {
    first_name: lead.first_name ?? '',
    last_name: lead.last_name ?? '',
    full_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim(),
    business_name: lead.business_name ?? '',
    portal_link: getCrmPortalSignupUrl(req.nextUrl.origin),
  })

  const finalBody = injectTrackedPortalLink(rendered, trackedLink, req.nextUrl.origin)
  const statusCallback = `${req.nextUrl.origin}/api/webhooks/twilio/sms`

  const client = twilio(accountSid, authToken)

  try {
    const message = await client.messages.create({
      to: normalizedPhone,
      from: callerId,
      body: finalBody,
      statusCallback,
    })

    await admin.supabase
      .from('crm_lead_sms')
      .update({
        message_body: finalBody,
        twilio_message_sid: message.sid,
        delivery_status: message.status ?? 'queued',
        destination_url: getCrmPortalSignupUrl(req.nextUrl.origin),
        updated_at: new Date().toISOString(),
      })
      .eq('id', created.id)

    await markCrmSmsEvent(admin.supabase, {
      smsId: created.id,
      status: mapTwilioSmsStatus(message.status),
      twilioMessageSid: message.sid,
      deliveryStatus: message.status ?? 'queued',
      createdBy: admin.userName,
      metadata: {
        source: CRM_SMS_SOURCE,
        template_key: body.template_key ?? 'portal_invite',
        tracked_link: trackedLink,
      },
    })

    const rows = await getCrmSmsRows(admin.supabase, lead.id)
    return NextResponse.json({
      ok: true,
      sms: rows[0] ?? created,
      sms_summary: buildCrmSmsSummary(rows),
      tracked_link: trackedLink,
    })
  } catch (error) {
    await admin.supabase
      .from('crm_lead_sms')
      .update({
        message_body: finalBody,
        status: 'failed',
        delivery_status: 'failed',
        destination_url: getCrmPortalSignupUrl(req.nextUrl.origin),
        error_message: error instanceof Error ? error.message : 'sms_send_failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', created.id)

    await markCrmSmsEvent(admin.supabase, {
      smsId: created.id,
      status: 'failed',
      deliveryStatus: 'failed',
      errorMessage: error instanceof Error ? error.message : 'sms_send_failed',
      createdBy: admin.userName,
      metadata: {
        source: CRM_SMS_SOURCE,
        tracked_link: trackedLink,
      },
    })

    return NextResponse.json({ error: 'Failed to send text message' }, { status: 500 })
  }
}
