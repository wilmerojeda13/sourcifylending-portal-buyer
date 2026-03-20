import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { action_type, program, stage, opportunity_id, result, metadata } = body

    if (!action_type) {
      return NextResponse.json({ error: 'action_type is required' }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from('portal_events').insert({
      user_id: user.id,
      action_type,
      program: program ?? null,
      stage: stage ?? null,
      opportunity_id: opportunity_id ?? null,
      result: result ?? null,
      metadata: metadata ?? {},
    })

    if (error) {
      console.error('Event tracking error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Event track fatal:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
