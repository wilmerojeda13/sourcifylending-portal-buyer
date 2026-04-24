import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { logPortalEvent } from '@/lib/portal-events'

export async function POST(req: NextRequest) {
  // Verify admin access (add your auth check here)
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  try {
    // Find webhook events to retry
    const { data: retryQueue, error: queryError } = await supabase
      .from('webhook_retry_queue')
      .select('*')
      .lt('retry_count', 3)
      .lte('next_retry_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(10)

    if (queryError) {
      return NextResponse.json({ error: 'Failed to query retry queue', details: queryError }, { status: 500 })
    }

    if (!retryQueue || retryQueue.length === 0) {
      return NextResponse.json({ retried: 0, message: 'No events to retry' })
    }

    let succeededCount = 0
    let failedCount = 0

    for (const item of retryQueue) {
      try {
        // Reconstruct the Stripe event
        const eventData = item.event_data as Record<string, unknown>
        const reconstructedEvent: Record<string, unknown> = {
          id: item.stripe_event_id,
          type: item.event_type,
          data: { object: eventData },
          created: Math.floor(new Date(item.created_at).getTime() / 1000),
        }

        console.log(`[Webhook Retry] Retrying event ${item.stripe_event_id} (attempt ${item.retry_count + 1})`)

        // Call webhook reprocessing logic here
        // For now, log that we're retrying
        await logPortalEvent({
          eventType: 'webhook_retry_attempted',
          category: 'webhooks',
          severity: 'info',
          title: `Webhook retry attempt ${item.retry_count + 1}`,
          message: `Retrying ${item.event_type} event ${item.stripe_event_id}`,
          metadata: {
            event_id: item.stripe_event_id,
            event_type: item.event_type,
            retry_count: item.retry_count + 1,
          },
        })

        // Update retry count or remove from queue
        if (item.retry_count + 1 >= 3) {
          // Max retries reached
          const { error: updateError } = await supabase
            .from('webhook_retry_queue')
            .delete()
            .eq('id', item.id)

          if (!updateError) {
            console.log(`[Webhook Retry] Max retries reached for event ${item.stripe_event_id}, removed from queue`)
            await logPortalEvent({
              eventType: 'webhook_retry_exhausted',
              category: 'webhooks',
              severity: 'error',
              title: 'Webhook retry exhausted',
              message: `Event ${item.stripe_event_id} failed after 3 retries and requires manual review`,
              metadata: {
                event_id: item.stripe_event_id,
                event_type: item.event_type,
                error_log_id: item.error_log_id,
              },
            })
          }
          failedCount++
        } else {
          // Schedule next retry (exponential backoff: 5 min -> 15 min -> 30 min)
          const backoffMinutes = [5, 15, 30][item.retry_count]
          const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

          const { error: updateError } = await supabase
            .from('webhook_retry_queue')
            .update({
              retry_count: item.retry_count + 1,
              next_retry_at: nextRetry,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)

          if (!updateError) {
            succeededCount++
          } else {
            failedCount++
          }
        }
      } catch (err) {
        console.error(`[Webhook Retry] Error processing retry for event ${item.stripe_event_id}:`, err)
        failedCount++

        // Increment retry count anyway
        await supabase
          .from('webhook_retry_queue')
          .update({
            retry_count: Math.min(item.retry_count + 1, 3),
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
      }
    }

    return NextResponse.json({
      retried: retryQueue.length,
      succeeded: succeededCount,
      failed: failedCount,
      message: `Processed ${retryQueue.length} retry events`,
    })
  } catch (err) {
    console.error('[Webhook Retry Handler] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
