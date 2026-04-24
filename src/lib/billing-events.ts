import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export type BillingEventType =
  | 'payment_logged'
  | 'setup_fee_paid'
  | 'recurring_payment'
  | 'subscription_activated'
  | 'payment_failed'
  | 'analyzer_results_linked'

export async function logBillingEvent(
  supabase: ServiceClient,
  userId: string,
  eventType: BillingEventType,
  metadata?: Record<string, unknown>,
) {
  try {
    const { error } = await supabase.from('activity_events').insert({
      user_id: userId,
      event_type: eventType,
      event_category: 'billing',
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('[Billing Event] Failed to log event:', { userId, eventType, error })
      return false
    }

    console.log('[Billing Event] Logged:', { userId, eventType })
    return true
  } catch (err) {
    console.error('[Billing Event] Unexpected error:', { userId, eventType, err })
    return false
  }
}
