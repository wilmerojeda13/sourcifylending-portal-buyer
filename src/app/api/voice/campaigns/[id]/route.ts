import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, supabase: null }
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { error: 'Forbidden', status: 403, supabase: null }
  return { error: null, status: 200, supabase }
}

// GET /api/voice/campaigns/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { data, error: dbErr } = await supabase
    .from('voice_campaigns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (dbErr || !data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  return NextResponse.json({ campaign: data })
}

// PUT /api/voice/campaigns/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const allowedFields = [
    'name', 'description', 'lead_source_filter', 'max_attempts_tier1',
    'max_attempts_tier2', 'max_attempts_tier3', 'max_call_duration_seconds',
    'quiet_hours_start', 'quiet_hours_end', 'timezone', 'b2b_mode',
    'caller_id', 'transfer_number', 'analyzer_url', 'script_template',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

  const { data, error: dbErr } = await supabase
    .from('voice_campaigns')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

// DELETE /api/voice/campaigns/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  // Only allow delete if draft or archived
  const { data: campaign } = await supabase
    .from('voice_campaigns')
    .select('status')
    .eq('id', params.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!['draft', 'archived'].includes(campaign.status)) {
    return NextResponse.json({ error: 'Only draft or archived campaigns can be deleted' }, { status: 400 })
  }

  const { error: dbErr } = await supabase
    .from('voice_campaigns')
    .delete()
    .eq('id', params.id)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
