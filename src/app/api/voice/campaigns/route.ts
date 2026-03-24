import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null, supabase: null }
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { error: 'Forbidden', status: 403, user: null, supabase: null }
  return { error: null, status: 200, user, supabase }
}

// GET /api/voice/campaigns
export async function GET() {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { data, error: dbErr } = await supabase
    .from('voice_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ campaigns: data ?? [] })
}

// POST /api/voice/campaigns
export async function POST(req: NextRequest) {
  const { error, status, user, supabase } = await requireAdmin()
  if (error || !supabase || !user) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const {
    name, description, lead_source_filter, max_attempts_tier1, max_attempts_tier2,
    max_attempts_tier3, max_call_duration_seconds, quiet_hours_start, quiet_hours_end,
    timezone, b2b_mode, caller_id, transfer_number, analyzer_url,
  } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })

  const { data, error: dbErr } = await supabase
    .from('voice_campaigns')
    .insert({
      name:                     name.trim(),
      description:              description || null,
      status:                   'draft',
      lead_source_filter:       lead_source_filter ?? 'all',
      max_attempts_tier1:       max_attempts_tier1 ?? 3,
      max_attempts_tier2:       max_attempts_tier2 ?? 3,
      max_attempts_tier3:       max_attempts_tier3 ?? 2,
      max_call_duration_seconds: max_call_duration_seconds ?? 90,
      quiet_hours_start:        quiet_hours_start ?? '21:00',
      quiet_hours_end:          quiet_hours_end   ?? '09:00',
      timezone:                 timezone          ?? 'America/New_York',
      b2b_mode:                 b2b_mode          ?? true,
      caller_id:                caller_id         || null,
      transfer_number:          transfer_number   || null,
      analyzer_url:             analyzer_url      || null,
      created_by:               user.id,
      updated_at:               new Date().toISOString(),
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ campaign: data }, { status: 201 })
}
