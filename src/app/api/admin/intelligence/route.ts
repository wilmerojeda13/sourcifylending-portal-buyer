import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [
      { data: performance },
      { data: recentEvents },
      { data: outcomeCounts },
    ] = await Promise.all([
      supabase
        .from('opportunity_performance')
        .select('*')
        .order('total_clicks', { ascending: false })
        .limit(50),
      supabase
        .from('portal_events')
        .select('action_type, program, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('opportunity_outcomes')
        .select('outcome, program')
    ])

    // Aggregate event counts by action type
    const eventCounts: Record<string, number> = {}
    for (const e of recentEvents ?? []) {
      eventCounts[e.action_type] = (eventCounts[e.action_type] ?? 0) + 1
    }

    // Aggregate outcomes by program
    const outcomesByProgram: Record<string, { approved: number; denied: number; pending: number }> = {}
    for (const o of outcomeCounts ?? []) {
      const prog = o.program ?? 'unknown'
      if (!outcomesByProgram[prog]) outcomesByProgram[prog] = { approved: 0, denied: 0, pending: 0 }
      if (o.outcome === 'approved') outcomesByProgram[prog].approved++
      if (o.outcome === 'denied') outcomesByProgram[prog].denied++
      if (o.outcome === 'pending') outcomesByProgram[prog].pending++
    }

    return NextResponse.json({
      performance: performance ?? [],
      eventCounts,
      outcomesByProgram,
      totalOutcomes: outcomeCounts?.length ?? 0,
    })
  } catch (err) {
    console.error('Intelligence API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
