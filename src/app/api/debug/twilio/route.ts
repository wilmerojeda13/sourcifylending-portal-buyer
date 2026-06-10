import { NextResponse } from 'next/server'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    env_vars: {
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING',
      TWILIO_API_KEY_SID: process.env.TWILIO_API_KEY_SID ? 'SET' : 'MISSING',
      TWILIO_API_KEY_SECRET: process.env.TWILIO_API_KEY_SECRET ? 'SET' : 'MISSING',
      TWILIO_TWIML_APP_SID: process.env.TWILIO_TWIML_APP_SID ? 'SET' : 'MISSING',
    },
    all_env_prefix_twilio: Object.keys(process.env)
      .filter(key => key.startsWith('TWILIO'))
      .map(key => ({ [key]: process.env[key] ? 'SET' : 'MISSING' }))
  })
}
