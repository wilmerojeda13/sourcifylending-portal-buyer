import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { syncAllCalendarEventsToCrm } from '@/lib/calendar-crm-sync'
import { syncAllCrmTasksToCalendar } from '@/lib/crm-calendar-sync'
import { listCalendarEvents, type CalendarSettings } from '@/lib/calendar'
import { logPortalEvent } from '@/lib/portal-events'

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

export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { action, direction } = body

    // Get calendar settings
    const { data: settingsRow } = await supabase
      .from('voice_agent_settings')
      .select('google_client_id, google_client_secret, google_refresh_token, google_calendar_id, booking_timezone')
      .eq('id', 'default')
      .maybeSingle()

    const settings: CalendarSettings = {
      google_client_id: settingsRow?.google_client_id || process.env.GOOGLE_CLIENT_ID,
      google_client_secret: settingsRow?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET,
      google_refresh_token: settingsRow?.google_refresh_token || process.env.GOOGLE_REFRESH_TOKEN,
      google_calendar_id: settingsRow?.google_calendar_id || process.env.GOOGLE_CALENDAR_ID || 'primary',
      booking_timezone: settingsRow?.booking_timezone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York',
    }

    if (!settings.google_client_id || !settings.google_client_secret || !settings.google_refresh_token) {
      return NextResponse.json({ error: 'Google Calendar not configured' }, { status: 400 })
    }

    let result

    if (action === 'sync') {
      if (direction === 'calendar-to-crm' || !direction) {
        // Sync Google Calendar events to CRM
        const calendarResult = await syncAllCalendarEventsToCrm(supabase, settings)
        result = { calendarToCrm: calendarResult }
      }

      if (direction === 'crm-to-calendar' || !direction) {
        // Sync CRM tasks to Google Calendar
        const crmResult = await syncAllCrmTasksToCalendar(supabase, settings)
        result = { ...result, crmToCalendar: crmResult }
      }
    } else if (action === 'audit') {
      // Audit specific contact (Curtis Brown / Dorothy's Family Construction LLC)
      const { search } = body
      if (search) {
        // Search for CRM leads matching the search term
        const { data: crmLeads } = await supabase
          .from('crm_leads')
          .select('*')
          .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,business_name.ilike.%${search}%,email.ilike.%${search}%`)
          .limit(10)

        // Search for calendar events matching the search term
        const events = await listCalendarEvents(settings, {
          timeMin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          maxResults: 250,
        })

        const matchingEvents = events.filter(event => 
          event.summary?.toLowerCase().includes(search.toLowerCase()) ||
          event.description?.toLowerCase().includes(search.toLowerCase())
        )

        result = {
          crmLeads: crmLeads || [],
          calendarEvents: matchingEvents,
          search
        }
      }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Log the sync operation
    await logPortalEvent({
      eventType: 'calendar_sync_completed',
      category: 'leads' as any,
      title: 'Calendar Sync Completed',
      message: `Calendar sync operation completed: ${action}`,
      metadata: {
        action,
        direction,
        result,
        timestamp: new Date().toISOString(),
      },
      severity: 'info' as any,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      action,
      result,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[calendar-sync] Sync operation failed:', error)
    
    // Log sync failure
    await logPortalEvent({
      eventType: 'calendar_sync_failed',
      category: 'leads' as any,
      severity: 'error' as any,
      title: 'Calendar Sync Failed',
      message: `Calendar sync operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    }).catch(() => {})

    return NextResponse.json({ 
      error: 'Sync operation failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')

    // Get calendar settings
    const { data: settingsRow } = await supabase
      .from('voice_agent_settings')
      .select('google_client_id, google_client_secret, google_refresh_token, google_calendar_id, booking_timezone')
      .eq('id', 'default')
      .maybeSingle()

    const settings: CalendarSettings = {
      google_client_id: settingsRow?.google_client_id || process.env.GOOGLE_CLIENT_ID,
      google_client_secret: settingsRow?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET,
      google_refresh_token: settingsRow?.google_refresh_token || process.env.GOOGLE_REFRESH_TOKEN,
      google_calendar_id: settingsRow?.google_calendar_id || process.env.GOOGLE_CALENDAR_ID || 'primary',
      booking_timezone: settingsRow?.booking_timezone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York',
    }

    const hasGoogleCalendar = Boolean(settings.google_client_id && settings.google_client_secret && settings.google_refresh_token)

    let result: any = {
      configured: hasGoogleCalendar,
      calendar_id: settings.google_calendar_id || 'primary',
      timezone: settings.booking_timezone || 'America/New_York',
    }

    if (search) {
      // Search for CRM leads matching the search term
      const { data: crmLeads } = await supabase
        .from('crm_leads')
        .select('*')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,business_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10)

      // Search for calendar events matching the search term
      let events: any[] = []
      if (hasGoogleCalendar) {
        try {
          events = await listCalendarEvents(settings, {
            timeMin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
            timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            maxResults: 250,
          })
        } catch (error) {
          console.error('[calendar-sync] Failed to fetch calendar events:', error)
        }
      }

      const matchingEvents = events.filter(event => 
        event.summary?.toLowerCase().includes(search.toLowerCase()) ||
        event.description?.toLowerCase().includes(search.toLowerCase())
      )

      result = {
        ...result,
        crmLeads: crmLeads || [],
        calendarEvents: matchingEvents,
        search
      }
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[calendar-sync] Get operation failed:', error)
    return NextResponse.json({ 
      error: 'Get operation failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
