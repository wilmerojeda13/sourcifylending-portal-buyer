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

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: campaign, error } = await admin.supabase
    .from('dialer_campaigns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: statusRows } = await admin.supabase
    .from('dialer_campaign_leads')
    .select('status')
    .eq('campaign_id', params.id)
    .range(0, 999999)

  const status_counts: Record<string, number> = {}
  for (const r of statusRows ?? []) {
    status_counts[r.status] = (status_counts[r.status] ?? 0) + 1
  }

  return NextResponse.json({ campaign: { ...campaign, status_counts } })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name?: string
    description?: string
    status?: 'active' | 'paused' | 'completed' | 'archived'
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name)        updates.name        = body.name.trim()
  if (body.description !== undefined) updates.description = body.description
  if (body.status)      updates.status      = body.status

  const { data, error } = await admin.supabase
    .from('dialer_campaigns')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Hard delete — dialer_campaign_leads cascade-deletes automatically.
  // dialer_raw_leads are NOT deleted (they are the backend data layer).
  const { error } = await admin.supabase
    .from('dialer_campaigns')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
