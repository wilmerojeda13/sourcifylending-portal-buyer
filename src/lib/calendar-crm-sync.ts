import type { createServiceClient } from '@/lib/supabase/server'
import { listCalendarEvents, createCalendarEvent, updateCalendarEvent, type CalendarSettings } from '@/lib/calendar'
import { logPortalEvent } from '@/lib/portal-events'
import { extractEmailFromText, extractPhoneFromText, extractBusinessNameFromText } from '@/lib/contact-extraction'

type SupabaseClientLike = Awaited<ReturnType<typeof createServiceClient>>

interface CalendarEventSyncInput {
  supabase: SupabaseClientLike
  settings: CalendarSettings
  event: {
    id: string
    summary: string
    description?: string
    start: string
    end: string
    attendees?: Array<{ email: string; displayName?: string }>
    htmlLink?: string
    status?: string
  }
}

interface CRMLeadRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string
  business_name: string | null
  source: string
  stage: string
  program_interest: string | null
  notes: string | null
  lead_temperature?: 'cold' | 'warm' | 'hot'
  google_calendar_event_id?: string | null
  google_calendar_last_sync?: string | null
}

function extractContactInfo(event: CalendarEventSyncInput['event']) {
  const { summary, description, attendees } = event
  
  // Extract contact information from event title and description
  const contactInfo = {
    fullName: '',
    email: '',
    phone: '',
    businessName: '',
  }
  
  // Try to extract from title (e.g., "Demo with Curtis Brown - Dorothy's Family Construction LLC")
  const titleMatch = summary.match(/(?:with|for)\s+([^-\n]+)/i)
  if (titleMatch) {
    contactInfo.fullName = titleMatch[1].trim()
  }
  
  // Extract business name from title
  const businessMatch = summary.match(/[-]\s*([^-\n]+)$/)
  if (businessMatch) {
    contactInfo.businessName = businessMatch[1].trim()
  }
  
  // Extract from description if available
  if (description) {
    contactInfo.email = extractEmailFromText(description) || contactInfo.email
    contactInfo.phone = extractPhoneFromText(description) || contactInfo.phone
    if (!contactInfo.businessName) {
      contactInfo.businessName = extractBusinessNameFromText(description) || contactInfo.businessName
    }
  }
  
  // Extract from attendees
  if (attendees && attendees.length > 0) {
    const primaryAttendee = attendees.find(a => !a.email.includes('sourcifylending.com')) || attendees[0]
    if (!contactInfo.email && primaryAttendee.email) {
      contactInfo.email = primaryAttendee.email
    }
    if (!contactInfo.fullName && primaryAttendee.displayName) {
      contactInfo.fullName = primaryAttendee.displayName
    }
  }
  
  return contactInfo
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || fullName.trim(),
    lastName: parts.slice(1).join(' '),
  }
}

