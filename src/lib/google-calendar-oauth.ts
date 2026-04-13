export type GoogleCalendarOAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
}

const GOOGLE_CALENDAR_SCOPE = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ')

export function getGoogleCalendarOAuthConfig(origin?: string): GoogleCalendarOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || ''
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
    (origin ? `${origin.replace(/\/$/, '')}/api/admin/crm/google-calendar/callback` : '')

  if (!clientId || !clientSecret || !redirectUri) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scope: GOOGLE_CALENDAR_SCOPE,
  }
}

export function buildGoogleCalendarAuthUrl(config: GoogleCalendarOAuthConfig, state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)
  return url.toString()
}

export function encodeGoogleCalendarState(payload: { next: string; leadId?: string | null }) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeGoogleCalendarState(value: string | null) {
  if (!value) return null

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      next?: unknown
      leadId?: unknown
    }

    return {
      next: typeof parsed.next === 'string' && parsed.next.startsWith('/') ? parsed.next : '/admin/crm',
      leadId: typeof parsed.leadId === 'string' ? parsed.leadId : null,
    }
  } catch {
    return null
  }
}
