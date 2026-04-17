import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cancelDemoBookingScheduledEmail, sendDemoBookingEmail } from '@/lib/email'

async function assertAdmin() {
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
    supabase,
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
  }
}

function buildGoogleCalendarUrl(params: {
  title: string
  start: string
  end: string
  timezone: string
  leadEmail?: string | null
  details?: string | null
}) {
  const url = new URL('https://calendar.google.com/calendar/render')
  url.searchParams.set('action', 'TEMPLATE')
  url.searchParams.set('text', params.title)
  url.searchParams.set('dates', `${params.start.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}/${params.end.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
  url.searchParams.set('ctz', params.timezone)
  if (params.details) url.searchParams.set('details', params.details)
  if (params.leadEmail) url.searchParams.set('add', params.leadEmail)
  return url.toString()
}

function buildSequenceKey(leadId: string, slotStart: string, durationMinutes: number) {
  return `${leadId}:${slotStart}:${durationMinutes}`
}

async function createLocalBooking(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  lead: Record<string, any>,
  admin: { userId: string; userName: string },
  body: { slot_start: string; duration_minutes: number; notes?: string | null; timezone?: string | null },
) {
  const slotEnd = new Date(new Date(body.slot_start).getTime() + body.duration_minutes * 60 * 1000).toISOString()
  const timezone = body.timezone || lead.likely_timezone || 'America/New_York'
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || 'Lead'
  const title = `SourcifyLending AI Funding Demo - ${leadName}`
  const description = [
    `Company: ${lead.business_name || 'N/A'}`,
    `Phone: ${lead.phone || 'N/A'}`,
    body.notes?.trim() ? `Notes: ${body.notes.trim()}` : null,
  ].filter(Boolean).join('\n')

  const googleCalendarUrl = buildGoogleCalendarUrl({
    title,
    start: body.slot_start,
    end: slotEnd,
    timezone,
    leadEmail: typeof lead.email === 'string' ? lead.email : null,
    details: description,
  })

  const sequenceKey = buildSequenceKey(String(lead.id), body.slot_start, body.duration_minutes)
  const nowIso = new Date().toISOString()
  const leadEmail = typeof lead.email === 'string' ? lead.email.trim() : ''
  const bookingStart = new Date(body.slot_start)
  const reminderSchedule = [
    { key: 'reminder_24h_email_id', offsetMs: 24 * 60 * 60 * 1000 },
    { key: 'reminder_3h_email_id', offsetMs: 3 * 60 * 60 * 1000 },
    { key: 'reminder_10m_email_id', offsetMs: 10 * 60 * 1000 },
  ] as const

  const { data: previousSequences } = await supabase
    .from('demo_booking_sequences')
    .select('confirmation_email_id, reminder_24h_email_id, reminder_3h_email_id, reminder_10m_email_id')
    .eq('lead_id', lead.id)
    .is('canceled_at', null)

  for (const previous of previousSequences ?? []) {
    const emailIds = [
      previous.confirmation_email_id,
      previous.reminder_24h_email_id,
      previous.reminder_3h_email_id,
      previous.reminder_10m_email_id,
    ].filter((value): value is string => Boolean(value))

    for (const emailId of emailIds) {
      const cancelResult = await cancelDemoBookingScheduledEmail(emailId)
      if (!cancelResult.success) {
        console.warn('[crm schedule] could not cancel prior scheduled demo email', { emailId, error: cancelResult.error })
      }
    }
  }

  await supabase
    .from('demo_booking_sequences')
    .update({ canceled_at: nowIso })
    .eq('lead_id', lead.id)
    .is('canceled_at', null)

  let confirmationWarning: string | null = null
  if (!leadEmail) {
    confirmationWarning = 'Lead email missing; demo reminders were not enrolled.'
  } else {
    const { data: sequence, error: sequenceError } = await supabase
      .from('demo_booking_sequences')
      .upsert({
        sequence_key: sequenceKey,
        lead_id: lead.id,
        lead_email: leadEmail,
        lead_first_name: typeof lead.first_name === 'string' ? lead.first_name : null,
        lead_last_name: typeof lead.last_name === 'string' ? lead.last_name : null,
        business_name: typeof lead.business_name === 'string' ? lead.business_name : null,
        appointment_datetime: body.slot_start,
        duration_minutes: body.duration_minutes,
        timezone,
        calendar_url: googleCalendarUrl,
        notes: body.notes?.trim() || null,
        confirmation_email_sent_at: null,
        confirmation_email_id: null,
        reminder_24h_sent_at: null,
        reminder_24h_email_id: null,
        reminder_3h_sent_at: null,
        reminder_3h_email_id: null,
        reminder_10m_sent_at: null,
        reminder_10m_email_id: null,
        canceled_at: null,
      }, { onConflict: 'sequence_key' })
      .select('id, lead_email, lead_first_name, lead_last_name, business_name, appointment_datetime, timezone')
      .single()

    if (sequenceError) {
      confirmationWarning = sequenceError.message
      console.error('[crm schedule] failed to persist demo booking sequence', sequenceError)
    } else if (sequence?.lead_email) {
      const confirmation = await sendDemoBookingEmail({
        stage: 'confirmation',
        toEmail: sequence.lead_email,
        toName: [sequence.lead_first_name, sequence.lead_last_name].filter(Boolean).join(' ') || 'there',
        businessName: sequence.business_name,
        startAt: sequence.appointment_datetime,
        timezone: sequence.timezone,
      })

      if (confirmation.success) {
        await supabase
          .from('demo_booking_sequences')
          .update({
            confirmation_email_sent_at: nowIso,
            confirmation_email_id: confirmation.emailId ?? null,
          })
          .eq('sequence_key', sequenceKey)
      } else {
        confirmationWarning = confirmation.error ?? 'Failed to send confirmation email'
        console.error('[crm schedule] demo confirmation email failed', confirmation)
      }

      for (const reminder of reminderSchedule) {
        const scheduledAt = new Date(bookingStart.getTime() - reminder.offsetMs)
        if (scheduledAt.getTime() <= Date.now() + 60_000) continue

        const stage = reminder.key === 'reminder_24h_email_id'
          ? 'reminder_24h'
          : reminder.key === 'reminder_3h_email_id'
            ? 'reminder_3h'
            : 'reminder_10m'

        const scheduled = await sendDemoBookingEmail({
          stage,
          toEmail: sequence.lead_email,
          toName: [sequence.lead_first_name, sequence.lead_last_name].filter(Boolean).join(' ') || 'there',
          businessName: sequence.business_name,
          startAt: sequence.appointment_datetime,
          timezone: sequence.timezone,
          scheduledAt: scheduledAt.toISOString(),
        })

        if (!scheduled.success) {
          confirmationWarning = confirmationWarning ?? scheduled.error ?? `Failed to schedule ${stage}`
          console.error('[crm schedule] demo reminder schedule failed', {
            sequenceKey,
            stage,
            error: scheduled.error,
          })
          continue
        }

        await supabase
          .from('demo_booking_sequences')
          .update({ [reminder.key]: scheduled.emailId ?? null })
          .eq('sequence_key', sequenceKey)
      }
    }
  }

  return {
    event: {
      id: `booking-${Date.now()}`,
      title,
      description,
      start: body.slot_start,
      end: slotEnd,
      htmlLink: null,
      status: 'confirmed',
      type: 'demo' as const,
      source: 'google' as const,
      timeZone: timezone,
    },
    lead,
    googleCalendarUrl,
    confirmationWarning,
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  if (!body.slot_start) {
    return NextResponse.json({ error: 'slot_start is required' }, { status: 400 })
  }

  const { data: lead, error: leadError } = await admin.supabase
    .from('crm_leads')
    .select('*')
    .eq('id', id)
    .single()

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  try {
    const durationMinutes = typeof body.duration_minutes === 'number' ? body.duration_minutes : 30
    const timezone = typeof body.timezone === 'string' ? body.timezone : (lead.likely_timezone || 'America/New_York')

    // Validate slot_start is a valid date
    const slotStartDate = new Date(body.slot_start)
    if (isNaN(slotStartDate.getTime())) {
      return NextResponse.json({ error: 'Invalid slot_start date format' }, { status: 400 })
    }

    // Create local CRM booking with Google Calendar URL
    const booking = await createLocalBooking(admin.supabase, lead, admin, {
      slot_start: body.slot_start,
      duration_minutes: durationMinutes,
      notes: typeof body.notes === 'string' ? body.notes : null,
      timezone,
    })

    return NextResponse.json({
      event: booking.event,
      lead: booking.lead,
      googleCalendarUrl: booking.googleCalendarUrl,
      warning: booking.confirmationWarning ?? null,
    }, { status: 201 })
  } catch (error) {
    console.error('[crm schedule] failed to create CRM booking', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to create calendar booking.',
    }, { status: 500 })
  }
}