async function findExistingCrmLead(supabase: SupabaseClientLike, contactInfo: ReturnType<typeof extractContactInfo>): Promise<CRMLeadRow | null> {
  const { email, phone, businessName, fullName } = contactInfo
  
  // Try email first
  if (email) {
    const { data } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  
  // Try phone second
  if (phone) {
    const { data } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('phone', phone)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  
  // Try business name + name fallback
  if (businessName && fullName) {
    const { firstName, lastName } = splitName(fullName)
    const { data } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('business_name', businessName.trim())
      .eq('first_name', firstName.trim())
      .eq('last_name', lastName.trim())
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  
  return null
}

async function createCrmLeadFromCalendarEvent(
  supabase: SupabaseClientLike,
  event: CalendarEventSyncInput['event'],
  contactInfo: ReturnType<typeof extractContactInfo>
): Promise<CRMLeadRow> {
  const { firstName, lastName } = splitName(contactInfo.fullName || 'Unknown')
  const normalizedEmail = contactInfo.email?.toLowerCase().trim() || null
  
  const { data, error } = await supabase
    .from('crm_leads')
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      phone: contactInfo.phone || 'Pending',
      business_name: contactInfo.businessName || null,
      source: 'Google Calendar Sync',
      stage: 'new',
      program_interest: null,
      notes: `[Google Calendar Event]\nTitle: ${event.summary}\nDate: ${new Date(event.start).toLocaleString()}\nDescription: ${event.description || 'No description'}\nEvent Link: ${event.htmlLink || 'No link'}\n[/Google Calendar Event]`,
      lead_temperature: 'warm',
      google_calendar_event_id: event.id,
      google_calendar_last_sync: new Date().toISOString(),
    })
    .select('*')
    .single()
  
  if (error) throw error
  return data
}

async function updateCrmLeadFromCalendarEvent(
  supabase: SupabaseClientLike,
  lead: CRMLeadRow,
  event: CalendarEventSyncInput['event'],
  contactInfo: ReturnType<typeof extractContactInfo>
): Promise<CRMLeadRow> {
  const { firstName, lastName } = splitName(contactInfo.fullName || lead.first_name)
  
  // Update existing lead with calendar event info
  const updateData: Partial<CRMLeadRow> = {
    google_calendar_event_id: event.id,
    google_calendar_last_sync: new Date().toISOString(),
  }
  
  // Only update contact info if it's missing
  if (!lead.email && contactInfo.email) {
    updateData.email = contactInfo.email.toLowerCase().trim()
  }
  if (!lead.phone || lead.phone === 'Pending') {
    updateData.phone = contactInfo.phone || 'Pending'
  }
  if (!lead.business_name && contactInfo.businessName) {
    updateData.business_name = contactInfo.businessName
  }
  if (!lead.first_name || lead.first_name === 'Unknown') {
    updateData.first_name = firstName
  }
  if (!lead.last_name) {
    updateData.last_name = lastName
  }
  
  // Update notes to include calendar event
  const eventNote = `[Google Calendar Event]\nTitle: ${event.summary}\nDate: ${new Date(event.start).toLocaleString()}\nDescription: ${event.description || 'No description'}\nEvent Link: ${event.htmlLink || 'No link'}\n[/Google Calendar Event]`
  const existingNotes = lead.notes || ''
  const updatedNotes = existingNotes.includes('[Google Calendar Event]') 
    ? existingNotes.replace(/\[Google Calendar Event\][\s\S]*?\[\/Google Calendar Event\]/, eventNote)
    : `${eventNote}\n\n${existingNotes}`
  
  updateData.notes = updatedNotes
  
  const { data, error } = await supabase
    .from('crm_leads')
    .update(updateData)
    .eq('id', lead.id)
    .select('*')
    .single()
  
  if (error) throw error
  return data
}

export async function syncCalendarEventToCrm({ supabase, settings, event }: CalendarEventSyncInput) {
  try {
    const contactInfo = extractContactInfo(event)
    
    // Skip events without identifiable contact information
    if (!contactInfo.fullName && !contactInfo.email && !contactInfo.phone) {
      console.log('[calendar-sync] Skipping event without contact info:', event.summary)
      return { action: 'skipped', reason: 'no_contact_info' }
    }
    
    const existingLead = await findExistingCrmLead(supabase, contactInfo)
    
    let result: CRMLeadRow
    let action: 'created' | 'updated' | 'skipped'
    
    if (existingLead) {
      result = await updateCrmLeadFromCalendarEvent(supabase, existingLead, event, contactInfo)
      action = 'updated'
    } else {
      result = await createCrmLeadFromCalendarEvent(supabase, event, contactInfo)
      action = 'created'
    }
    
    // Log the sync event
    await logPortalEvent({
      eventType: action === 'created' ? 'calendar_event_imported' : 'calendar_event_matched',
      category: 'calendar',
      title: `${action === 'created' ? 'Calendar Event Imported' : 'Calendar Event Matched'}: ${event.summary}`,
      message: `Calendar event "${event.summary}" ${action === 'created' ? 'created new CRM lead' : 'matched existing CRM lead'}.`,
      metadata: {
        google_event_id: event.id,
        crm_lead_id: result.id,
        contact_name: contactInfo.fullName,
        contact_email: contactInfo.email,
        business_name: contactInfo.businessName,
        event_date: event.start,
        action,
      },
      severity: 'info',
    }).catch(() => {})
    
    console.log('[calendar-sync] Event synced to CRM:', {
      action,
      eventId: event.id,
      crmLeadId: result.id,
      contactName: contactInfo.fullName,
      businessName: contactInfo.businessName,
    })
    
    return { action, crmLeadId: result.id, lead: result }
    
  } catch (error) {
    console.error('[calendar-sync] Failed to sync calendar event to CRM:', error)
    
    // Log sync failure
    await logPortalEvent({
      eventType: 'calendar_sync_failed',
      category: 'calendar',
      severity: 'error',
      title: 'Calendar Sync Failed',
      message: `Failed to sync calendar event "${event.summary}" to CRM.`,
      metadata: {
        google_event_id: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        event_summary: event.summary,
        event_date: event.start,
      },
    }).catch(() => {})
    
    throw error
  }
}

export async function syncAllCalendarEventsToCrm(supabase: SupabaseClientLike, settings: CalendarSettings) {
  if (!settings.google_client_id || !settings.google_client_secret || !settings.google_refresh_token) {
    console.log('[calendar-sync] Google Calendar not configured')
    return { synced: 0, errors: 0, events: [] }
  }
  
  try {
    // Get events from the past 30 days and next 90 days
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    
    const events = await listCalendarEvents(settings, {
      timeMin,
      timeMax,
      maxResults: 250,
    })
    
    console.log(`[calendar-sync] Found ${events.length} calendar events to sync`)
    
    let synced = 0
    let errors = 0
    const results = []
    
    for (const event of events) {
      try {
        const result = await syncCalendarEventToCrm({ supabase, settings, event })
        if (result.action !== 'skipped') {
          synced++
        }
        results.push({ eventId: event.id, result })
      } catch (error) {
        errors++
        console.error(`[calendar-sync] Failed to sync event ${event.id}:`, error)
        results.push({ eventId: event.id, error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }
    
    console.log(`[calendar-sync] Sync complete: ${synced} synced, ${errors} errors`)
    
    return { synced, errors, events: results }
    
  } catch (error) {
    console.error('[calendar-sync] Failed to sync calendar events:', error)
    throw error
  }
}
