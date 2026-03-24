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

// POST /api/voice/campaigns/[id]/start
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { data: campaign } = await supabase
    .from('voice_campaigns')
    .select('status, total_leads')
    .eq('id', params.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status === 'completed' || campaign.status === 'archived') {
    return NextResponse.json({ error: 'Cannot start a completed or archived campaign' }, { status: 400 })
  }

  const { error: dbErr } = await supabase
    .from('voice_campaigns')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ success: true, status: 'active' })
}
