import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export async function logWebhookError(
  supabase: ServiceClient,
  eventId: string,
  eventType: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  try {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    const { data, error: insertError } = await supabase
      .from('webhook_error_logs')
      .insert({
        stripe_event_id: eventId,
        event_type: eventType,
        error_message: errorMessage,
        error_stack: errorStack,
        context,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[Webhook Error Log] Failed to log error:', insertError)
      return null
    }

    return data?.id ?? null
  } catch (err) {
    console.error('[Webhook Error Log] Unexpected error:', err)
    return null
  }
}

export async function enqueueWebhookRetry(
  supabase: ServiceClient,
  eventId: string,
  eventType: string,
  eventData: unknown,
  errorLogId: string | null,
) {
  try {
    const { error } = await supabase.from('webhook_retry_queue').insert({
      stripe_event_id: eventId,
      event_type: eventType,
      event_data: eventData,
      error_log_id: errorLogId,
      retry_count: 0,
      next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('[Webhook Retry Queue] Failed to enqueue:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('[Webhook Retry Queue] Unexpected error:', err)
    return false
  }
}
