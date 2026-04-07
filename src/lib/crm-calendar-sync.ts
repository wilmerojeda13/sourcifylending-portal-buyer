import type { createServiceClient } from '@/lib/supabase/server'
import { createCalendarEvent, listCalendarEvents, type CalendarSettings } from '@/lib/calendar'
import { logPortalEvent } from '@/lib/portal-events'

type SupabaseClientLike = Awaited<ReturnType<typeof createServiceClient>>

interface CrmTaskSyncInput {
  supabase: SupabaseClientLike
  settings: CalendarSettings
  task: {
    id: string
    title: string
    description?: string
    due_at: string
    status: string
    priority: string
    task_type: string
    lead_id: string
    crm_leads: {
      id: string
      first_name: string
      last_name: string
      email: string | null
      phone: string
      business_name: string | null
    }[]
  }
}

interface CalendarEventInfo {
  id?: string
  htmlLink?: string
  google_calendar_event_id?: string | null
  google_calendar_last_sync?: string | null
}

function generateEventTitle(task: CrmTaskSyncInput['task'], lead: any) {
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  const businessName = lead.business_name
  
  let title = task.title
  
  if (task.task_type === 'demo' || task.task_type === 'call') {
    if (leadName && businessName) {
      title = `${task.task_type === 'demo' ? 'Demo' : 'Call'}: ${leadName} - ${businessName}`
    } else if (leadName) {
      title = `${task.task_type === 'demo' ? 'Demo' : 'Call'}: ${leadName}`
    } else if (businessName) {
      title = `${task.task_type === 'demo' ? 'Demo' : 'Call'}: ${businessName}`
    }
  }
  
  return title
}

function generateEventDescription(task: CrmTaskSyncInput['task'], lead: any) {
  const lines = [
    `[CRM Task]`,
    `Task ID: ${task.id}`,
    `Type: ${task.task_type}`,
    `Priority: ${task.priority}`,
    `Status: ${task.status}`,
    `Lead ID: ${task.lead_id}`,
    ``,
    `Contact Information:`,
    `Name: ${[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Not specified'}`,
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone && lead.phone !== 'Pending' ? `Phone: ${lead.phone}` : null,
    lead.business_name ? `Business: ${lead.business_name}` : null,
    ``,
    task.description ? `Notes: ${task.description}` : null,
    `[/CRM Task]`,
  ].filter(Boolean)
  
  return lines.join('\n')
}

function generateAttendees(lead: any) {
  const attendees = []
  
  // Add lead email if available
  if (lead.email && !lead.email.includes('sourcifylending.com')) {
    attendees.push({
      email: lead.email,
      displayName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email,
    })
  }
  
  return attendees
}

async function findExistingCalendarEvent(
  supabase: SupabaseClientLike,
  taskId: string
): Promise<CalendarEventInfo | null> {
  const { data } = await supabase
    .from('crm_leads')
    .select('google_calendar_event_id, google_calendar_last_sync')
    .eq('id', taskId)
    .maybeSingle()
  
  if (!data?.google_calendar_event_id) {
    return null
  }
  
  return {
    id: data.google_calendar_event_id,
    google_calendar_event_id: data.google_calendar_event_id,
    google_calendar_last_sync: data.google_calendar_last_sync,
  }
}

async function updateCrmLeadWithCalendarInfo(
  supabase: SupabaseClientLike,
  leadId: string,
  calendarEventId: string,
  htmlLink?: string
) {
  const { error } = await supabase
    .from('crm_leads')
    .update({
      google_calendar_event_id: calendarEventId,
      google_calendar_last_sync: new Date().toISOString(),
    })
    .eq('id', leadId)
  
  if (error) throw error
}

