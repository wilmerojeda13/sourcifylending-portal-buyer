import { createServiceClient } from '@/lib/supabase/server'
import PortalLayout from '@/components/layout/PortalLayout'
import { Bell, CheckCheck } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { getBusinessContext, requirePortalPageContext } from '@/lib/business-context'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, normalizeLocale, t } from '@/lib/i18n'

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
  const context = await getBusinessContext()
  if (!context) return
  const supabase = await createServiceClient()
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', context.activeBusinessId)
    .eq('read', false)
  revalidatePath('/notifications')
}

// ─── Server action to mark one as read ────────────────────────────────────────
async function markOneRead(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  if (!id) return
  const context = await getBusinessContext()
  if (!context) return
  const supabase = await createServiceClient()
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('user_id', context.activeBusinessId)
  revalidatePath('/notifications')
}

export default async function NotificationsPage() {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, activePrograms, notificationCount } = await requirePortalPageContext('/notifications')
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value)
  const text = (key: string, fallback: string) => t(locale, key, fallback)

  const [{ data: notifications }] = await Promise.all([
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', activeBusinessId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return text('notifications.justNow', 'Just now')
    if (diffMin < 60) return `${diffMin}${text('notifications.minutesAgo', 'm ago')}`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}${text('notifications.hoursAgo', 'h ago')}`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7) return `${diffD}${text('notifications.daysAgo', 'd ago')}`
    return d.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={profile?.assigned_program ?? ''}
      notificationCount={notificationCount}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      accountState={profile?.member_status === 'prospect' ? 'prospect' : 'active_member'}
      allPrograms={activePrograms}
    >
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Bell size={22} className="text-green-500" /> {text('notifications.title', 'Notifications')}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} ${text('notifications.unread', 'unread')}` : text('notifications.allCaughtUp', 'All caught up')}
            </p>
          </div>
          {unreadCount > 0 && (
            <form action={markAllRead}>
              <button
                type="submit"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-green-50 transition-colors"
              >
                <CheckCheck size={14} /> {text('notifications.markAllRead', 'Mark all read')}
              </button>
            </form>
          )}
        </div>

        {/* Notification list */}
        {!notifications || notifications.length === 0 ? (
          <div className="card text-center py-12">
            <Bell size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">{text('notifications.noNotifications', 'No notifications yet')}</p>
            <p className="text-xs text-gray-400 mt-1">
              {text('notifications.updatesHere', "You'll see updates about your program, tasks, and documents here.")}
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
                      title={text('notifications.markRead', 'Mark as read')}
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
