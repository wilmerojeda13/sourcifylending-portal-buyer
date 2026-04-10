import { NextRequest, NextResponse } from 'next/server'
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
  return { supabase, userId: user.id }
}

const DIALER_STAGES = ['new', 'contacted', 'interested', 'callback', 'follow_up', 'qualified', 'promoted', 'dnc', 'closed_lost'] as const
type DialerStage = typeof DIALER_STAGES[number]

export async function GET(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stage    = searchParams.get('stage')
  const search   = searchParams.get('search')
  const page     = parseInt(searchParams.get('page') ?? '0')
  const limit    = parseInt(searchParams.get('limit') ?? '50')
  const showAll  = searchParams.get('show_all') === 'true'

  let query = admin.supabase
    .from('dialer_raw_leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (!showAll) {
    query = query.eq('is_archived', false)
  }

  if (stage && stage !== 'all') {
    query = query.eq('stage', stage)
  }

  if (search?.trim()) {
    const s = search.trim()
    query = query.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,business_name.ilike.%${s}%`,
    )
  }

  query = query.range(page * limit, (page + 1) * limit - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stage counts for active (non-archived) leads
  const { data: allActive } = await admin.supabase
    .from('dialer_raw_leads')
    .select('stage')
    .eq('is_archived', false)

  const stageCounts: Record<string, number> = {}
  for (const row of allActive ?? []) {
    const s = (row as { stage?: string }).stage ?? 'new'
    stageCounts[s] = (stageCounts[s] ?? 0) + 1
  }

  return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, limit, stageCounts })
}

export async function PATCH(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { ids: string[]; action: 'move_stage' | 'dnc' | 'archive'; stage?: string }
  const { ids, action, stage } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No lead IDs provided' }, { status: 400 })
  }

  const now = new Date().toISOString()
  let updates: Record<string, unknown> = { updated_at: now }

  if (action === 'move_stage') {
    if (!stage || !(DIALER_STAGES as readonly string[]).includes(stage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
    }
    updates.stage = stage
  } else if (action === 'dnc') {
    updates.do_not_call = true
    updates.stage = 'dnc'
    updates.is_archived = true
  } else if (action === 'archive') {
    updates.is_archived = true
    updates.stage = 'closed_lost'
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await admin.supabase
    .from('dialer_raw_leads')
    .update(updates)
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: ids.length })
}
