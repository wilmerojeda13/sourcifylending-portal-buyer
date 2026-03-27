/**
 * Google Calendar REST API integration — ported from voice-server/calendar.mjs
 */

export interface CalendarSettings {
  google_client_id?:          string
  google_client_secret?:      string
  google_refresh_token?:      string
  google_calendar_id?:        string
  booking_duration_minutes?:  number
  booking_buffer_minutes?:    number
  booking_hours_start?:       string
  booking_hours_end?:         string
  booking_weekdays?:          number[]
  booking_timezone?:          string
  booking_days_ahead?:        number
  create_meet_link?:          boolean
}

export interface CalendarSlot {
  index:    number
  isoStart: string
  isoEnd:   string
  speech:   string
  timezone: string
}

async function getAccessToken(settings: CalendarSettings): Promise<string> {
  const clientId     = settings?.google_client_id     || process.env.GOOGLE_CLIENT_ID
  const clientSecret = settings?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = settings?.google_refresh_token  || process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }).toString(),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) throw new Error(`Token refresh failed: ${data.error_description || data.error || res.status}`)
  return data.access_token
}

function formatSlotSpeech(slotDate: Date, timezone: string): string {
  const nowInTz  = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
  const slotInTz = new Date(slotDate.toLocaleString('en-US', { timeZone: timezone }))

  const todayStart = new Date(nowInTz); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const slotDay = new Date(slotInTz); slotDay.setHours(0, 0, 0, 0)

  let dayLabel: string
  if (slotDay.getTime() === todayStart.getTime()) dayLabel = 'today'
  else if (slotDay.getTime() === tomorrowStart.getTime()) dayLabel = 'tomorrow'
  else dayLabel = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][slotInTz.getDay()]

  const hours = slotInTz.getHours(), minutes = slotInTz.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM', h12 = hours % 12 || 12
  const timeStr = minutes === 0 ? `${h12} ${ampm}` : `${h12}:${String(minutes).padStart(2, '0')} ${ampm}`
  return `${dayLabel} at ${timeStr}`
}

export async function getAvailableSlots(settings: CalendarSettings, numSlots = 3): Promise<CalendarSlot[]> {
  const accessToken = await getAccessToken(settings)
  const calendarId  = settings?.google_calendar_id   || 'primary'
  const durationMs  = (settings?.booking_duration_minutes || 30) * 60000
  const bufferMs    = (settings?.booking_buffer_minutes   || 15) * 60000
  const startHour   = parseInt((settings?.booking_hours_start || '09:00').split(':')[0], 10)
  const endHour     = parseInt((settings?.booking_hours_end   || '17:00').split(':')[0], 10)
  const weekdays    = settings?.booking_weekdays  || [1, 2, 3, 4, 5]
  const timezone    = settings?.booking_timezone  || 'America/New_York'
  const daysAhead   = settings?.booking_days_ahead || 5

  const now = new Date()
  const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
  const calIdEncoded = encodeURIComponent(calendarId)
  const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${calIdEncoded}/events?timeMin=${now.toISOString()}&timeMax=${windowEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=250`

  const eventsRes = await fetch(eventsUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  const eventsData = await eventsRes.json()
  if (!eventsRes.ok) throw new Error(`Events fetch failed: ${eventsData.error?.message || eventsRes.status}`)

  const busy: { start: Date; end: Date }[] = (eventsData.items || [])
    .filter((e: Record<string, unknown>) => (e.start as Record<string, string>)?.dateTime && (e.end as Record<string, string>)?.dateTime)
    .map((e: Record<string, unknown>) => ({ start: new Date((e.start as Record<string, string>).dateTime), end: new Date((e.end as Record<string, string>).dateTime) }))

  const slots: CalendarSlot[] = []
  const slotIntervalMs = 30 * 60000

  for (let d = 0; d < daysAhead && slots.length < numSlots; d++) {
    const dayBase = new Date(now); dayBase.setDate(dayBase.getDate() + d)
    const dayInTz = new Date(dayBase.toLocaleString('en-US', { timeZone: timezone }))
    if (!weekdays.includes(dayInTz.getDay())) continue

    const dayStr = dayInTz.toLocaleDateString('en-CA')
    for (
      let slotLocal = new Date(`${dayStr}T${String(startHour).padStart(2, '0')}:00:00`);
      slotLocal.getHours() < endHour;
      slotLocal = new Date(slotLocal.getTime() + slotIntervalMs)
    ) {
      if (slots.length >= numSlots) break
      const slotUtcApprox = new Date(slotLocal.toLocaleString('en-US', { timeZone: 'UTC' }))
      const slotInTzCheck = new Date(slotUtcApprox.toLocaleString('en-US', { timeZone: timezone }))
      const offsetMs = slotInTzCheck.getTime() - slotUtcApprox.getTime()
      const slotUtcStart = new Date(slotLocal.getTime() - offsetMs)
      const slotUtcEnd   = new Date(slotUtcStart.getTime() + durationMs)
      if (slotUtcStart <= now) continue
      const overlaps = busy.some(b => slotUtcStart < new Date(b.end.getTime() + bufferMs) && slotUtcEnd > new Date(b.start.getTime() - bufferMs))
      if (!overlaps) {
        slots.push({ index: slots.length, isoStart: slotUtcStart.toISOString().replace('Z',''), isoEnd: slotUtcEnd.toISOString().replace('Z',''), speech: formatSlotSpeech(slotUtcStart, timezone), timezone })
      }
    }
  }
  return slots
}

export async function createCalendarEvent(settings: CalendarSettings, details: {
  slotStart: string; slotEnd: string; timezone: string
  leadName?: string; businessName?: string; email?: string
  phone?: string; qualificationNotes?: string; callId?: string
}) {
  const accessToken = await getAccessToken(settings)
  const calendarId  = settings?.google_calendar_id || 'primary'
  const createMeet  = !!settings?.create_meet_link
  const { slotStart, slotEnd, timezone, leadName, businessName, email, phone, qualificationNotes, callId } = details

  const summary = `SourcifyLending Demo – ${leadName || businessName || 'Lead'}`
  const description = [
    leadName        && `Contact: ${leadName}`,
    businessName    && `Business: ${businessName}`,
    email           && `Email: ${email}`,
    phone           && `Phone: ${phone}`,
    callId          && `Call ID: ${callId}`,
    qualificationNotes && `\nQualification Notes:\n${qualificationNotes}`,
  ].filter(Boolean).join('\n')

  const event = {
    summary, description,
    start: { dateTime: slotStart, timeZone: timezone },
    end:   { dateTime: slotEnd,   timeZone: timezone },
    ...(email ? { attendees: [{ email }] } : {}),
    ...(createMeet ? { conferenceData: { createRequest: { requestId: `sourcify-${callId || Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
  }

  const calIdEncoded = encodeURIComponent(calendarId)
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calIdEncoded}/events${createMeet ? '?conferenceDataVersion=1&sendUpdates=all' : '?sendUpdates=all'}`
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event) })
  const created = await res.json()
  if (!res.ok) throw new Error(`Event creation failed: ${created.error?.message || res.status}`)
  return created
}
