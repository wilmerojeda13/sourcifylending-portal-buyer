import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, supabase: null }
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return { error: 'Forbidden', status: 403, supabase: null }
  return { error: null, status: 200, supabase }
}

// GET /api/voice/calls?campaign_id=&status=&disposition=&page=&limit=
export async function GET(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const campaignId  = searchParams.get('campaign_id')
  const callStatus  = searchParams.get('status')
  const disposition = searchParams.get('disposition')
  const page        = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit       = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const offset      = (page - 1) * limit

  let query = supabase
    .from('voice_calls')
    .select(`
      *,
      voice_leads (
        id, business_name, owner_name, phone_e164, lead_source, lead_priority_tier
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (campaignId)  query = query.eq('campaign_id', campaignId)
  if (callStatus)  query = query.eq('status', callStatus)
  if (disposition) query = query.eq('disposition', disposition)

  const { data, error: dbErr, count } = await query
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ calls: data ?? [], total: count ?? 0, page, limit })
}
