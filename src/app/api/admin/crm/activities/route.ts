import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('is_admin, email')
    .eq('id', user.id)
    .single()
  if (!data?.is_admin) return null
  return { supabase, email: data.email as string }
}

// GET /api/admin/crm/activities?lead_id=
export async function GET(req: NextRequest) {
  const result = await assertAdmin()
  if (!result) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lead_id = new URL(req.url).searchParams.get('lead_id')
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const { data, error } = await result.supabase
    .from('crm_activities')
    .select('*')
    .eq('lead_id', lead_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activities: data ?? [] })
}

// POST /api/admin/crm/activities
export async function POST(req: NextRequest) {
  const result = await assertAdmin()
  if (!result) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.lead_id || !body.type) {
    return NextResponse.json({ error: 'lead_id and type are required' }, { status: 400 })
  }

  const { data, error } = await result.supabase
    .from('crm_activities')
    .insert({
      lead_id:    body.lead_id,
      type:       body.type,
      body:       body.body?.trim() || null,
      metadata:   body.metadata ?? {},
      created_by: result.email ?? 'admin',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data }, { status: 201 })
}
