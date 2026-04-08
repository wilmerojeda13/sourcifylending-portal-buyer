import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { markCrmInviteEvent } from '@/lib/crm-invites'
import { ensureSignupCrmLead } from '@/lib/signup-crm'
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
      crm_invite_id?: string | null
    }

    const { result, lead_id, contact_name, business_name, crm_invite_id } = body

    if (!result?.assigned_program || !result?.readiness_status) {
      return NextResponse.json({ error: 'Invalid analyzer result' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()
    const now = new Date().toISOString()
    const normalizedEmail = user.email?.toLowerCase().trim() ?? null

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
    let resolvedLeadId = lead_id ?? null
    if (!resolvedLeadId && normalizedEmail) {
      const { data: existingLead } = await serviceClient
        .from('leads')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('source', 'free_analyzer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      resolvedLeadId = existingLead?.id ?? null
    }

    await serviceClient.from('profiles').update({
      assigned_program: result.assigned_program,
      readiness_status: result.readiness_status,
      latest_analyzer_result: result,
      analyzed_at: now,
      // Fill in name/business only if not already set
      ...(contact_name && !profile?.full_name ? { full_name: contact_name } : {}),
      ...(business_name && !profile?.business_name ? { business_name } : {}),
      ...(resolvedLeadId ? { lead_id: resolvedLeadId } : {}),
      updated_at: now,
    }).eq('id', user.id)

    // Link lead → user if provided
    if (resolvedLeadId) {
      await serviceClient
        .from('leads')
        .update({ converted_to_user_id: user.id })
        .eq('id', resolvedLeadId)
        .is('converted_to_user_id', null) // Only if not already linked
    } else if (normalizedEmail) {
      await serviceClient
        .from('leads')
        .update({ converted_to_user_id: user.id })
        .eq('email', normalizedEmail)
        .eq('source', 'free_analyzer')
        .is('converted_to_user_id', null)
    }

    if (normalizedEmail) {
      try {
        await ensureSignupCrmLead({
          supabase: serviceClient,
          userId: user.id,
          fullName: contact_name || profile?.full_name || user.user_metadata?.full_name || normalizedEmail,
          email: normalizedEmail,
          businessName: business_name || profile?.business_name || null,
          source: 'google_oauth',
          suspicious: false,
          analyzerResult: result,
        })
      } catch (crmErr) {
        console.error('CRM lead sync during analyzer claim failed (non-fatal):', crmErr)
      }
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

    if (crm_invite_id) {
      await markCrmInviteEvent(serviceClient, {
        inviteId: crm_invite_id,
        status: 'analyzer_submitted',
        createdBy: 'claim_analyzer_result',
        metadata: { source: 'claim_analyzer_result' },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('claim-analyzer-result error:', error)
    return NextResponse.json({ error: 'Failed to claim analyzer result' }, { status: 500 })
  }
}
