import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createLeadCalendarBooking } from '@/lib/crm-calendar-events'

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

function buildConnectUrl(leadId: string) {
  const next = `/admin/crm/${leadId}?book_demo=1`
  return `/api/admin/crm/google-calendar/connect?lead_id=${encodeURIComponent(leadId)}&next=${encodeURIComponent(next)}`
}

async function createLocalBooking(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  lead: Record<string, any>,
  admin: { userId: string; userName: string },
  body: { slot_start: string; duration_minutes: number; notes?: string | null; timezone?: string | null },
) {
  const slotEnd = new Date(new Date(body.slot_start).getTime() + body.duration_minutes * 60 * 1000).toISOString()
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || 'Lead'
  const taskTitle = `Demo: ${leadName}`

  const { data: task, error: taskError } = await supabase
    .from('crm_tasks')
    .insert({
      lead_id: lead.id,
      title: taskTitle,
      description: [
        'Google Calendar booking could not be created.',
        body.notes?.trim() ? `Prep notes: ${body.notes.trim()}` : null,
        `Timezone: ${body.timezone || lead.likely_timezone || 'America/New_York'}`,
        `Requested slot: ${new Date(body.slot_start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
      ].filter(Boolean).join('\n'),
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
        timezone: body.timezone || lead.likely_timezone || 'America/New_York',
      },
    })
    .select('*')
    .single()

  if (taskError || !task) {
    throw taskError || new Error('Unable to save CRM appointment.')
  }

  const { data: updatedLead, error: updateError } = await supabase
    .from('crm_leads')
    .update({
      stage: 'demo_scheduled',
      strategy_call_booked: true,
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
      task_id: task.id,
      task_type: task.task_type,
      task_status: task.status,
      task_priority: task.priority,
      event_start: body.slot_start,
      event_end: slotEnd,
      event_timezone: body.timezone || lead.likely_timezone || 'America/New_York',
      fallback: true,
    },
    created_by: admin.userName,
  })

  return {
    event: {
      id: `task-${task.id}`,
      title: task.title,
      description: task.description,
      start: body.slot_start,
      end: slotEnd,
      htmlLink: null,
      status: 'confirmed',
      type: 'demo' as const,
      source: 'google' as const,
      timeZone: body.timezone || lead.likely_timezone || 'America/New_York',
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

  const connectUrl = buildConnectUrl(id)

  try {
    const event = await createLeadCalendarBooking(admin.supabase, lead, {
      slotStart: body.slot_start,
      durationMinutes: typeof body.duration_minutes === 'number' ? body.duration_minutes : 30,
      notes: typeof body.notes === 'string' ? body.notes : null,
      timezone: typeof body.timezone === 'string' ? body.timezone : null,
    })

    const { data: updatedLead, error: updateError } = await admin.supabase
      .from('crm_leads')
      .update({
        stage: 'demo_scheduled',
        strategy_call_booked: true,
        follow_up_at: event.start,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      throw updateError
    }

    await admin.supabase
      .from('crm_activities')
      .insert({
        lead_id: id,
        type: 'follow_up_set',
        body: `Calendar demo booked for ${new Date(event.start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
        metadata: {
          event_id: event.id,
          event_type: event.type,
          event_status: event.status,
          event_start: event.start,
          event_end: event.end,
          event_timezone: event.timeZone,
          event_link: event.htmlLink,
        },
        created_by: admin.userName,
      })

    return NextResponse.json({
      event,
      lead: updatedLead,
    }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create calendar booking.'
    const authRequired = /missing google oauth credentials|token refresh failed|invalid_grant|unauthorized/i.test(message)

    if (authRequired) {
      return NextResponse.json({
        error: 'Google Calendar authorization is required.',
        auth_required: true,
        auth_url: connectUrl,
        details: message,
      }, { status: 428 })
    }

    try {
      const fallback = await createLocalBooking(admin.supabase, lead, admin, {
        slot_start: body.slot_start,
        duration_minutes: typeof body.duration_minutes === 'number' ? body.duration_minutes : 30,
        notes: typeof body.notes === 'string' ? body.notes : null,
        timezone: typeof body.timezone === 'string' ? body.timezone : null,
      })

      return NextResponse.json({
        ...fallback,
        warning: 'Google Calendar sync failed. The appointment was saved to CRM only.',
      }, { status: 201 })
    } catch (fallbackError) {
      console.error('[crm schedule] failed to create calendar booking', error)
      console.error('[crm schedule] local CRM fallback also failed', fallbackError)
      return NextResponse.json({
        error: message,
      }, { status: 500 })
    }
  }
}
