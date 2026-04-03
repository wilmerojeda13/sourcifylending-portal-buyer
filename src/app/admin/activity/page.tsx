import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ActivityFeedClient from './ActivityFeedClient'

type ActivityFeedEntry = {
  notification_id: string
  id: string
  user_id: string | null
  event_type: string
  event_category: string
  title: string
  message: string | null
  metadata: Record<string, unknown> | null
  severity: 'info' | 'success' | 'warning' | 'critical'
  created_by: string | null
  created_at: string
  is_read: boolean
  profiles?: {
    full_name: string | null
    email: string | null
    business_name: string | null
  } | null
}

export default async function AdminActivityPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase
      .from('admin_notifications')
      .select(`
        id,
        created_at,
        is_read,
        notification_type,
        portal_events (
          id,
          user_id,
          event_type,
          event_category,
          title,
          message,
          metadata,
          severity,
          created_by,
          created_at,
          profiles (
            full_name,
            email,
            business_name
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false),
  ])

  const events: ActivityFeedEntry[] = (notifications ?? [])
    .map((notification) => {
      const portalEvent = Array.isArray(notification.portal_events)
        ? notification.portal_events[0]
        : notification.portal_events

      if (!portalEvent) {
        return {
          notification_id: notification.id,
          id: notification.id,
          user_id: null,
          event_type: notification.notification_type ?? 'notification',
          event_category: 'alerts',
          title: 'Admin alert',
          message: 'A notification was created without a linked activity event.',
          metadata: null,
          severity: 'info',
          created_by: null,
          created_at: notification.created_at,
          is_read: notification.is_read,
          profiles: null,
        }
      }

      return {
        notification_id: notification.id,
        id: portalEvent.id,
        user_id: portalEvent.user_id,
        event_type: portalEvent.event_type,
        event_category: portalEvent.event_category,
        title: portalEvent.title,
        message: portalEvent.message,
        metadata: portalEvent.metadata,
        severity: portalEvent.severity,
        created_by: portalEvent.created_by,
        created_at: portalEvent.created_at,
        is_read: notification.is_read,
        profiles: Array.isArray(portalEvent.profiles) ? portalEvent.profiles[0] ?? null : portalEvent.profiles ?? null,
      }
    })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        <ActivityFeedClient
          initialEvents={events ?? []}
          initialUnreadCount={unreadCount ?? 0}
        />
      </div>
    </div>
  )
}
