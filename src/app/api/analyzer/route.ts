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
      primary_goal: (body.primary_goal as AnalyzerInput['primary_goal']) || 'build_ein_credit',
    }

    const result = routeAnalyzer(input)

    // Optionally save to analyzer_results if user is logged in
    try {
      const authClient = await createClient()
      const { data: { user } } = await authClient.auth.getUser()
      const supabase = await createServiceClient()
      if (user) {
        const submittedAt = new Date().toISOString()
        await supabase.from('analyzer_results').upsert({
          user_id: user.id,
          ...input,
          readiness_status: result.readiness_status,
          summary: result.summary,
          recommendation: result.recommendation,
          assigned_program: result.assigned_program,
          risk_flags: result.risk_flags,
          created_at: submittedAt,
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
          latest_analyzer_result: result,
          analyzed_at: submittedAt,
          updated_at: submittedAt,
        }).eq('id', user.id)

        // Sync to CRM leads table so admin interface sees analyzer data
        try {
          const { upsertAnalyzerCrmLead } = await import('@/lib/analyzer-crm')
          const crmResult = await upsertAnalyzerCrmLead({
            supabase,
            fullName: input.business_name || 'Unknown',
            email: user.email || '',
            phone: null,
            businessName: input.business_name,
            input,
            result,
            createIfMissing: true,
            userId: user.id,
          })
          console.log('[analyzer] CRM sync result:', {
            email: user.email,
            action: crmResult.action,
            crmLeadId: crmResult.id,
            readinessScore: result.readiness_score,
            assignedProgram: result.assigned_program,
          })
        } catch (crmErr) {
          console.error('[analyzer] Failed to sync to CRM leads table:', crmErr)
          // Log failure for debugging
          await logActivity(user.id, 'analyzer_completed', {
            error: crmErr instanceof Error ? crmErr.message : 'Unknown error',
            email: user.email,
            readiness_score: result.readiness_score,
            assigned_program: result.assigned_program,
          }, req)
        }

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
    } catch (err) {
      // Non-fatal — continue even if save fails, but log so we can diagnose notification issues
      console.error('[analyzer] Failed to save result or fire portal event notification:', err)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Analyzer error:', error)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
