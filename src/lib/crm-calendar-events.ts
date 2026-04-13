import type { SupabaseClient } from '@supabase/supabase-js'
import { createCalendarEvent, listCalendarEvents, type CalendarEventItem, type CalendarSettings } from '@/lib/calendar'

type LeadLike = {
  id: string
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  business_name?: string | null
  likely_timezone?: string | null
  timezone_abbreviation?: string | null
  google_calendar_event_id?: string | null
}

export type LeadCalendarEvent = {
  id: string
  title: string
  description: string | null
  start: string
  end: string
  htmlLink: string | null
  status: string
  type: 'demo' | 'callback' | 'meeting' | 'event'
  source: 'google'
  timeZone: string | null
}

export type LeadCalendarSummary = {
  configured: boolean
  matched: boolean
  warning: string | null
  events: LeadCalendarEvent[]
  nextEvent: LeadCalendarEvent | null
  hasBookedDemo: boolean
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D+/g, '')
}

function buildSearchableText(event: CalendarEventItem) {
  return `${event.summary ?? ''}\n${event.description ?? ''}`.toLowerCase()
}

function inferEventType(event: CalendarEventItem): LeadCalendarEvent['type'] {
  const text = buildSearchableText(event)

  if (text.includes('demo') || text.includes('strategy call')) return 'demo'
  if (text.includes('callback')) return 'callback'
  if (text.includes('meeting') || text.includes('call')) return 'meeting'
  return 'event'
}

function matchesLead(event: CalendarEventItem, lead: LeadLike) {
  if (lead.google_calendar_event_id && event.id === lead.google_calendar_event_id) {
    return true
  }

  const text = buildSearchableText(event)
  const email = normalizeText(lead.email)
  const phone = normalizePhone(lead.phone)
  const business = normalizeText(lead.business_name)
  const fullName = normalizeText([lead.first_name, lead.last_name].filter(Boolean).join(' '))
  const firstName = normalizeText(lead.first_name)
  const lastName = normalizeText(lead.last_name)

  if (email && text.includes(email)) return true
  if (phone && phone.length >= 10 && normalizePhone(text).includes(phone)) return true
  if (business && fullName && text.includes(business) && text.includes(fullName)) return true
  if (fullName && text.includes(fullName) && /(demo|meeting|call|appointment)/i.test(text)) return true
  if (firstName && lastName && text.includes(firstName) && text.includes(lastName) && /(demo|meeting|call|appointment)/i.test(text)) return true

  return false
}

function mapEvent(event: CalendarEventItem): LeadCalendarEvent {
  return {
    id: event.id,
    title: event.summary,
    description: event.description ?? null,
    start: event.start,
    end: event.end,
    htmlLink: event.htmlLink ?? null,
    status: event.status ?? 'confirmed',
    type: inferEventType(event),
    source: 'google',
    timeZone: event.timeZone ?? null,
  }
}

export async function getCrmCalendarSettings(supabase: SupabaseClient): Promise<CalendarSettings> {
  const { data: settingsRow } = await supabase
    .from('voice_agent_settings')
    .select('google_client_id, google_client_secret, google_refresh_token, google_calendar_id, booking_timezone')
    .eq('id', 'default')
    .maybeSingle()

  return {
    google_client_id: settingsRow?.google_client_id || process.env.GOOGLE_CLIENT_ID,
    google_client_secret: settingsRow?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET,
    google_refresh_token: settingsRow?.google_refresh_token || process.env.GOOGLE_REFRESH_TOKEN,
    google_calendar_id: settingsRow?.google_calendar_id || process.env.GOOGLE_CALENDAR_ID || 'primary',
    booking_timezone: settingsRow?.booking_timezone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York',
  }
}

export function hasCalendarIntegration(settings: CalendarSettings) {
  return Boolean(settings.google_client_id && settings.google_client_secret && settings.google_refresh_token)
}

export async function getLeadCalendarSummary(
  supabase: SupabaseClient,
  lead: LeadLike,
): Promise<LeadCalendarSummary> {
  const settings = await getCrmCalendarSettings(supabase)

  if (!hasCalendarIntegration(settings)) {
    return {
      configured: false,
      matched: false,
      warning: null,
      events: [],
      nextEvent: null,
      hasBookedDemo: false,
    }
  }

  try {
    const events = await listCalendarEvents(settings, {
      timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: 250,
    })

    const mapped = events
      .filter((event) => matchesLead(event, lead))
      .map(mapEvent)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    const nextEvent =
      mapped.find((event) => event.status !== 'cancelled' && new Date(event.end || event.start).getTime() >= Date.now()) ??
      null

    return {
      configured: true,
      matched: mapped.length > 0,
      warning: null,
      events: mapped,
      nextEvent,
      hasBookedDemo: mapped.some((event) => event.type === 'demo' && event.status !== 'cancelled'),
    }
  } catch (error) {
    return {
      configured: true,
      matched: false,
      warning: null,
      events: [],
      nextEvent: null,
      hasBookedDemo: false,
    }
  }
}

export async function createLeadCalendarBooking(
  supabase: SupabaseClient,
  lead: LeadLike,
  input: {
    slotStart: string
    durationMinutes: number
    notes?: string | null
    timezone?: string | null
  },
) {
  const settings = await getCrmCalendarSettings(supabase)

  if (!hasCalendarIntegration(settings)) {
    throw new Error('Calendar integration is unavailable.')
  }

  const slotEnd = new Date(new Date(input.slotStart).getTime() + input.durationMinutes * 60 * 1000).toISOString()
  const timezone = input.timezone || lead.likely_timezone || settings.booking_timezone || 'America/New_York'
  const qualificationNotes = [
    input.notes?.trim() ? `Rep Notes: ${input.notes.trim()}` : null,
    `Timezone: ${timezone}`,
    lead.email ? `Lead Email: ${lead.email}` : null,
    lead.phone ? `Lead Phone: ${lead.phone}` : null,
  ].filter(Boolean).join('\n')

  const created = await createCalendarEvent(settings, {
    slotStart: input.slotStart,
    slotEnd,
    timezone,
    leadName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || undefined,
    businessName: lead.business_name || undefined,
    email: lead.email || undefined,
    phone: lead.phone || undefined,
    qualificationNotes,
    callId: lead.id,
  })

  const mapped: LeadCalendarEvent = {
    id: String(created.id),
    title: String(created.summary || 'SourcifyLending Demo'),
    description: typeof created.description === 'string' ? created.description : qualificationNotes || null,
    start: created.start?.dateTime || input.slotStart,
    end: created.end?.dateTime || slotEnd,
    htmlLink: typeof created.htmlLink === 'string' ? created.htmlLink : null,
    status: typeof created.status === 'string' ? created.status : 'confirmed',
    type: 'demo',
    source: 'google',
    timeZone:
      typeof created.start?.timeZone === 'string'
        ? created.start.timeZone
        : typeof created.end?.timeZone === 'string'
          ? created.end.timeZone
          : timezone,
  }

  return mapped
}
