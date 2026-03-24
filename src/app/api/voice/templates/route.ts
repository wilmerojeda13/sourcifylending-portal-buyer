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

// GET /api/voice/templates
export async function GET() {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { data: active } = await supabase
    .from('voice_prompt_versions')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const { data: all } = await supabase
    .from('voice_prompt_versions')
    .select('id, name, version, is_active, created_at')
    .order('created_at', { ascending: false })

  return NextResponse.json({ active, all: all ?? [] })
}

// POST /api/voice/templates — create new version and set as active
export async function POST(req: NextRequest) {
  const { error, status, user, supabase } = await requireAdmin()
  if (error || !supabase || !user) return NextResponse.json({ error }, { status })

  const body = await req.json()
  if (!body.name?.trim())          return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!body.system_prompt?.trim()) return NextResponse.json({ error: 'System prompt is required' }, { status: 400 })

  // Get current max version
  const { data: existing } = await supabase
    .from('voice_prompt_versions')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version = (existing?.version ?? 0) + 1

  // Deactivate all
  await supabase.from('voice_prompt_versions').update({ is_active: false }).eq('is_active', true)

  // Insert new
  const { data, error: dbErr } = await supabase
    .from('voice_prompt_versions')
    .insert({
      name:                          body.name.trim(),
      version,
      is_active:                     true,
      system_prompt:                 body.system_prompt,
      opening_purchased:             body.opening_purchased             || null,
      opening_facebook:              body.opening_facebook              || null,
      opening_inbound:               body.opening_inbound               || null,
      opening_other:                 body.opening_other                 || null,
      objection_not_interested:      body.objection_not_interested      || null,
      objection_busy:                body.objection_busy                || null,
      objection_send_info:           body.objection_send_info           || null,
      objection_already_funded:      body.objection_already_funded      || null,
      objection_working_with_someone:body.objection_working_with_someone|| null,
      objection_what_is_this:        body.objection_what_is_this        || null,
      objection_is_this_loan:        body.objection_is_this_loan        || null,
      objection_remove_me:           body.objection_remove_me           || null,
      created_by:                    user.id,
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}

// PATCH /api/voice/templates — activate a specific version
export async function PATCH(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabase.from('voice_prompt_versions').update({ is_active: false }).eq('is_active', true)
  await supabase.from('voice_prompt_versions').update({ is_active: true }).eq('id', id)

  return NextResponse.json({ success: true })
}
