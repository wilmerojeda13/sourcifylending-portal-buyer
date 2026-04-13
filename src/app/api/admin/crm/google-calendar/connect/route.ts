import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  buildGoogleCalendarAuthUrl,
  encodeGoogleCalendarState,
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

export async function GET(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', req.url))

  const { searchParams, origin } = new URL(req.url)
  const next = searchParams.get('next') || '/admin/crm'
  const leadId = searchParams.get('lead_id')
  const config = getGoogleCalendarOAuthConfig(origin)

  if (!config) {
    return NextResponse.json(
      {
        error: 'Missing Google Calendar OAuth configuration.',
        required_env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
      },
      { status: 500 },
    )
  }

  const state = encodeGoogleCalendarState({ next, leadId })
  return NextResponse.redirect(buildGoogleCalendarAuthUrl(config, state))
}
