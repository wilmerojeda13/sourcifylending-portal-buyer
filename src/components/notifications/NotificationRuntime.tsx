'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getAdminNotificationCategory,
  getDesktopNotificationRoute,
  getMemberNotificationCategory,
} from '@/lib/notification-routing'
import { normalizePreferenceRecord, type NotificationPreferenceRecord } from '@/lib/notification-preferences'

type MemberNotification = {
  id: string
  title: string
  message: string
  type?: string | null
  read?: boolean
  created_at: string
}

type AdminEvent = {
  id: string
  title: string
  message: string | null
  event_type: string
  event_category?: string | null
  metadata?: Record<string, unknown> | null
  severity?: 'info' | 'success' | 'warning' | 'critical'
}

type AdminNotification = {
  id: string
  is_read: boolean
  created_at: string
  portal_events: AdminEvent | null
}

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function isDesktopNotificationSupported() {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window)) return false
  const ua = window.navigator.userAgent.toLowerCase()
  return !/iphone|ipad|android|mobile/.test(ua)
}

function readSeenIds(key: string) {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    return new Set<string>(JSON.parse(window.localStorage.getItem(key) ?? '[]'))
  } catch {
    return new Set<string>()
  }
}

function persistSeenIds(key: string, ids: Set<string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(Array.from(ids).slice(-200)))
}

export default function NotificationRuntime() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const [memberPrefs, setMemberPrefs] = useState<NotificationPreferenceRecord | null>(null)
  const [adminPrefs, setAdminPrefs] = useState<NotificationPreferenceRecord | null>(null)
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const promptedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, is_admin, active_business_profile_id')
        .eq('id', user.id)
        .single()

      if (cancelled || !profile) return

      const businessId = getCookie('sl_active_business') || profile.active_business_profile_id || profile.id
      setActiveBusinessId(businessId)
      setIsAdmin(Boolean(profile.is_admin))

      const [memberResponse, adminResponse] = await Promise.all([
        fetch('/api/notification-preferences?scope=member', { cache: 'no-store' }).catch(() => null),
        profile.is_admin ? fetch('/api/notification-preferences?scope=admin', { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
      ])

      if (cancelled) return

      const memberData = memberResponse ? await memberResponse.json().catch(() => null) : null
      const adminData = adminResponse ? await adminResponse.json().catch(() => null) : null
      setMemberPrefs(normalizePreferenceRecord('member', memberData?.preferences))
      setAdminPrefs(profile.is_admin ? normalizePreferenceRecord('admin', adminData?.preferences) : null)
    }

    bootstrap()
    return () => { cancelled = true }
  }, [supabase, pathname])

  useEffect(() => {
    if (!activeBusinessId) return

    const loadUnreadCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', activeBusinessId)
        .eq('read', false)

      window.dispatchEvent(new CustomEvent('sl-member-notification-count', { detail: count ?? 0 }))
    }

    void loadUnreadCount()

    const channel = supabase
      .channel(`member-notifications-${activeBusinessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${activeBusinessId}`,
        },
        async () => { await loadUnreadCount() },
      )
      .subscribe()

    const interval = window.setInterval(() => { void loadUnreadCount() }, 30000)

    return () => {
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [activeBusinessId, supabase])

  useEffect(() => {
    if (!activeBusinessId || !memberPrefs) return

    const seenKey = `sl-member-notification-seen:${activeBusinessId}`
    const seenIds = readSeenIds(seenKey)

    const maybeNotify = (notification: MemberNotification) => {
      if (seenIds.has(notification.id)) return
      seenIds.add(notification.id)
      persistSeenIds(seenKey, seenIds)

      const category = getMemberNotificationCategory(notification)
      const desktopSupported = isDesktopNotificationSupported()
      if (
        !desktopSupported ||
        typeof Notification === 'undefined' ||
        Notification.permission !== 'granted' ||
        !memberPrefs.desktop_enabled ||
        !memberPrefs.categories[category] ||
        !document.hidden
      ) {
        return
      }

      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        tag: `member-${notification.id}`,
      })
      browserNotification.onclick = () => {
        window.focus()
        router.push(getDesktopNotificationRoute('member', notification))
        browserNotification.close()
      }
    }

    const channel = supabase
      .channel(`member-notify-${activeBusinessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${activeBusinessId}`,
        },
        (payload) => maybeNotify(payload.new as MemberNotification),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeBusinessId, memberPrefs, router, supabase])

  useEffect(() => {
    if (!isAdmin || !adminPrefs) return

    const seenKey = 'sl-admin-notification-seen'
    const seenIds = readSeenIds(seenKey)

    const pollAdminNotifications = async () => {
      const response = await fetch('/api/admin/notifications', { cache: 'no-store' }).catch(() => null)
      if (!response?.ok) return
      const data = await response.json().catch(() => null)
      const notifications = (data?.notifications ?? []) as AdminNotification[]

      notifications.forEach((notification) => {
        if (!notification.portal_events || notification.is_read || seenIds.has(notification.id)) return
        seenIds.add(notification.id)
        persistSeenIds(seenKey, seenIds)

        const category = getAdminNotificationCategory(notification)
        if (
          !isDesktopNotificationSupported() ||
          typeof Notification === 'undefined' ||
          Notification.permission !== 'granted' ||
          !adminPrefs.desktop_enabled ||
          !adminPrefs.categories[category] ||
          !document.hidden
        ) {
          return
        }

        const browserNotification = new Notification(notification.portal_events.title || 'Admin alert', {
          body: notification.portal_events.message || 'Open the admin activity feed for details.',
          tag: `admin-${notification.id}`,
        })
        browserNotification.onclick = () => {
          window.focus()
          router.push(getDesktopNotificationRoute('admin', notification))
          browserNotification.close()
        }
      })
    }

    void pollAdminNotifications()
    const interval = window.setInterval(() => { void pollAdminNotifications() }, 30000)
    return () => window.clearInterval(interval)
  }, [adminPrefs, isAdmin, router])

  useEffect(() => {
    if (promptedRef.current || !memberPrefs) return
    if (!isDesktopNotificationSupported()) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    if (memberPrefs.desktop_enabled || memberPrefs.prompt_dismissed_at) return

    const timer = window.setTimeout(() => {
      promptedRef.current = true
      setShowPrompt(true)
    }, 15000)

    return () => window.clearTimeout(timer)
  }, [memberPrefs])

  if (!showPrompt || !memberPrefs) return null

  return (
    <div className="fixed bottom-4 right-4 z-[70] max-w-sm rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-green-500/10 p-2 text-green-600 dark:text-green-300">
          <Bell size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Enable desktop notifications</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Get important portal updates while you are on another tab. Mobile continues to use in-app notifications and badges.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const permission = await Notification.requestPermission()
                await fetch('/api/notification-preferences', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    scope: 'member',
                    desktop_enabled: permission === 'granted',
                    permission_state: permission,
                    prompt_dismissed_at: new Date().toISOString(),
                  }),
                })
                setMemberPrefs((current) => current ? {
                  ...current,
                  desktop_enabled: permission === 'granted',
                  permission_state: permission,
                  prompt_dismissed_at: new Date().toISOString(),
                } : current)
                setShowPrompt(false)
              }}
              className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/notification-preferences', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    scope: 'member',
                    prompt_dismissed_at: new Date().toISOString(),
                  }),
                })
                setMemberPrefs((current) => current ? {
                  ...current,
                  prompt_dismissed_at: new Date().toISOString(),
                } : current)
                setShowPrompt(false)
              }}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
