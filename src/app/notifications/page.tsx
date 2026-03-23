import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PortalLayout from '@/components/layout/PortalLayout'
import { Bell, CheckCheck } from 'lucide-react'
import { revalidatePath } from 'next/cache'

interface Notification {
  id: string
  title: string
  message: string
  read: boolean
  created_at: string
  type?: string
}

// ─── Server action to mark all as read ────────────────────────────────────────
async function markAllRead(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)
  revalidatePath('/notifications')
}

// ─── Server action to mark one as read ────────────────────────────────────────
async function markOneRead(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  if (!id) return
  const supabase = await createClient()
  await supabase.from('notifications').update({ read: true }).eq('id', id)
  revalidatePath('/notifications')
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7) return `${diffD}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={profile?.assigned_program ?? ''}
      notificationCount={unreadCount}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      accountState={profile?.account_state === 'prospect' ? 'prospect' : 'active_member'}
    >
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Bell size={22} className="text-green-500" /> Notifications
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          {unreadCount > 0 && (
            <form action={markAllRead}>
              <button
                type="submit"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            </form>
          )}
        </div>

        {/* Notification list */}
        {!notifications || notifications.length === 0 ? (
          <div className="card text-center py-12">
            <Bell size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">No notifications yet</p>
            <p className="text-xs text-gray-400 mt-1">
              You&apos;ll see updates about your program, tasks, and documents here.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
            {(notifications as Notification[]).map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                  !n.read ? 'bg-green-50/50 hover:bg-green-50' : 'hover:bg-gray-50'
                }`}
              >
                {/* Unread dot */}
                <div className="mt-1.5 shrink-0">
                  {!n.read
                    ? <div className="w-2 h-2 bg-green-500 rounded-full" />
                    : <div className="w-2 h-2 bg-transparent rounded-full" />
                  }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {n.title}
                  </p>
                  {n.message && (
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">{formatDate(n.created_at)}</p>
                </div>

                {/* Mark as read button */}
                {!n.read && (
                  <form action={markOneRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      title="Mark as read"
                      className="shrink-0 text-gray-300 hover:text-green-500 transition-colors mt-0.5"
                    >
                      <CheckCheck size={16} />
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
