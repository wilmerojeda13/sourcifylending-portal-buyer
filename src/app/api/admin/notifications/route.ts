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

// GET /api/admin/notifications — fetch unread admin_notifications joined with portal_events
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()

  const { data: notifications, error } = await supabase
    .from('admin_notifications')
    .select(`
      id,
      notification_type,
      is_read,
      sent_at,
      delivery_status,
      created_at,
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
        created_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[admin/notifications] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }

  const { count: unread_count } = await supabase
    .from('admin_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false)

  return NextResponse.json({ notifications: notifications ?? [], unread_count: unread_count ?? 0 })
}

// PATCH /api/admin/notifications — mark one or all as read
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, mark_all_read } = body as { id?: string; mark_all_read?: boolean }

  const supabase = await createServiceClient()

  if (mark_all_read) {
    const { error } = await supabase
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('is_read', false)

    if (error) {
      console.error('[admin/notifications] PATCH mark_all error:', error)
      return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  if (id) {
    const { error } = await supabase
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('id', id)

    if (error) {
      console.error('[admin/notifications] PATCH single error:', error)
      return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Provide id or mark_all_read' }, { status: 400 })
}
