import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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

async function createLocalBooking(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  lead: Record<string, any>,
  admin: { userId: string; userName: string },
  body: { slot_start: string; duration_minutes: number; notes?: string | null; timezone?: string | null },
) {
  const slotEnd = new Date(new Date(body.slot_start).getTime() + body.duration_minutes * 60 * 1000).toISOString()
  const timezone = body.timezone || lead.likely_timezone || 'America/New_York'
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || 'Lead'
  const title = `Sourcify Meeting: ${leadName}`
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

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .insert({
      lead_id: lead.id,
      appointment_at: body.slot_start,
      duration_minutes: body.duration_minutes,
      timezone,
      title,
      description,
      notes: body.notes?.trim() || null,
      status: 'scheduled',
      google_calendar_url: googleCalendarUrl,
      created_by_user_id: admin.userId,
      created_by_name: admin.userName,
      lead_name: leadName,
      company_name: lead.business_name || null,
      phone_number: lead.phone || null,
    })
    .select('*')
    .single()

  let record: {
    id: string
    title: string | null
    description: string | null
    status: string | null
    source: 'appointment' | 'task'
  } | null =
    appointment && !appointmentError
      ? {
          id: appointment.id,
          title: appointment.title,
          description: appointment.description,
          status: appointment.status,
          source: 'appointment' as const,
        }
      : null

  if (!record) {
    const missingAppointmentsTable =
      appointmentError?.code === '42P01' ||
      /appointments/i.test(appointmentError?.message || '') ||
      /relation .*appointments.* does not exist/i.test(appointmentError?.message || '')

    if (!missingAppointmentsTable) {
      throw appointmentError || new Error('Unable to save CRM appointment.')
    }

    const { data: task, error: taskError } = await supabase
      .from('crm_tasks')
      .insert({
        lead_id: lead.id,
        title,
        description,
        task_type: 'Book Call',
        priority: 'High',
        status: 'To Do',
        due_at: body.slot_start,
        owner_user_id: admin.userId,
        owner_name: admin.userName,
        pipeline_stage: 'demo_scheduled',
        notes: body.notes?.trim() || null,
        created_by_user_id: admin.userId,
        created_source: 'calendar_booking',
        created_source_label: 'Book Demo modal',
        source_metadata: {
          google_calendar_fallback: true,
          slot_start: body.slot_start,
          slot_end: slotEnd,
          timezone,
        },
      })
      .select('*')
      .single()

    if (taskError || !task) {
      throw taskError || new Error('Unable to save CRM appointment.')
    }

    record = {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      source: 'task' as const,
    }
  }

  const { data: updatedLead, error: updateError } = await supabase
    .from('crm_leads')
    .update({
      stage: 'demo_scheduled',
      strategy_call_booked: true,
      appointment_at: body.slot_start,
      follow_up_at: body.slot_start,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .select('*')
    .single()

  if (updateError || !updatedLead) {
    throw updateError || new Error('Unable to update CRM lead.')
  }

  await supabase.from('crm_activities').insert({
    lead_id: lead.id,
    type: 'follow_up_set',
    body: `Demo booked in CRM for ${new Date(body.slot_start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${body.notes?.trim() ? ` — ${body.notes.trim()}` : ''}`,
    metadata: {
      appointment_id: record.id,
      appointment_status: record.status,
      booking_source: record.source,
      appointment_at: body.slot_start,
      event_start: body.slot_start,
      event_end: slotEnd,
      event_timezone: body.timezone || lead.likely_timezone || 'America/New_York',
    },
    created_by: admin.userName,
  })

  return {
    event: {
      id: `${record.source}-${record.id}`,
      title: record.title,
      description: record.description,
      start: body.slot_start,
      end: slotEnd,
      htmlLink: null,
      status: 'confirmed',
      type: 'demo' as const,
      source: 'google' as const,
      timeZone: timezone,
    },
    lead: updatedLead,
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
    const fallback = await createLocalBooking(admin.supabase, lead, admin, {
      slot_start: body.slot_start,
      duration_minutes: typeof body.duration_minutes === 'number' ? body.duration_minutes : 30,
      notes: typeof body.notes === 'string' ? body.notes : null,
      timezone: typeof body.timezone === 'string' ? body.timezone : null,
    })

    return NextResponse.json({
      event: fallback.event,
      lead: fallback.lead,
    }, { status: 201 })
  } catch (error) {
    console.error('[crm schedule] failed to create CRM booking', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to create calendar booking.',
    }, { status: 500 })
  }
}
