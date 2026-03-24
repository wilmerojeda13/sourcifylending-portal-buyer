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

// GET /api/voice/calls/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const [{ data: call }, { data: events }] = await Promise.all([
    supabase
      .from('voice_calls')
      .select('*, voice_leads(*)')
      .eq('id', params.id)
      .single(),
    supabase
      .from('voice_call_events')
      .select('*')
      .eq('call_id', params.id)
      .order('timestamp', { ascending: true }),
  ])

  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  return NextResponse.json({ call, events: events ?? [] })
}
