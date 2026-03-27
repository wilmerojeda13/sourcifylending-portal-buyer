import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

// GET /api/admin/crm/leads?stage=&source=&program=&search=&follow_up_due=&archived=
export async function GET(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stage        = searchParams.get('stage')
  const source       = searchParams.get('source')
  const program      = searchParams.get('program')
  const search       = searchParams.get('search')
  const followUpDue  = searchParams.get('follow_up_due')
  const archived     = searchParams.get('archived') === 'true'

  let query = supabase
    .from('crm_leads')
    .select('*', { count: 'exact' })
    .eq('is_archived', archived)
    .order('follow_up_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (stage)       query = query.eq('stage', stage)
  if (source)      query = query.eq('source', source)
  if (program)     query = query.eq('program_interest', program)
  if (followUpDue === 'true') {
    query = query.lte('follow_up_at', new Date().toISOString()).not('follow_up_at', 'is', null)
  }
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,business_name.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data ?? [], total: count ?? 0 })
}

// POST /api/admin/crm/leads
export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.first_name?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ error: 'First name and phone are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('crm_leads')
    .insert({
      first_name:       body.first_name.trim(),
      last_name:        body.last_name?.trim() ?? '',
      phone:            body.phone.trim(),
      email:            body.email?.trim() || null,
      business_name:    body.business_name?.trim() || null,
      stage:            body.stage ?? 'new',
      program_interest: body.program_interest || null,
      source:           body.source ?? 'manual',
      notes:            body.notes?.trim() || null,
      follow_up_at:     body.follow_up_at || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data }, { status: 201 })
}
