/**
 * Google Calendar REST API integration for SourcifyLending Voice Agent
 * Uses OAuth2 refresh tokens — no SDK dependencies, fetch only.
 */

/**
 * Exchange a refresh token for a fresh access token.
 * @param {Object} settings - voice_agent_settings row
 * @returns {Promise<string>} access_token
 */
export async function getAccessToken(settings) {
  const clientId     = settings?.google_client_id     || process.env.GOOGLE_CLIENT_ID
  const clientSecret = settings?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = settings?.google_refresh_token  || process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('[CALENDAR] Missing Google OAuth credentials: google_client_id, google_client_secret, or google_refresh_token not set')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }).toString(),
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`[CALENDAR] Token refresh failed: ${data.error_description || data.error || res.status}`)
  }
  return data.access_token
}

/**
 * Format a Date for speech in a given timezone.
 * Returns e.g. "today at 10 AM", "tomorrow at 2:30 PM", "Monday at 9 AM"
 */
function formatSlotSpeech(slotDate, timezone) {
  // Get "today" in the target timezone
  const nowInTz    = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
  const slotInTz   = new Date(slotDate.toLocaleString('en-US', { timeZone: timezone }))

  const todayStart = new Date(nowInTz)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const dayAfterStart = new Date(tomorrowStart)
  dayAfterStart.setDate(dayAfterStart.getDate() + 1)

  const slotDay = new Date(slotInTz)
  slotDay.setHours(0, 0, 0, 0)

  let dayLabel
  if (slotDay.getTime() === todayStart.getTime()) {
    dayLabel = 'today'
  } else if (slotDay.getTime() === tomorrowStart.getTime()) {
    dayLabel = 'tomorrow'
  } else {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    dayLabel = days[slotInTz.getDay()]
  }

  const hours   = slotInTz.getHours()
  const minutes = slotInTz.getMinutes()
  const ampm    = hours >= 12 ? 'PM' : 'AM'
  const h12     = hours % 12 || 12
  const timeStr = minutes === 0 ? `${h12} ${ampm}` : `${h12}:${String(minutes).padStart(2, '0')} ${ampm}`

  return `${dayLabel} at ${timeStr}`
}

/**
 * Retrieve available calendar slots for booking.
 * @param {Object} settings - voice_agent_settings row
 * @param {number} numSlots - how many slots to return
 * @returns {Promise<Array>} array of slot objects
 */
