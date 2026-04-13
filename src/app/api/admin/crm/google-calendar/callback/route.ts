import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  decodeGoogleCalendarState,
  getGoogleCalendarOAuthConfig,
} from '@/lib/google-calendar-oauth'

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

  if (!profile?.is_admin) return null

  return { supabase }
}

function buildRedirect(origin: string, next: string, params: Record<string, string>) {
  const url = new URL(next, origin)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return url
}

export async function GET(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', req.url))

  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const state = decodeGoogleCalendarState(searchParams.get('state'))
  const config = getGoogleCalendarOAuthConfig(origin)

  if (!config) {
    return NextResponse.redirect(buildRedirect(origin, state?.next ?? '/admin/crm', {
      google_calendar: 'missing_env',
    }))
  }

  if (!code) {
    return NextResponse.redirect(buildRedirect(origin, state?.next ?? '/admin/crm', {
      google_calendar: 'missing_code',
    }))
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })

  const tokenJson = await tokenResponse.json()

  if (!tokenResponse.ok) {
    return NextResponse.redirect(buildRedirect(origin, state?.next ?? '/admin/crm', {
      google_calendar: 'token_failed',
    }))
  }

  if (typeof tokenJson.refresh_token !== 'string' || !tokenJson.refresh_token) {
    return NextResponse.redirect(buildRedirect(origin, state?.next ?? '/admin/crm', {
      google_calendar: 'missing_refresh_token',
    }))
  }

  const supabase = admin.supabase
  const { error } = await supabase.from('voice_agent_settings').upsert(
    {
      id: 'default',
      google_client_id: config.clientId,
      google_client_secret: config.clientSecret,
      google_refresh_token: tokenJson.refresh_token,
      google_calendar_id: process.env.GOOGLE_CALENDAR_ID || 'primary',
      booking_timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    return NextResponse.redirect(buildRedirect(origin, state?.next ?? '/admin/crm', {
      google_calendar: 'save_failed',
    }))
  }

  return NextResponse.redirect(buildRedirect(origin, state?.next ?? '/admin/crm', {
    google_calendar: 'connected',
    ...(state?.leadId ? { lead_id: state.leadId } : {}),
  }))
}
