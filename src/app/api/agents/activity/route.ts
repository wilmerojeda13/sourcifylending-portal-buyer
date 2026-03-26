export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 50)

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('agent_actions')
      .select('id, agent_name, action_type, title, description, status, auto_fixed, needs_review, metadata, created_at')
      .eq('user_id', user.id)
      .eq('visible_to_user', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ actions: data ?? [] })
  } catch (err) {
    console.error('[AgentActivity]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
