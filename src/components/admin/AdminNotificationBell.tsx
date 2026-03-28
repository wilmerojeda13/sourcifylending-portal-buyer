'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PortalEvent {
  id: string
  user_id: string | null
  event_type: string
  event_category: string
  title: string
  message: string | null
  metadata: Record<string, unknown> | null
  severity: 'info' | 'success' | 'warning' | 'critical'
  created_at: string
}

interface AdminNotification {
  id: string
  notification_type: string
  is_read: boolean
  sent_at: string
  created_at: string
  portal_events: PortalEvent | null
}

const SEVERITY_COLORS: Record<string, string> = {
  info:     'bg-blue-50 border-blue-200',
  success:  'bg-green-50 border-green-200',
  warning:  'bg-amber-50 border-amber-200',
  critical: 'bg-red-50 border-red-200',
}

const SEVERITY_DOT: Record<string, string> = {
  info:     'bg-blue-400',
  success:  'bg-green-400',
  warning:  'bg-amber-400',
  critical: 'bg-red-500',
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function AdminNotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unread_count ?? 0)
    } catch {
      // silent — non-critical
    }
  }, [])

  // Fetch on mount and every 60 seconds
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const markAllRead = async () => {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // silent
    }
  }

  const markOneRead = async (id: string) => {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // silent
    }
  }

  const handleOpen = async () => {
    setOpen(o => !o)
    if (!open) {
      setLoading(true)
      await fetchNotifications()
      setLoading(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} className="text-gray-600 dark:text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-11 w-[360px] max-h-[520px] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-gray-500" />
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">{unreadCount} new</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <CheckCheck size={12} />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <Bell size={28} className="text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {notifications.map((n) => {
                  const ev = n.portal_events
                  const severity = ev?.severity ?? 'info'
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        'px-4 py-3 flex items-start gap-3 transition-colors',
                        !n.is_read ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
                      )}
                    >
                      <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', SEVERITY_DOT[severity])} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-snug">
                          {ev?.title ?? 'Notification'}
                        </p>
                        {ev?.message && (
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{ev.message}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">{relativeTime(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <button
                          onClick={() => markOneRead(n.id)}
                          className="flex-shrink-0 text-[10px] text-indigo-500 hover:text-indigo-700 font-medium mt-0.5 whitespace-nowrap"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
