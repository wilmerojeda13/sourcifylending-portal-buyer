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
  const leadId = searchParams.get('lead_id')
  // PERFORMANCE: Only load Google Calendar when explicitly requested
  // Default to false for fast first paint - client can request with ?google=true if needed
  const loadGoogle = searchParams.get('google') === 'true'
  const { start, end } = getRange(view, cursor)

  // PERFORMANCE: Build query based on needs
  let tasksQuery = supabase
    .from('crm_tasks')
    .select('id, title, due_at, status, priority, task_type, lead_id')
    .not('due_at', 'is', null)
    .gte('due_at', start.toISOString())
    .lt('due_at', end.toISOString())
    .order('due_at', { ascending: true })
    .limit(100)

  if (leadId) {
    tasksQuery = tasksQuery.eq('lead_id', leadId)
  }

  const [{ data: settingsRow }, tasksRes] = await Promise.all([
    loadGoogle
      ? supabase
        .from('voice_agent_settings')
        .select('google_client_id, google_client_secret, google_refresh_token, google_calendar_id, booking_timezone')
        .eq('id', 'default')
        .maybeSingle()
      : Promise.resolve({ data: null }),
    tasksQuery,
  ])

  if (tasksRes.error && !isMissingRelationError(tasksRes.error, 'crm_tasks')) {
    return NextResponse.json({ error: 'Unable to load CRM calendar items right now.' }, { status: 500 })
  }

  const warnings: string[] = []
  if (tasksRes.error) {
    console.error('crm_tasks unavailable in GET /api/admin/crm/calendar', tasksRes.error)
    warnings.push(getRelationUnavailableMessage('CRM tasks'))
  }

  const crmTaskEvents = ((tasksRes.error ? [] : tasksRes.data) ?? []).map(task => ({
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
    detail_url: task.lead_id ? `/admin/crm/${task.lead_id}` : '/admin/crm/tasks',
  }))

  // PERFORMANCE: Skip Google Calendar API call unless explicitly requested
  // This removes the 500-1000ms blocking call on first paint
  let googleEvents: any[] = []
  let googleError: string | null = null
  let hasGoogleCalendar = false
  let settings: CalendarSettings | null = null

  if (loadGoogle) {
    settings = {
      google_client_id: settingsRow?.google_client_id || process.env.GOOGLE_CLIENT_ID,
      google_client_secret: settingsRow?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET,
      google_refresh_token: settingsRow?.google_refresh_token || process.env.GOOGLE_REFRESH_TOKEN,
      google_calendar_id: settingsRow?.google_calendar_id || process.env.GOOGLE_CALENDAR_ID || 'primary',
      booking_timezone: settingsRow?.booking_timezone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York',
    }
    hasGoogleCalendar = Boolean(settings.google_client_id && settings.google_client_secret && settings.google_refresh_token)

    if (hasGoogleCalendar) {
      try {
        googleEvents = await listCalendarEvents(settings, {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          maxResults: 100,
        })
      } catch (error) {
        googleError = error instanceof Error ? error.message : 'Unable to fetch Google Calendar events'
      }
    }
  }

  const merged = [
    ...googleEvents.map((event: any) => ({
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
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return NextResponse.json({
    connected: hasGoogleCalendar && !googleError,
    google_calendar: loadGoogle ? {
      configured: hasGoogleCalendar,
      error: googleError,
      calendar_id: settings?.google_calendar_id || 'primary',
      timezone: settings?.booking_timezone || 'America/New_York',
    } : { configured: false, error: null, calendar_id: 'primary', timezone: 'America/New_York' },
    range: {
      view,
      start: start.toISOString(),
      end: end.toISOString(),
    },
    events: merged,
    warnings,
  })
}
