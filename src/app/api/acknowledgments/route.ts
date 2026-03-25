import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { stage, program } = await req.json() as { stage: string; program: string }

    if (!stage || !program) {
      return NextResponse.json({ error: 'stage and program required' }, { status: 400 })
    }

    const ip = (
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      null
    )
    const userAgent = req.headers.get('user-agent')

    const serviceClient = await createServiceClient()

    const { error } = await serviceClient.from('stage_acknowledgments').insert({
      user_id: user.id,
      stage,
      program,
      acknowledged_at: new Date().toISOString(),
      ip_address: ip,
      user_agent: userAgent,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('[Acknowledgment] Insert error:', error)
      return NextResponse.json({ error: 'Failed to save acknowledgment' }, { status: 500 })
    }

    await logActivity(user.id, 'stage_acknowledged', { stage, program, ip_address: ip }, req)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Acknowledgment] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET — check if user has acknowledged a specific stage
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const stage = req.nextUrl.searchParams.get('stage')
    const program = req.nextUrl.searchParams.get('program')

    let query = supabase.from('stage_acknowledgments').select('id, stage, acknowledged_at').eq('user_id', user.id)
    if (stage) query = query.eq('stage', stage)
    if (program) query = query.eq('program', program)

    const { data } = await query.order('acknowledged_at', { ascending: false })
    return NextResponse.json({ acknowledgments: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
