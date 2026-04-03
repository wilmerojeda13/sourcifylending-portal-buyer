import { createServiceClient } from '@/lib/supabase/server'

export type EventCategory = 'accounts' | 'billing' | 'subscriptions' | 'support' | 'documents' | 'funding' | 'reports' | 'leads'
export type EventSeverity = 'info' | 'success' | 'warning' | 'critical'

export interface PortalEventOptions {
  userId?: string
  eventType: string
  category: EventCategory
  title: string
  message?: string
  metadata?: Record<string, unknown>
  severity?: EventSeverity
  createdBy?: string
  sendEmail?: boolean
}

async function insertLegacyPortalEvent(supabase: Awaited<ReturnType<typeof createServiceClient>>, opts: PortalEventOptions) {
  if (!opts.userId) {
    return { data: null, error: new Error('legacy_portal_events_requires_user_id') }
  }

  return supabase
    .from('portal_events')
    .insert({
      user_id: opts.userId,
      action_type: opts.eventType,
      result: opts.severity ?? 'info',
      metadata: {
        title: opts.title,
        message: opts.message ?? null,
        event_category: opts.category,
        severity: opts.severity ?? 'info',
        created_by: opts.createdBy ?? null,
        ...(opts.metadata ?? {}),
      },
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()
}

const HIGH_PRIORITY_EVENTS = [
  'account_created',
  'subscription_created',
  'payment_succeeded',
  'payment_failed',
  'support_message_sent',
  'manual_activation',
  'subscription_reactivated',
  'subscription_canceled',
  'delegate_invited',
  'invite_sent',
  'signup_requested',
  'analyzer_completed',
  'new_lead_analyzer',
  'underwriting_completed',
  'underwriting_disqualified',
  'checkout_completed',
  'add_on_purchased',
]

async function sendAdminEmail(title: string, message: string | undefined, metadata: Record<string, unknown> | undefined, userId: string | undefined, severity: EventSeverity): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return

  const metaRows = metadata && Object.keys(metadata).length > 0
    ? Object.entries(metadata)
        .map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top">${k.replace(/_/g, ' ')}</td><td style="padding:6px 0;font-size:13px">${String(v)}</td></tr>`)
        .join('')
    : ''

  const severityColor: Record<EventSeverity, string> = {
    info: '#3b82f6',
    success: '#16a34a',
    warning: '#d97706',
    critical: '#dc2626',
  }

  const adminLink = userId
    ? `<p style="margin-top:20px"><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.sourcifylending.com'}/admin/members/${userId}" style="color:#16a34a;text-decoration:underline;font-size:13px">View member in admin →</a></p>`
    : ''

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <div style="background:${severityColor[severity]};padding:20px 28px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:16px;font-weight:700;margin:0">${title}</p>
        <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:4px 0 0">Severity: ${severity.toUpperCase()} &bull; ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 12px 12px">
        ${message ? `<p style="font-size:14px;color:#374151;margin:0 0 16px;line-height:1.6">${message}</p>` : ''}
        ${metaRows ? `<table style="width:100%;border-collapse:collapse;margin-top:8px">${metaRows}</table>` : ''}
        ${adminLink}
        <p style="margin-top:24px;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px">SourcifyLending Admin Notification &bull; Portal Events System</p>
      </div>
    </div>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'SourcifyLending Portal <no-reply@ai.sourcifylending.com>',
      to: ['abel@sourcifylending.com'],
      subject: `[SourcifyLending] ${title}`,
      html,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error('[portal-events] Resend admin email failed', {
      status: response.status,
      statusText: response.statusText,
      title,
      userId,
      severity,
      errorText,
    })
  }
}

export async function logPortalEvent(opts: PortalEventOptions): Promise<void> {
  try {
    const {
      userId,
      eventType,
      category,
      title,
      message,
      metadata,
      severity = 'info',
      createdBy,
      sendEmail,
    } = opts

    const supabase = await createServiceClient()

    // Insert into portal_events
    let { data: eventRow, error: eventError } = await supabase
      .from('portal_events')
      .insert({
        user_id: userId ?? null,
        event_type: eventType,
        event_category: category,
        title,
        message: message ?? null,
        metadata: metadata ?? null,
        severity,
        created_by: createdBy ?? null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (eventError?.code === '42703' || eventError?.message?.includes('portal_events')) {
      const legacyInsert = await insertLegacyPortalEvent(supabase, opts)
      eventRow = legacyInsert.data
      eventError = legacyInsert.error
    }

    if (eventError || !eventRow) {
      console.error('[portal-events] Failed to insert portal_event:', eventError)
      return
    }

    // Insert into admin_notifications
    const { error: notificationError } = await supabase.from('admin_notifications').insert({
      event_id: eventRow.id,
      notification_type: 'in_app',
      is_read: false,
      sent_at: new Date().toISOString(),
      delivery_status: 'delivered',
    })

    if (notificationError) {
      console.error('[portal-events] Failed to insert admin_notification:', notificationError, {
        eventType,
        title,
        userId,
      })
    }

    // Determine whether to send email
    const isHighPriority = HIGH_PRIORITY_EVENTS.includes(eventType)
    const isHighSeverity = severity === 'warning' || severity === 'critical'
    const shouldSendEmail = sendEmail === true || isHighSeverity || isHighPriority

    if (shouldSendEmail) {
      try {
        await sendAdminEmail(title, message, metadata, userId, severity)
      } catch (emailErr) {
        console.error('[portal-events] Email send failed:', emailErr)
      }
    }
  } catch (err) {
    // Never throw — fire-and-forget
    console.error('[portal-events] Unexpected error in logPortalEvent:', err)
  }
}
