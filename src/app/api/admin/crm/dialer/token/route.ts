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
  const apiKeySid = process.env.TWILIO_API_KEY_SID
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return NextResponse.json({
      error: 'Browser dialing is not configured. Required: TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID.',
      missing_vars: [
        !accountSid && 'TWILIO_ACCOUNT_SID',
        !apiKeySid && 'TWILIO_API_KEY_SID',
        !apiKeySecret && 'TWILIO_API_KEY_SECRET',
        !twimlAppSid && 'TWILIO_TWIML_APP_SID',
      ].filter(Boolean),
    }, { status: 503 })
  }

  const { AccessToken } = twilio.jwt
  const { VoiceGrant } = AccessToken

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: `rep-${admin.userId}`,
    ttl: 3600,
  })

  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: false,
  }))

  return NextResponse.json({ token: token.toJwt(), identity: `rep-${admin.userId}` })
}
