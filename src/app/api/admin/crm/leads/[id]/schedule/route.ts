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
    }, { status: 201 })
  } catch (error) {
    console.error('[crm schedule] failed to create CRM booking', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to create calendar booking.',
    }, { status: 500 })
  }
}
