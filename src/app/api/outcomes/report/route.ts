import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { opportunity_id, opportunity_name, program, stage, outcome, notes } = body

    if (!opportunity_name || !outcome) {
      return NextResponse.json({ error: 'opportunity_name and outcome are required' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // Get user profile for context
    const { data: profile } = await supabase
      .from('profiles')
      .select('credit_score_range, business_age, assigned_program')
      .eq('id', user.id)
      .single()

    // Insert outcome
    const { error: outcomeError } = await supabase.from('opportunity_outcomes').insert({
      user_id: user.id,
      opportunity_id: opportunity_id ?? null,
      opportunity_name,
      program: program ?? profile?.assigned_program ?? null,
      stage: stage ?? null,
      outcome,
      credit_score_range: profile?.credit_score_range ?? null,
      business_age: profile?.business_age ?? null,
      notes: notes ?? null,
      data_source: 'user_reported',
    })

    if (outcomeError) {
      return NextResponse.json({ error: outcomeError.message }, { status: 500 })
    }

    // Also persist to opportunity_user_status so the UI can hide completed opportunities
    if (opportunity_id && outcome !== 'not_applied') {
      const statusMap: Record<string, string> = {
        approved: 'approved',
        denied:   'denied',
        pending:  'applied',
      }
      const mappedStatus = statusMap[outcome]
      if (mappedStatus) {
        await supabase
          .from('opportunity_user_status')
          .upsert(
            { user_id: user.id, opportunity_id, status: mappedStatus, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,opportunity_id' }
          )
      }
    }

    // Also track as an event
    await supabase.from('portal_events').insert({
      user_id: user.id,
      action_type: 'user_reported_result',
      program: program ?? profile?.assigned_program ?? null,
      stage: stage ?? null,
      opportunity_id: opportunity_id ?? null,
      result: outcome,
      metadata: { opportunity_name },
    })

    // Recompute performance for this opportunity
    if (opportunity_id) {
      const { data: outcomes } = await supabase
        .from('opportunity_outcomes')
        .select('outcome')
        .eq('opportunity_id', opportunity_id)
        .not('outcome', 'eq', 'not_applied')

      if (outcomes && outcomes.length > 0) {
        const total = outcomes.length
        const approved = outcomes.filter(o => o.outcome === 'approved').length
        const denied = outcomes.filter(o => o.outcome === 'denied').length
        const pending = outcomes.filter(o => o.outcome === 'pending').length
        const rate = total > 0 ? Math.round((approved / total) * 100) : null

        let tag: string = 'unknown'
        if (total >= 3) {
          if (rate !== null && rate >= 70) tag = 'high'
          else if (rate !== null && rate >= 40) tag = 'average'
          else if (rate !== null) tag = 'low'
        }

        // Get opp name
        const { data: opp } = await supabase
          .from('account_opportunities')
          .select('name')
          .eq('id', opportunity_id)
          .single()

        await supabase.from('opportunity_performance').upsert({
          opportunity_id,
          opportunity_name: opp?.name ?? opportunity_name,
          total_reported: total,
          total_approved: approved,
          total_denied: denied,
          total_pending: pending,
          approval_rate: rate,
          performance_tag: tag,
          last_computed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'opportunity_id' })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Outcome report fatal:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
