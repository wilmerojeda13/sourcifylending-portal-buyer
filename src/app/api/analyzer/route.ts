import { NextRequest, NextResponse } from 'next/server'
import { routeAnalyzer } from '@/lib/program-router'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import { logPortalEvent } from '@/lib/portal-events'
import type { AnalyzerInput } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const input: AnalyzerInput = {
      business_name: body.business_name || '',
      business_age: body.business_age || '',
      entity_type: body.entity_type || '',
      industry: body.industry || '',
      monthly_revenue_range: body.monthly_revenue_range || '',
      monthly_deposit_range: body.monthly_deposit_range || '',
      nsf_last_90_days: body.nsf_last_90_days === 'true' || body.nsf_last_90_days === true,
      credit_score_range: body.credit_score_range || '',
      utilization_range: body.utilization_range || '',
      inquiry_count_last_90_days: body.inquiry_count_last_90_days || '',
      business_credit_reporting_status: body.business_credit_reporting_status || '',
      primary_goal: body.primary_goal || 'build_ein_credit',
    }

    const result = routeAnalyzer(input)

    // Optionally save to analyzer_results if user is logged in
    try {
      const authClient = await createClient()
      const { data: { user } } = await authClient.auth.getUser()
      const supabase = await createServiceClient()
      if (user) {
        await supabase.from('analyzer_results').upsert({
          user_id: user.id,
          ...input,
          readiness_status: result.readiness_status,
          assigned_program: result.assigned_program,
          risk_flags: result.risk_flags,
          created_at: new Date().toISOString(),
        })

        // Update profile
        await supabase.from('profiles').update({
          business_name: input.business_name,
          business_age: input.business_age,
          entity_type: input.entity_type,
          industry: input.industry,
          monthly_revenue_range: input.monthly_revenue_range,
          monthly_deposit_range: input.monthly_deposit_range,
          nsf_flag: input.nsf_last_90_days,
          credit_score_range: input.credit_score_range,
          utilization_range: input.utilization_range,
          inquiry_range: input.inquiry_count_last_90_days,
          business_credit_reporting_status: input.business_credit_reporting_status,
          assigned_program: result.assigned_program,
          readiness_status: result.readiness_status,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id)

        await logActivity(user.id, 'analyzer_completed', {
          assigned_program: result.assigned_program,
          readiness_status: result.readiness_status,
        }, req)

        await logPortalEvent({
          userId: user.id,
          eventType: 'analyzer_completed',
          category: 'leads',
          title: 'Member Ran Analyzer',
          message: `${input.business_name || 'A member'} completed the business credit analyzer. Readiness: ${result.readiness_status}.`,
          metadata: {
            program: result.assigned_program,
            readiness: result.readiness_status,
            ...(result.risk_flags.length > 0 ? { risk_flags: result.risk_flags.join(', ') } : {}),
          },
          severity: 'info',
        })
      }
    } catch {
      // Non-fatal — continue even if save fails
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Analyzer error:', error)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
