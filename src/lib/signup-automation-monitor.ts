import { logPortalEvent } from '@/lib/portal-events'
import { createServiceClient } from '@/lib/supabase/server'

export function getSignupAutomationErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; details?: unknown; code?: unknown }
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message
    if (typeof candidate.details === 'string' && candidate.details.trim()) return candidate.details
    if (typeof candidate.code === 'string' && candidate.code.trim()) return candidate.code
  }
  return 'unknown_error'
}

export async function recordSignupAutomationFailure(args: {
  userId?: string | null
  email?: string | null
  stage: 'profile_upsert' | 'crm_lead_create' | 'oauth_crm_lead_create' | 'oauth_profile_upsert'
  source: 'email_password' | 'google_oauth' | 'create_prospect'
  errorMessage: string
  metadata?: Record<string, unknown>
}) {
  try {
    const supabase = await createServiceClient()
    await supabase.from('signup_automation_failures').insert({
      user_id: args.userId ?? null,
      email: args.email?.trim().toLowerCase() || null,
      stage: args.stage,
      source: args.source,
      error_message: args.errorMessage,
      metadata: args.metadata ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[signup-automation-monitor] failed to persist failure', error)
  }

  await logPortalEvent({
    userId: args.userId ?? undefined,
    eventType: 'signup_automation_failed',
    category: 'accounts',
    severity: 'critical',
    title: 'Signup automation failure',
    message: args.email ?? 'Unknown email',
    metadata: {
      stage: args.stage,
      source: args.source,
      error: args.errorMessage,
      ...(args.metadata ?? {}),
    },
    sendEmail: true,
  })
}
