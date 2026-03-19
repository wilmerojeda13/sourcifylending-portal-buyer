import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ActivityFeedClient from './ActivityFeedClient'

export default async function AdminActivityPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const [{ data: events }, { count: unreadCount }] = await Promise.all([
    supabase
      .from('portal_events')
      .select(`
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
      `)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false),
  ])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <ActivityFeedClient
          initialEvents={events ?? []}
          initialUnreadCount={unreadCount ?? 0}
        />
      </div>
    </div>
  )
}
