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

// GET /api/voice/leads?campaign_id=&tier=&source=&page=&limit=
export async function GET(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaign_id')
  const tier       = searchParams.get('tier')
  const source     = searchParams.get('source')
  const dnc        = searchParams.get('dnc')
  const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit      = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const offset     = (page - 1) * limit

  let query = supabase
    .from('voice_leads')
    .select('*', { count: 'exact' })
    .order('lead_quality_score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (campaignId) query = query.eq('campaign_id', campaignId)
  if (tier)       query = query.eq('lead_priority_tier', parseInt(tier))
  if (source)     query = query.eq('lead_source', source)
  if (dnc === 'true')  query = query.eq('do_not_call', true)
  if (dnc === 'false') query = query.eq('do_not_call', false)

  const { data, error: dbErr, count } = await query

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, limit })
}

// POST /api/voice/leads — add single lead
export async function POST(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const { scrubLead } = await import('@/modules/voice-agent/services/scrubbing')

  // Load suppression list
  const { data: suppressed } = await supabase
    .from('voice_suppression_list')
    .select('phone_e164')

  const suppressionSet = new Set((suppressed ?? []).map((s: { phone_e164: string }) => s.phone_e164))

  const scrubbed = scrubLead(body, suppressionSet, new Set())

  const { data, error: dbErr } = await supabase
    .from('voice_leads')
    .insert({
      ...scrubbed,
      campaign_id: body.campaign_id || null,
      flags: undefined,  // not a DB column
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ lead: data }, { status: 201 })
}
