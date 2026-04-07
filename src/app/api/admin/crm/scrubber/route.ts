import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'
import { calculateLeadAnalytics, calculateLeadHealthScore, determineSmartStatus } from '@/lib/crm-lead-scrubber'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

interface CleanupReport {
  total_leads_processed: number
  status_counts: Record<string, number>
  health_tier_distribution: Record<string, number>
  leads_flagged_for_review: number
  auto_approved_changes: number
  processing_time_ms: number
  error_count: number
  error_details: any[]
}

// POST /api/admin/crm/scrubber/run
export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const startTime = Date.now()
    const body = await req.json()
    const { dry_run = false, force_backfill = false } = body

    console.log('[CRM Scrubber] Starting cleanup job', { dry_run, force_backfill })

    // Get all leads that need processing
    let query = supabase.from('crm_leads').select('id')
    
    // For regular runs, only process leads not recently scrubbed
    if (!force_backfill) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      query = query.or(`last_scrubbed_at.is.null,last_scrubbed_at.lt.${sevenDaysAgo}`)
    }

    const { data: leads, error: leadsError } = await query
    if (leadsError) throw leadsError

    console.log(`[CRM Scrubber] Processing ${leads.length} leads`)

    const report: CleanupReport = {
      total_leads_processed: leads.length,
      status_counts: {},
      health_tier_distribution: {},
      leads_flagged_for_review: 0,
      auto_approved_changes: 0,
      processing_time_ms: 0,
      error_count: 0,
      error_details: [],
    }

    // Process each lead
    for (const lead of leads) {
      try {
        const result = await processLead(supabase, lead.id, dry_run)
        
        // Update counters
        report.status_counts[result.status] = (report.status_counts[result.status] || 0) + 1
        report.health_tier_distribution[`tier_${result.health_tier}`] = (report.health_tier_distribution[`tier_${result.health_tier}`] || 0) + 1
        
        if (result.requires_review) {
          report.leads_flagged_for_review++
        } else {
          report.auto_approved_changes++
        }

      } catch (error) {
        console.error(`[CRM Scrubber] Error processing lead ${lead.id}:`, error)
        report.error_count++
        report.error_details.push({
          lead_id: lead.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const processingTime = Date.now() - startTime
    report.processing_time_ms = processingTime

    // Create weekly report
    if (!dry_run) {
      await saveCleanupReport(supabase, report)
    }

    // Log the completion
    await logPortalEvent({
      eventType: force_backfill ? 'crm_scrubber_backfill' : 'crm_scrubber_weekly',
      category: 'leads' as any,
      title: force_backfill ? 'CRM Scrubber Backfill Completed' : 'CRM Weekly Scrubber Completed',
      message: `Processed ${report.total_leads_processed} leads in ${processingTime}ms`,
      metadata: report as Record<string, unknown>,
      severity: 'info' as any,
    }).catch(() => {})

    console.log('[CRM Scrubber] Cleanup job completed', report)

    return NextResponse.json({
      success: true,
      report,
      dry_run,
    })

  } catch (error) {
    console.error('[CRM Scrubber] Cleanup job failed:', error)
    
    await logPortalEvent({
      eventType: 'crm_scrubber_failed',
      category: 'leads' as any,
      title: 'CRM Scrubber Failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: { error: error instanceof Error ? error.stack : error },
      severity: 'error' as any,
    }).catch(() => {})

    return NextResponse.json({ 
      error: 'Cleanup job failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

// GET /api/admin/crm/scrubber/reports
export async function GET(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '10')
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    const { data: reports, error } = await supabase
      .from('crm_weekly_cleanup_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const { count, error: countError } = await supabase
      .from('crm_weekly_cleanup_reports')
      .select('*', { count: 'exact', head: true })

    if (countError) throw countError

    return NextResponse.json({
      reports: reports || [],
      total: count || 0,
      limit,
      offset,
    })

  } catch (error) {
    console.error('[CRM Scrubber] Failed to fetch reports:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch reports', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

async function processLead(supabase: any, leadId: string, dryRun: boolean) {
  // Calculate analytics
  const analytics = await calculateLeadAnalytics(supabase, leadId)
  
  // Calculate health score
  const healthScore = calculateLeadHealthScore(analytics)
  
  // Determine smart status
  const smartStatus = determineSmartStatus(analytics, healthScore)

  // Get current lead data for comparison
  const { data: currentLead } = await supabase
    .from('crm_leads')
    .select('smart_status, smart_status_updated_at')
    .eq('id', leadId)
    .single()

  const statusChanged = currentLead?.smart_status !== smartStatus.status
  const requiresReview = smartStatus.requires_review && statusChanged

  if (!dryRun && statusChanged) {
    // Update lead with new smart status
    await supabase
      .from('crm_leads')
      .update({
        smart_status: smartStatus.status,
        smart_status_confidence: smartStatus.confidence,
        smart_status_reasons: smartStatus.reasons,
        smart_status_updated_at: smartStatus.last_updated,
        smart_status_requires_review: requiresReview,
        lead_health_score: healthScore.score,
        lead_health_tier: healthScore.tier,
        lead_health_factors: healthScore.factors,
        lead_health_recommendations: healthScore.recommendations,
        last_scrubbed_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    // Add to cleanup queue if requires review
    if (requiresReview) {
      await supabase
        .from('crm_lead_cleanup_queue')
        .insert({
          lead_id: leadId,
          previous_status: currentLead?.smart_status || null,
          new_status: smartStatus.status,
          confidence: smartStatus.confidence,
          reasons: smartStatus.reasons,
          requires_review: true,
        })
    }
  } else if (!dryRun) {
    // Just update the scrubbed timestamp
    await supabase
      .from('crm_leads')
      .update({
        last_scrubbed_at: new Date().toISOString(),
      })
      .eq('id', leadId)
  }

  return {
    lead_id: leadId,
    status: smartStatus.status,
    confidence: smartStatus.confidence,
    health_score: healthScore.score,
    health_tier: healthScore.tier,
    requires_review: requiresReview,
    status_changed: statusChanged,
  }
}

async function saveCleanupReport(supabase: any, report: CleanupReport) {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  
  await supabase
    .from('crm_weekly_cleanup_reports')
    .upsert({
      report_date: today,
      total_leads_processed: report.total_leads_processed,
      status_counts: report.status_counts,
      health_tier_distribution: report.health_tier_distribution,
      leads_flagged_for_review: report.leads_flagged_for_review,
      auto_approved_changes: report.auto_approved_changes,
      processing_time_ms: report.processing_time_ms,
      error_count: report.error_count,
      error_details: report.error_details,
    }, {
      onConflict: 'report_date'
    })
}
