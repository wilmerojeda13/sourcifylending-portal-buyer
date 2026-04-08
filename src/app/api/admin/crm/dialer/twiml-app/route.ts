import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
  return { userId: user.id }
}

export async function GET() {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID

  if (!accountSid || !authToken || !twimlAppSid) {
    return NextResponse.json({
      error: 'Twilio is not configured for browser dialing.',
      missing_vars: [
        !accountSid && 'TWILIO_ACCOUNT_SID',
        !authToken && 'TWILIO_AUTH_TOKEN',
        !twimlAppSid && 'TWILIO_TWIML_APP_SID',
      ].filter(Boolean),
    }, { status: 503 })
  }

  const client = twilio(accountSid, authToken)
  const app = await client.applications(twimlAppSid).fetch()

  return NextResponse.json({
    twiml_app_sid: twimlAppSid,
    friendly_name: app.friendlyName ?? null,
    voice_url: (app.voiceUrl ?? null) as string | null,
    voice_method: (app.voiceMethod ?? null) as string | null,
    status_callback: (app.statusCallback ?? null) as string | null,
    status_callback_method: (app.statusCallbackMethod ?? null) as string | null,
  })
}

