import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null, supabase: null }
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return { error: 'Forbidden', status: 403, user: null, supabase: null }
  return { error: null, status: 200, user, supabase }
}

// GET /api/voice/settings
export async function GET() {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { data } = await supabase
    .from('voice_agent_settings')
    .select('*')
    .eq('id', 'default')
    .single()

  // Don't expose auth token — check env existence only
  const hasTwilioConfig = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  const hasGeminiConfig = !!process.env.GEMINI_API_KEY

  return NextResponse.json({
    settings: data ?? {},
    env_status: {
      twilio_configured: hasTwilioConfig,
      gemini_configured: hasGeminiConfig,
    }
  })
}

// PUT /api/voice/settings
export async function PUT(req: NextRequest) {
  const { error, status, user, supabase } = await requireAdmin()
  if (error || !supabase || !user) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const allowed = [
    'twilio_account_sid', 'twilio_caller_id', 'transfer_number',
    'voice_server_ws_url', 'analyzer_url', 'sms_template', 'email_template',
    'email_subject', 'scoring_weights', 'retry_rules',
    'quiet_hours_start', 'quiet_hours_end', 'timezone',
    'recording_disclosure', 'max_concurrent_calls', 'b2b_mode_only',
  ]

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }
  for (const f of allowed) {
    if (f in body) updates[f] = body[f]
  }

  const { data, error: dbErr } = await supabase
    .from('voice_agent_settings')
    .update(updates)
    .eq('id', 'default')
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
