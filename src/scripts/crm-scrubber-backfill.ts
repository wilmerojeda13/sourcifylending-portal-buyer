import { createServiceClient } from '@/lib/supabase/server'
import { calculateLeadAnalytics, calculateLeadHealthScore, determineSmartStatus } from '@/lib/crm-lead-scrubber'
import { logPortalEvent } from '@/lib/portal-events'

/**
 * Historical backfill script for CRM lead scrubber
 * Processes all existing leads and applies smart status classification
 * 
 * Usage: Run this script once to backfill all historical data
 * After initial backfill, the weekly cleanup job will maintain the data
 */

async function runHistoricalBackfill() {
  console.log('[CRM Scrubber] Starting historical backfill...')
  
  const supabase = await createServiceClient()
  const startTime = Date.now()
  
  try {
    // Get all leads for backfill
    const { data: leads, error: leadsError } = await supabase
      .from('crm_leads')
      .select('id, created_at')
      .order('created_at', { ascending: true })
    
    if (leadsError) {
      console.error('[CRM Scrubber] Failed to fetch leads:', leadsError)
      throw leadsError
    }
    
    console.log(`[CRM Scrubber] Processing ${leads.length} leads for historical backfill`)
    
    const results = {
      total_processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as any[],
      status_distribution: {} as Record<string, number>,
      health_tier_distribution: {} as Record<string, number>,
    }
    
    // Process leads in batches to avoid overwhelming the database
    const batchSize = 50
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize)
      
      console.log(`[CRM Scrubber] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(leads.length / batchSize)} (${batch.length} leads)`)
      
      for (const lead of batch) {
        try {
          results.total_processed++
          
          // Calculate analytics for this lead
          const analytics = await calculateLeadAnalytics(supabase, lead.id)
          
          // Calculate health score
          const healthScore = calculateLeadHealthScore(analytics)
          
          // Determine smart status
          const smartStatus = determineSmartStatus(analytics, healthScore)
          
          // Update lead with smart status and health score
          const { error: updateError } = await supabase
            .from('crm_leads')
            .update({
              smart_status: smartStatus.status,
              smart_status_confidence: smartStatus.confidence,
              smart_status_reasons: smartStatus.reasons,
              smart_status_updated_at: smartStatus.last_updated,
              smart_status_requires_review: smartStatus.requires_review,
              lead_health_score: healthScore.score,
              lead_health_tier: healthScore.tier,
              lead_health_factors: healthScore.factors,
              lead_health_recommendations: healthScore.recommendations,
              last_scrubbed_at: new Date().toISOString(),
            })
            .eq('id', lead.id)
          
          if (updateError) {
            throw updateError
          }
          
          // Add to cleanup queue if requires review
          if (smartStatus.requires_review) {
            const { error: queueError } = await supabase
              .from('crm_lead_cleanup_queue')
              .insert({
                lead_id: lead.id,
                previous_status: null,
                new_status: smartStatus.status,
                confidence: smartStatus.confidence,
                reasons: smartStatus.reasons,
                requires_review: true,
              })
            
            if (queueError) {
              console.warn(`[CRM Scrubber] Failed to add lead ${lead.id} to cleanup queue:`, queueError)
            }
          }
          
          // Update counters
          results.successful++
          results.status_distribution[smartStatus.status] = (results.status_distribution[smartStatus.status] || 0) + 1
          results.health_tier_distribution[`tier_${healthScore.tier}`] = (results.health_tier_distribution[`tier_${healthScore.tier}`] || 0) + 1
          
        } catch (error) {
          console.error(`[CRM Scrubber] Failed to process lead ${lead.id}:`, error)
          results.failed++
          results.errors.push({
            lead_id: lead.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
      
      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < leads.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    const processingTime = Date.now() - startTime
    
    // Create backfill report
    const { error: reportError } = await supabase
      .from('crm_weekly_cleanup_reports')
      .insert({
        report_date: new Date().toISOString().split('T')[0],
        total_leads_processed: results.total_processed,
        status_counts: results.status_distribution,
        health_tier_distribution: results.health_tier_distribution,
        leads_flagged_for_review: results.status_distribution['unresponsive'] + results.status_distribution['nurture'] || 0,
        auto_approved_changes: results.total_processed - (results.status_distribution['unresponsive'] + results.status_distribution['nurture'] || 0),
        processing_time_ms: processingTime,
        error_count: results.failed,
        error_details: results.errors,
      })
    
    if (reportError) {
      console.warn('[CRM Scrubber] Failed to create backfill report:', reportError)
    }
    
    // Log completion
    await logPortalEvent({
      eventType: 'crm_scrubber_backfill_completed',
      category: 'leads' as any,
      title: 'CRM Scrubber Historical Backfill Completed',
      message: `Processed ${results.total_processed} leads in ${processingTime}ms`,
      metadata: results,
      severity: 'info' as any,
    }).catch(() => {})
    
    console.log('[CRM Scrubber] Historical backfill completed:', {
      total_processed: results.total_processed,
      successful: results.successful,
      failed: results.failed,
      processing_time_ms: processingTime,
      status_distribution: results.status_distribution,
      health_tier_distribution: results.health_tier_distribution,
    })
    
    return results
    
  } catch (error) {
    console.error('[CRM Scrubber] Historical backfill failed:', error)
    
    await logPortalEvent({
      eventType: 'crm_scrubber_backfill_failed',
      category: 'leads' as any,
      title: 'CRM Scrubber Historical Backfill Failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      metadata: { error: error instanceof Error ? error.stack : error },
      severity: 'error' as any,
    }).catch(() => {})
    
    throw error
  }
}

// Export for use in API route
export { runHistoricalBackfill }

// If this file is run directly (for manual execution)
if (require.main === module) {
  runHistoricalBackfill()
    .then(() => {
      console.log('[CRM Scrubber] Historical backfill completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('[CRM Scrubber] Historical backfill failed:', error)
      process.exit(1)
    })
}
