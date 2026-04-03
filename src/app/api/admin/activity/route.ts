import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return null
  return user
}

// GET /api/admin/activity?category=&limit=
export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  const supabase = await createServiceClient()

  let query = supabase
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
    .limit(limit)

  const [{ data: notifications, error }, { count: unreadCount }] = await Promise.all([
    query,
    supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false),
  ])

  if (error) {
    console.error('[admin/activity] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }

  const normalizedEvents = (notifications ?? []).map((notification) => {
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

  const events = category && category !== 'all'
    ? normalizedEvents.filter((event) => event.event_category === category)
    : normalizedEvents

  console.log('[admin/activity] GET', {
    adminUserId: user.id,
    role: 'admin',
    category: category ?? 'all',
    limit,
    unreadCount: unreadCount ?? 0,
    eventCount: events.length,
  })

  return NextResponse.json({ events, unread_count: unreadCount ?? 0 })
}
