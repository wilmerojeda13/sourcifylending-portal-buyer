import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { listCalendarEvents, type CalendarSettings } from '@/lib/calendar'
import { getRelationUnavailableMessage, isMissingRelationError } from '@/lib/supabase-schema'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  return profile?.is_admin ? supabase : null
}

function getRange(view: string, cursor: string | null) {
  const base = cursor ? new Date(cursor) : new Date()
  const start = new Date(base)
  const end = new Date(base)

  if (view === 'day') {
    start.setHours(0, 0, 0, 0)
    end.setDate(start.getDate() + 1)
    end.setHours(0, 0, 0, 0)
  } else if (view === 'week' || view === 'agenda') {
    const day = start.getDay() || 7
    start.setDate(start.getDate() - day + 1)
    start.setHours(0, 0, 0, 0)
    end.setDate(start.getDate() + 7)
    end.setHours(0, 0, 0, 0)
  } else {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setMonth(start.getMonth() + 1, 1)
    end.setHours(0, 0, 0, 0)
  }

  return { start, end }
}

export async function GET(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'week'
  const cursor = searchParams.get('cursor')
  const { start, end } = getRange(view, cursor)

  const [{ data: settingsRow }, tasksRes, callsRes] = await Promise.all([
    supabase
      .from('voice_agent_settings')
      .select('google_client_id, google_client_secret, google_refresh_token, google_calendar_id, booking_timezone')
      .eq('id', 'default')
      .maybeSingle(),
    supabase
      .from('crm_tasks')
      .select('id, title, description, due_at, status, priority, task_type, lead_id, crm_leads(id, first_name, last_name, business_name)')
      .not('due_at', 'is', null)
      .gte('due_at', start.toISOString())
      .lt('due_at', end.toISOString())
      .order('due_at', { ascending: true }),
    supabase
      .from('crm_calls')
      .select('id, lead_id, lead_name, company_name, phone_number, next_follow_up_at, lead_temperature, strategy_call_booked, crm_leads(id, first_name, last_name, business_name)')
      .not('next_follow_up_at', 'is', null)
      .gte('next_follow_up_at', start.toISOString())
      .lt('next_follow_up_at', end.toISOString())
      .order('next_follow_up_at', { ascending: true }),
  ])

  if (tasksRes.error && !isMissingRelationError(tasksRes.error, 'crm_tasks')) {
    return NextResponse.json({ error: 'Unable to load CRM calendar items right now.' }, { status: 500 })
  }
  if (callsRes.error && !isMissingRelationError(callsRes.error, 'crm_calls')) {
    return NextResponse.json({ error: 'Unable to load CRM calendar items right now.' }, { status: 500 })
  }

  const settings: CalendarSettings = {
    google_client_id: settingsRow?.google_client_id || process.env.GOOGLE_CLIENT_ID,
    google_client_secret: settingsRow?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET,
    google_refresh_token: settingsRow?.google_refresh_token || process.env.GOOGLE_REFRESH_TOKEN,
    google_calendar_id: settingsRow?.google_calendar_id || process.env.GOOGLE_CALENDAR_ID || 'primary',
    booking_timezone: settingsRow?.booking_timezone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York',
  }

  const hasGoogleCalendar = Boolean(settings.google_client_id && settings.google_client_secret && settings.google_refresh_token)

  let googleEvents: Awaited<ReturnType<typeof listCalendarEvents>> = []
  let googleError: string | null = null

  if (hasGoogleCalendar) {
    try {
      googleEvents = await listCalendarEvents(settings, {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        maxResults: 150,
      })
    } catch (error) {
      googleError = error instanceof Error ? error.message : 'Unable to fetch Google Calendar events'
    }
  }

  const warnings: string[] = []
  if (tasksRes.error) {
    console.error('crm_tasks unavailable in GET /api/admin/crm/calendar', tasksRes.error)
    warnings.push(getRelationUnavailableMessage('CRM tasks'))
  }
  if (callsRes.error) {
    console.error('crm_calls unavailable in GET /api/admin/crm/calendar', callsRes.error)
    warnings.push(getRelationUnavailableMessage('CRM callbacks'))
  }

  const crmTaskEvents = ((tasksRes.error ? [] : tasksRes.data) ?? []).map(task => {
    const lead = Array.isArray(task.crm_leads) ? task.crm_leads[0] : task.crm_leads
    return {
      id: `task-${task.id}`,
      source: 'crm_task',
      type: 'task',
      title: task.title,
      start: task.due_at,
      end: task.due_at,
      status: task.status,
      priority: task.priority,
      task_type: task.task_type,
      lead_id: task.lead_id,
      lead_name: lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : null,
      business_name: lead?.business_name || null,
      detail_url: task.lead_id ? `/admin/crm/${task.lead_id}` : '/admin/crm/tasks',
    }
  })

  const crmCallbackEvents = ((callsRes.error ? [] : callsRes.data) ?? []).map(call => {
    const lead = Array.isArray(call.crm_leads) ? call.crm_leads[0] : call.crm_leads
    return {
      id: `callback-${call.id}`,
      source: 'crm_callback',
      type: 'callback',
      title: `Callback: ${call.lead_name}`,
      start: call.next_follow_up_at,
      end: call.next_follow_up_at,
      temperature: call.lead_temperature,
      strategy_call_booked: call.strategy_call_booked,
      lead_id: call.lead_id,
      lead_name: call.lead_name,
      business_name: call.company_name || lead?.business_name || null,
      detail_url: call.lead_id ? `/admin/crm/${call.lead_id}` : '/admin/crm/calls',
    }
  })

  const merged = [
    ...googleEvents.map(event => ({
      id: event.id,
      source: 'google',
      type: 'event',
      title: event.summary,
      start: event.start,
      end: event.end,
      description: event.description,
      htmlLink: event.htmlLink,
      status: event.status,
      detail_url: event.htmlLink || null,
    })),
    ...crmTaskEvents,
    ...crmCallbackEvents,
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return NextResponse.json({
    connected: hasGoogleCalendar && !googleError,
    google_calendar: {
      configured: hasGoogleCalendar,
      error: googleError,
      calendar_id: settings.google_calendar_id || 'primary',
      timezone: settings.booking_timezone || 'America/New_York',
    },
    range: {
      view,
      start: start.toISOString(),
      end: end.toISOString(),
    },
    events: merged,
    warnings,
  })
}
