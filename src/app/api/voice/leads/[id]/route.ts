import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { dispositionScoreDelta, scoreToTier } from '@/modules/voice-agent/services/scoring'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, supabase: null }
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return { error: 'Forbidden', status: 403, supabase: null }
  return { error: null, status: 200, supabase }
}

// GET /api/voice/leads/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const [{ data: lead }, { data: calls }] = await Promise.all([
    supabase.from('voice_leads').select('*').eq('id', params.id).single(),
    supabase.from('voice_calls').select('*').eq('lead_id', params.id).order('created_at', { ascending: false }),
  ])

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  return NextResponse.json({ lead, calls: calls ?? [] })
}

// PUT /api/voice/leads/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const allowed = ['notes', 'do_not_call', 'campaign_id', 'lead_source', 'geography', 'business_name', 'owner_name', 'email', 'first_name', 'last_name']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of allowed) {
    if (f in body) updates[f] = body[f]
  }

  // If marking DNC, also add to suppression list
  if (body.do_not_call === true) {
    const { data: lead } = await supabase.from('voice_leads').select('phone_e164').eq('id', params.id).single()
    if (lead?.phone_e164) {
      await supabase.from('voice_suppression_list').upsert(
        { phone_e164: lead.phone_e164, reason: 'manual', source: 'admin_edit' },
        { onConflict: 'phone_e164' }
      )
    }
  }

  const { data, error: dbErr } = await supabase
    .from('voice_leads')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}

// DELETE /api/voice/leads/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { error: dbErr } = await supabase.from('voice_leads').delete().eq('id', params.id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