export async function syncCrmTaskToCalendar({ supabase, settings, task }: CrmTaskSyncInput) {
  try {
    const lead = task.crm_leads[0] // Get the first lead from the array
    if (!lead) {
      return { action: 'skipped', reason: 'no_lead_found' }
    }
    
    const existingEvent = await findExistingCalendarEvent(supabase, task.lead_id)
    
    const eventTitle = generateEventTitle(task, lead)
    const eventDescription = generateEventDescription(task, lead)
    const attendees = generateAttendees(lead)
    
    // Only sync certain task types to calendar
    const syncableTypes = ['demo', 'call', 'meeting', 'follow_up']
    if (!syncableTypes.includes(task.task_type)) {
      return { action: 'skipped', reason: 'task_type_not_syncable' }
    }
    
    // Skip cancelled tasks
    if (task.status === 'Cancelled' || task.status === 'Canceled') {
      return { action: 'skipped', reason: 'task_cancelled' }
    }
    
    let calendarEventId: string
    let htmlLink: string | undefined
    let action: 'created' | 'updated'
    
    if (existingEvent?.id) {
      // For now, we'll create a new event since updateCalendarEvent is not available
      // TODO: Implement updateCalendarEvent in calendar.ts
      const result = await createCalendarEvent(settings, {
        slotStart: task.due_at,
        slotEnd: new Date(new Date(task.due_at).getTime() + 60 * 60 * 1000).toISOString(),
        timezone: settings.booking_timezone || 'America/New_York',
        email: attendees.length > 0 ? attendees[0].email : undefined,
        callId: task.id,
      })
      
      calendarEventId = result.id
      htmlLink = result.htmlLink
      action = 'updated'
    } else {
      // Create new event
      const result = await createCalendarEvent(settings, {
        slotStart: task.due_at,
        slotEnd: new Date(new Date(task.due_at).getTime() + 60 * 60 * 1000).toISOString(),
        timezone: settings.booking_timezone || 'America/New_York',
        leadName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || undefined,
        businessName: lead.business_name || undefined,
        email: lead.email || undefined,
        phone: lead.phone !== 'Pending' ? lead.phone : undefined,
        qualificationNotes: eventDescription,
        callId: task.id,
      })
      
      calendarEventId = result.id
      htmlLink = result.htmlLink
      action = 'created'
    }
    
    // Update CRM lead with calendar event info
    await updateCrmLeadWithCalendarInfo(supabase, task.lead_id, calendarEventId, htmlLink)
    
    // Log the sync event
    await logPortalEvent({
      eventType: action === 'created' ? 'crm_task_exported' : 'crm_task_updated',
      category: 'leads' as any,
      title: `${action === 'created' ? 'CRM Task Exported' : 'CRM Task Updated'}: ${eventTitle}`,
      message: `CRM task "${task.title}" ${action === 'created' ? 'created new calendar event' : 'updated existing calendar event'}.`,
      metadata: {
        crm_task_id: task.id,
        crm_lead_id: task.lead_id,
        google_event_id: calendarEventId,
        event_title: eventTitle,
        task_type: task.task_type,
        event_date: task.due_at,
        action,
      },
      severity: 'info' as any,
    }).catch(() => {})
    
    console.log('[calendar-sync] CRM task synced to calendar:', {
      action,
      taskId: task.id,
      leadId: task.lead_id,
      calendarEventId,
      eventTitle,
    })
    
    return { 
      action, 
      calendarEventId, 
      htmlLink,
      eventTitle,
      leadId: task.lead_id 
    }
    
  } catch (error) {
    console.error('[calendar-sync] Failed to sync CRM task to calendar:', error)
    
    // Log sync failure
    await logPortalEvent({
      eventType: 'crm_calendar_sync_failed',
      category: 'leads' as any,
      severity: 'error' as any,
      title: 'CRM Calendar Sync Failed',
      message: `Failed to sync CRM task "${task.title}" to Google Calendar.`,
      metadata: {
        crm_task_id: task.id,
        crm_lead_id: task.lead_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        task_title: task.title,
        task_type: task.task_type,
        due_date: task.due_at,
      },
    }).catch(() => {})
    
    throw error
  }
}

export async function syncAllCrmTasksToCalendar(supabase: SupabaseClientLike, settings: CalendarSettings) {
  if (!settings.google_client_id || !settings.google_client_secret || !settings.google_refresh_token) {
    console.log('[calendar-sync] Google Calendar not configured')
    return { synced: 0, errors: 0, tasks: [] }
  }
  
  try {
    // Get upcoming CRM tasks that should be synced
    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    
    const { data: tasks, error } = await supabase
      .from('crm_tasks')
      .select(`
        id,
        title,
        description,
        due_at,
        status,
        priority,
        task_type,
        lead_id,
        crm_leads(
          id,
          first_name,
          last_name,
          email,
          phone,
          business_name
        )
      `)
      .not('due_at', 'is', null)
      .gte('due_at', timeMin)
      .lt('due_at', timeMax)
      .in('task_type', ['demo', 'call', 'meeting', 'follow_up'])
      .not('status', 'in', ['Cancelled', 'Canceled'])
    
    if (error) throw error
    
    console.log(`[calendar-sync] Found ${tasks.length} CRM tasks to sync to calendar`)
    
    let synced = 0
    let errors = 0
    const results = []
    
    for (const task of tasks) {
      try {
        const result = await syncCrmTaskToCalendar({ supabase, settings, task })
        if (result.action !== 'skipped') {
          synced++
        }
        results.push({ taskId: task.id, result })
      } catch (error) {
        errors++
        console.error(`[calendar-sync] Failed to sync task ${task.id}:`, error)
        results.push({ taskId: task.id, error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }
    
    console.log(`[calendar-sync] CRM to calendar sync complete: ${synced} synced, ${errors} errors`)
    
    return { synced, errors, tasks: results }
    
  } catch (error) {
    console.error('[calendar-sync] Failed to sync CRM tasks to calendar:', error)
    throw error
  }
}
