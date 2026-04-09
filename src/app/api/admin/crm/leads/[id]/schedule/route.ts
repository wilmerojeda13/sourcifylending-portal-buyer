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
    userName: profile.full_name || profile.email || 'Admin',
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
    console.error('[crm schedule] failed to create calendar booking', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to create calendar booking.',
    }, { status: 500 })
  }
}
