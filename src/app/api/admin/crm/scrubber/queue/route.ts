import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

// GET /api/admin/crm/scrubber/queue
export async function GET(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const status = searchParams.get('status')
  const requiresReview = searchParams.get('requires_review') === 'true'

  try {
    let query = supabase
      .from('crm_lead_cleanup_queue')
      .select(`
        *,
        lead:crm_leads(
          id,
          first_name,
          last_name,
          phone,
          business_name,
          stage,
          smart_status,
          lead_health_score,
          lead_health_tier
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('new_status', status)
    }

    if (requiresReview) {
      query = query.eq('requires_review', true)
    }

    const { data: queue, error, count } = await query.range(offset, offset + limit - 1)

    if (error) throw error

    return NextResponse.json({
      queue: queue || [],
      total: count || 0,
      limit,
      offset,
    })

  } catch (error) {
    console.error('[CRM Scrubber] Failed to fetch cleanup queue:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch cleanup queue', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

// POST /api/admin/crm/scrubber/queue/review
export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { queue_ids, action, admin_notes, new_status } = body

    if (!queue_ids || !Array.isArray(queue_ids) || queue_ids.length === 0) {
      return NextResponse.json({ error: 'Queue IDs are required' }, { status: 400 })
    }

    if (!['approved', 'rejected', 'modified'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    const reviewerId = user?.id

    if (!reviewerId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const results = []

    for (const queueId of queue_ids) {
      try {
        // Get queue item
        const { data: queueItem, error: queueError } = await supabase
          .from('crm_lead_cleanup_queue')
          .select('*')
          .eq('id', queueId)
          .single()

        if (queueError || !queueItem) {
          results.push({ queueId, success: false, error: 'Queue item not found' })
          continue
        }

        // Update queue item
        const updateData: any = {
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          action_taken: action,
          admin_notes: admin_notes || null,
          requires_review: false,
        }

        await supabase
          .from('crm_lead_cleanup_queue')
          .update(updateData)
          .eq('id', queueId)

        // Update lead based on action
        if (action === 'approved') {
          // Approve the suggested status change
          await supabase
            .from('crm_leads')
            .update({
              smart_status: queueItem.new_status,
              smart_status_confidence: queueItem.confidence,
              smart_status_reasons: queueItem.reasons,
              smart_status_updated_at: new Date().toISOString(),
              smart_status_requires_review: false,
            })
            .eq('id', queueItem.lead_id)

        } else if (action === 'rejected') {
          // Keep current status, just mark as reviewed
          await supabase
            .from('crm_leads')
            .update({
              smart_status_requires_review: false,
            })
            .eq('id', queueItem.lead_id)

        } else if (action === 'modified' && new_status) {
          // Apply modified status
          await supabase
            .from('crm_leads')
            .update({
              smart_status: new_status,
              smart_status_confidence: queueItem.confidence,
              smart_status_reasons: [...(queueItem.reasons as string[]), `Modified by admin: ${admin_notes || 'No reason provided'}`],
              smart_status_updated_at: new Date().toISOString(),
              smart_status_requires_review: false,
            })
            .eq('id', queueItem.lead_id)
        }

        results.push({ queueId, success: true, action })

      } catch (error) {
        console.error(`[CRM Scrubber] Error reviewing queue item ${queueId}:`, error)
        results.push({ 
          queueId, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })
      }
    }

    // Log the bulk action
    await logPortalEvent({
      eventType: 'crm_scrubber_bulk_review',
      category: 'leads' as any,
      title: 'CRM Scrubber Bulk Review',
      message: `Reviewed ${queue_ids.length} queue items with action: ${action}`,
      metadata: { action, queue_ids, results },
      severity: 'info' as any,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      results,
      processed: queue_ids.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    })

  } catch (error) {
    console.error('[CRM Scrubber] Bulk review failed:', error)
    return NextResponse.json({ 
      error: 'Bulk review failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

// DELETE /api/admin/crm/scrubber/queue/:id
export async function DELETE(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const queueId = searchParams.get('id')

  if (!queueId) {
    return NextResponse.json({ error: 'Queue ID is required' }, { status: 400 })
  }

  try {
    const { error } = await supabase
      .from('crm_lead_cleanup_queue')
      .delete()
      .eq('id', queueId)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[CRM Scrubber] Failed to delete queue item:', error)
    return NextResponse.json({ 
      error: 'Failed to delete queue item', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
