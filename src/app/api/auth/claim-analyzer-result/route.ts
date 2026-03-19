import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AnalyzerResult } from '@/types'

export async function POST(req: NextRequest) {
  try {
    // Must be authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as {
      result: AnalyzerResult
      lead_id?: string | null
      contact_name?: string | null
      business_name?: string | null
    }

    const { result, lead_id, contact_name, business_name } = body

    if (!result?.assigned_program || !result?.readiness_status) {
      return NextResponse.json({ error: 'Invalid analyzer result' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()
    const now = new Date().toISOString()

    // Only apply if profile doesn't already have a result saved (idempotency)
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('latest_analyzer_result, full_name, business_name')
      .eq('id', user.id)
      .single()

    if (profile?.latest_analyzer_result) {
      // Already has results — skip (could be a duplicate call)
      return NextResponse.json({ success: true, skipped: true })
    }

    // Apply analyzer results to profile
    await serviceClient.from('profiles').update({
      assigned_program: result.assigned_program,
      readiness_status: result.readiness_status,
      latest_analyzer_result: result,
      analyzed_at: now,
      // Fill in name/business only if not already set
      ...(contact_name && !profile?.full_name ? { full_name: contact_name } : {}),
      ...(business_name && !profile?.business_name ? { business_name } : {}),
      ...(lead_id ? { lead_id } : {}),
      updated_at: now,
    }).eq('id', user.id)

    // Link lead → user if provided
    if (lead_id) {
      await serviceClient
        .from('leads')
        .update({ converted_to_user_id: user.id })
        .eq('id', lead_id)
        .is('converted_to_user_id', null) // Only if not already linked
    }

    // Log activity
    await serviceClient.from('activity_logs').insert({
      user_id: user.id,
      event_type: 'analyzer_result_claimed',
      event_data: {
        source: 'google_oauth',
        program_recommended: result.assigned_program,
        readiness_status: result.readiness_status,
      },
      created_at: now,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('claim-analyzer-result error:', error)
    return NextResponse.json({ error: 'Failed to claim analyzer result' }, { status: 500 })
  }
}
