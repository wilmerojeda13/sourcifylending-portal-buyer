import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase, userId: user.id }
}

export async function GET() {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await admin.supabase
    .from('dialer_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add status counts per campaign
  const { data: statusData } = await admin.supabase
    .from('dialer_campaign_leads')
    .select('campaign_id, status')

  const counts: Record<string, Record<string, number>> = {}
  for (const row of statusData ?? []) {
    const cid = (row as { campaign_id: string; status: string }).campaign_id
    const st  = (row as { campaign_id: string; status: string }).status
    if (!counts[cid]) counts[cid] = {}
    counts[cid][st] = (counts[cid][st] ?? 0) + 1
  }

  const campaigns = (data ?? []).map(c => ({
    ...c,
    status_counts: counts[c.id] ?? {},
  }))

  return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name: string
    description?: string
    from_campaign_id?: string
    outcome_statuses?: string[]
  }
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await admin.supabase
    .from('dialer_campaigns')
    .insert({ name: body.name.trim(), description: body.description?.trim() ?? null, created_by: admin.userId })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let lead_count = 0
  if (body.from_campaign_id && body.outcome_statuses?.length) {
    const { data: sourceLeads } = await admin.supabase
      .from('dialer_campaign_leads')
      .select('raw_lead_id')
      .eq('campaign_id', body.from_campaign_id)
      .in('status', body.outcome_statuses)
    if (sourceLeads?.length) {
      await admin.supabase.from('dialer_campaign_leads').insert(
        sourceLeads.map((l, i) => ({
          campaign_id: data.id,
          raw_lead_id: l.raw_lead_id,
          status: 'new',
          sort_order: i,
        }))
      )
      lead_count = sourceLeads.length
    }
  }

  return NextResponse.json({ campaign: data, lead_count }, { status: 201 })
}
