import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/modules/voice-agent/utils/phone'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null, supabase: null }
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return { error: 'Forbidden', status: 403, user: null, supabase: null }
  return { error: null, status: 200, user, supabase }
}

// GET /api/voice/suppression?page=&limit=
export async function GET(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '100'))
  const offset = (page - 1) * limit

  const { data, error: dbErr, count } = await supabase
    .from('voice_suppression_list')
    .select('*', { count: 'exact' })
    .order('added_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ suppressed: data ?? [], total: count ?? 0, page, limit })
}

// POST /api/voice/suppression — add phone(s) manually
export async function POST(req: NextRequest) {
  const { error, status, user, supabase } = await requireAdmin()
  if (error || !supabase || !user) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const phones: string[] = Array.isArray(body.phones) ? body.phones : [body.phone].filter(Boolean)
  const reason = body.reason ?? 'manual'

  if (phones.length === 0) return NextResponse.json({ error: 'At least one phone number is required' }, { status: 400 })

  const toInsert = []
  const errors: string[] = []

  for (const raw of phones) {
    const parsed = normalizePhone(raw)
    if (!parsed.valid) {
      errors.push(`Invalid: ${raw}`)
      continue
    }
    toInsert.push({ phone_e164: parsed.e164, reason, source: 'manual', added_by: user.id })
  }

  let inserted = 0
  if (toInsert.length > 0) {
    const { error: dbErr } = await supabase
      .from('voice_suppression_list')
      .upsert(toInsert, { onConflict: 'phone_e164' })
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
    inserted = toInsert.length

    // Also mark those leads as DNC
    for (const item of toInsert) {
      await supabase
        .from('voice_leads')
        .update({ do_not_call: true, opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('phone_e164', item.phone_e164)
    }
  }

  return NextResponse.json({ success: true, inserted, errors })
}

// DELETE /api/voice/suppression — remove from list
export async function DELETE(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const { id, phone } = body

  if (id) {
    await supabase.from('voice_suppression_list').delete().eq('id', id)
  } else if (phone) {
    const parsed = normalizePhone(phone)
    if (parsed.valid) {
      await supabase.from('voice_suppression_list').delete().eq('phone_e164', parsed.e164)
    }
  } else {
    return NextResponse.json({ error: 'Provide id or phone' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
