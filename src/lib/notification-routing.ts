import type { NotificationScope } from '@/lib/notification-preferences'

type MemberNotificationRow = {
  id: string
  type?: string | null
  title: string
  message: string
}

type AdminEvent = {
  event_type?: string | null
  title?: string | null
  message?: string | null
  metadata?: Record<string, unknown> | null
}

type AdminNotificationRow = {
  id: string
  portal_events?: AdminEvent | null
}

export function getMemberNotificationCategory(notification: MemberNotificationRow) {
  const haystack = `${notification.title} ${notification.message}`.toLowerCase()
  const type = `${notification.type ?? ''}`.toLowerCase()

  if (haystack.includes('support') || haystack.includes('message') || haystack.includes('reply') || type.includes('support')) return 'messages'
  if (haystack.includes('document')) return 'documents'
  if (haystack.includes('task')) return 'tasks'
  if (haystack.includes('analyzer') || haystack.includes('readiness')) return 'analyzer'
  if (haystack.includes('payment') || haystack.includes('billing') || haystack.includes('subscription')) return 'billing'
  return 'program'
}

export function getAdminNotificationCategory(notification: AdminNotificationRow) {
  const eventType = `${notification.portal_events?.event_type ?? ''}`.toLowerCase()
  const haystack = `${notification.portal_events?.title ?? ''} ${notification.portal_events?.message ?? ''}`.toLowerCase()

  if (eventType.includes('signup')) return 'signups'
  if (eventType.includes('analyzer')) return 'analyzer'
  if (eventType.includes('business') || haystack.includes('subscription required')) return 'businesses'
  if (eventType.includes('payment') || eventType.includes('subscription') || haystack.includes('payment') || haystack.includes('billing')) return 'billing'
  if (eventType.includes('support') || haystack.includes('support')) return 'support'
  if (eventType.includes('document') || haystack.includes('document')) return 'documents'
  return 'upgrades'
}

export function getMemberNotificationRoute(notification: MemberNotificationRow) {
  const haystack = `${notification.title} ${notification.message}`.toLowerCase()
  const type = `${notification.type ?? ''}`.toLowerCase()

  if (haystack.includes('support') || haystack.includes('message') || haystack.includes('reply') || type.includes('support')) return '/support'
  if (haystack.includes('document')) return '/documents'
  if (haystack.includes('task')) return '/progress'
  if (haystack.includes('analyzer') || haystack.includes('readiness')) return '/funding-results'
  if (haystack.includes('payment') || haystack.includes('billing') || haystack.includes('subscription')) return '/billing'
  if (haystack.includes('upgrade') || haystack.includes('activated') || haystack.includes('program')) return '/dashboard'
  return '/notifications'
}

export function getAdminNotificationRoute(notification: AdminNotificationRow) {
  const event = notification.portal_events
  const metadata = (event?.metadata as Record<string, unknown> | null) ?? {}
  const eventType = `${event?.event_type ?? ''}`.toLowerCase()

  const userId = typeof metadata.user_id === 'string'
    ? metadata.user_id
    : typeof metadata.profile_id === 'string'
      ? metadata.profile_id
      : typeof metadata.business_profile_id === 'string'
        ? metadata.business_profile_id
        : null

  const leadId = typeof metadata.lead_id === 'string' ? metadata.lead_id : null

  if (eventType.includes('support')) return '/admin/support'
  if (leadId && (eventType.includes('analyzer') || eventType.includes('lead') || eventType.includes('crm'))) return `/admin/crm/${leadId}`
  if (userId && (eventType.includes('signup') || eventType.includes('subscription') || eventType.includes('payment') || eventType.includes('business') || eventType.includes('document'))) {
    return `/admin/members/${userId}`
  }
  if (eventType.includes('payment') || eventType.includes('subscription')) return '/admin/revenue'
  if (eventType.includes('analyzer')) return '/admin/crm'
  return '/admin/activity'
}

export function getDesktopNotificationRoute(scope: NotificationScope, notification: MemberNotificationRow | AdminNotificationRow) {
  return scope === 'admin'
    ? getAdminNotificationRoute(notification as AdminNotificationRow)
    : getMemberNotificationRoute(notification as MemberNotificationRow)
}