export async function getAvailableSlots(settings, numSlots = 3) {
  const accessToken  = await getAccessToken(settings)
  const calendarId   = settings?.google_calendar_id   || 'primary'
  const durationMs   = (settings?.booking_duration_minutes || 30) * 60000
  const bufferMs     = (settings?.booking_buffer_minutes   || 15) * 60000
  const startHour    = parseInt((settings?.booking_hours_start || '09:00').split(':')[0], 10)
  const endHour      = parseInt((settings?.booking_hours_end   || '17:00').split(':')[0], 10)
  const weekdays     = settings?.booking_weekdays  || [1, 2, 3, 4, 5]
  const timezone     = settings?.booking_timezone  || 'America/New_York'
  const daysAhead    = settings?.booking_days_ahead || 5

  // Fetch existing events for the window
  const now      = new Date()
  const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

  const calIdEncoded = encodeURIComponent(calendarId)
  const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${calIdEncoded}/events` +
    `?timeMin=${now.toISOString()}&timeMax=${windowEnd.toISOString()}` +
    `&singleEvents=true&orderBy=startTime&maxResults=250`

  const eventsRes = await fetch(eventsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const eventsData = await eventsRes.json()
  if (!eventsRes.ok) {
    throw new Error(`[CALENDAR] Events fetch failed: ${eventsData.error?.message || eventsRes.status}`)
  }

  // Build busy intervals
  const busy = (eventsData.items || [])
    .filter(e => e.start?.dateTime && e.end?.dateTime)
    .map(e => ({ start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) }))

  // Iterate over days and collect available slots
  const slots = []
  const slotIntervalMs = 30 * 60000 // candidate every 30 min

  for (let d = 0; d < daysAhead && slots.length < numSlots; d++) {
    // Build date in target timezone
    const dayBase = new Date(now)
    dayBase.setDate(dayBase.getDate() + d)

    // Get day-of-week in the booking timezone
    const dayInTz = new Date(dayBase.toLocaleString('en-US', { timeZone: timezone }))
    const dow = dayInTz.getDay()

    if (!weekdays.includes(dow)) continue

    // Generate candidates from startHour to endHour
    // Build the start of this day in the target timezone
    const dayStr = dayInTz.toLocaleDateString('en-CA') // YYYY-MM-DD
    const candidateStart = new Date(`${dayStr}T${String(startHour).padStart(2, '0')}:00:00`)
    // Convert from timezone-local to UTC: use offset trick
    const localOffset = new Date(candidateStart.toLocaleString('en-US', { timeZone: timezone })).getTime() - candidateStart.getTime()

    // Walk through time slots
    for (
      let slotLocal = new Date(`${dayStr}T${String(startHour).padStart(2, '0')}:00:00`);
      slotLocal.getHours() < endHour;
      slotLocal = new Date(slotLocal.getTime() + slotIntervalMs)
    ) {
      if (slots.length >= numSlots) break

      // Convert this local time to UTC properly via toLocaleString round-trip
      // Build actual UTC start for this local slot
      const slotUtcApprox = new Date(slotLocal.toLocaleString('en-US', { timeZone: 'UTC' }))
      // Get what timezone thinks this UTC time is
      const slotInTzCheck = new Date(slotUtcApprox.toLocaleString('en-US', { timeZone: timezone }))
      // Compute offset: slotInTzCheck (local) - slotUtcApprox (utc) = offset
      const offsetMs = slotInTzCheck.getTime() - slotUtcApprox.getTime()
      // Actual UTC start = local naive time - offset
      const slotUtcStart = new Date(slotLocal.getTime() - offsetMs)
      const slotUtcEnd   = new Date(slotUtcStart.getTime() + durationMs)

      // Skip if in the past
      if (slotUtcStart <= now) continue

      // Check overlap with busy intervals (add buffer around busy time)
      const overlaps = busy.some(b => {
        const bufferedStart = new Date(b.start.getTime() - bufferMs)
        const bufferedEnd   = new Date(b.end.getTime()   + bufferMs)
        return slotUtcStart < bufferedEnd && slotUtcEnd > bufferedStart
      })

      if (!overlaps) {
        const isoStart = slotUtcStart.toISOString().replace('Z', '')
        const isoEnd   = slotUtcEnd.toISOString().replace('Z', '')
        const speech   = formatSlotSpeech(slotUtcStart, timezone)

        slots.push({
          index:    slots.length,
          isoStart,
          isoEnd,
          speech,
          timezone,
        })
      }
    }
  }

  return slots
}

/**
 * Create a Google Calendar event.
 * @param {Object} settings - voice_agent_settings row
 * @param {Object} details - booking details
 * @returns {Promise<Object>} created event object
 */
export async function createCalendarEvent(settings, {
  slotStart,
  slotEnd,
  timezone,
  leadName,
  businessName,
  email,
  phone,
  leadSource,
  qualificationNotes,
  analyzerLinkSent,
  callId,
}) {
  const accessToken = await getAccessToken(settings)
  const calendarId  = settings?.google_calendar_id || 'primary'
  const createMeet  = !!settings?.create_meet_link

  const summary = `SourcifyLending – ${leadName || businessName || 'Lead'}`

  const descLines = [
    leadName        ? `Contact: ${leadName}`          : null,
    businessName    ? `Business: ${businessName}`      : null,
    email           ? `Email: ${email}`                : null,
    phone           ? `Phone: ${phone}`                : null,
    leadSource      ? `Lead Source: ${leadSource}`     : null,
    callId          ? `Call ID: ${callId}`             : null,
    qualificationNotes ? `\nQualification Notes:\n${qualificationNotes}` : null,
    analyzerLinkSent ? `\nAnalyzer link was sent during call.` : null,
  ].filter(Boolean)

  const description = descLines.join('\n')

  const event = {
    summary,
    description,
    start: { dateTime: slotStart, timeZone: timezone },
    end:   { dateTime: slotEnd,   timeZone: timezone },
    ...(email ? { attendees: [{ email }] } : {}),
    ...(createMeet ? {
      conferenceData: {
        createRequest: {
          requestId: `sourcify-${callId || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        }
      }
    } : {}),
  }

  const calIdEncoded = encodeURIComponent(calendarId)
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calIdEncoded}/events` +
    (createMeet ? '?conferenceDataVersion=1&sendUpdates=all' : '?sendUpdates=all')

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  const created = await res.json()
  if (!res.ok) {
    throw new Error(`[CALENDAR] Event creation failed: ${created.error?.message || res.status}`)
  }

  console.log(`[CALENDAR] Event created: ${created.id} | ${summary}`)
  return created
}
