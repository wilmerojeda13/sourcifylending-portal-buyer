'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, Loader2, Monitor, Smartphone, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ADMIN_NOTIFICATION_CATEGORY_LABELS,
  DEFAULT_ADMIN_NOTIFICATION_CATEGORIES,
  DEFAULT_MEMBER_NOTIFICATION_CATEGORIES,
  MEMBER_NOTIFICATION_CATEGORY_LABELS,
  normalizePreferenceRecord,
  type NotificationPreferenceRecord,
  type NotificationScope,
} from '@/lib/notification-preferences'

type Props = {
  scope: NotificationScope
  title: string
  description: string
}

const LABELS = {
  member: MEMBER_NOTIFICATION_CATEGORY_LABELS,
  admin: ADMIN_NOTIFICATION_CATEGORY_LABELS,
}

const DEFAULTS = {
  member: DEFAULT_MEMBER_NOTIFICATION_CATEGORIES,
  admin: DEFAULT_ADMIN_NOTIFICATION_CATEGORIES,
}

function isDesktopCapableBrowser() {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window)) return false
  const ua = window.navigator.userAgent.toLowerCase()
  return !/iphone|ipad|android|mobile/.test(ua)
}

export default function NotificationPreferencesCard({ scope, title, description }: Props) {
  const [preferences, setPreferences] = useState<NotificationPreferenceRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const categoryLabels = useMemo(() => LABELS[scope], [scope])
  const desktopCapable = isDesktopCapableBrowser()

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch(`/api/notification-preferences?scope=${scope}`, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to load notification settings')
        if (cancelled) return
        setPreferences(normalizePreferenceRecord(scope, data.preferences))
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load notification settings')
        setPreferences(normalizePreferenceRecord(scope, null))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [scope])

  async function persist(next: Partial<NotificationPreferenceRecord>) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, ...next }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save notification settings')
      setPreferences(normalizePreferenceRecord(scope, data.preferences))
      setSuccess('Notification settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notification settings')
    } finally {
      setSaving(false)
    }
  }

  async function enableDesktopNotifications() {
    if (!desktopCapable || typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    await persist({
      desktop_enabled: permission === 'granted',
      permission_state: permission,
      prompt_dismissed_at: permission === 'granted' ? new Date().toISOString() : preferences?.prompt_dismissed_at ?? null,
    })
  }

  if (loading || !preferences) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={15} className="animate-spin" />
          Loading notification settings…
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <span className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
          preferences.desktop_enabled
            ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-300'
            : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-600 dark:bg-gray-700/70 dark:text-gray-300'
        )}>
          {preferences.desktop_enabled ? 'Desktop On' : 'Desktop Off'}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Monitor size={15} className="text-green-600" />
            Desktop browser notifications
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Supported desktop browsers can show real-time alerts when this tab is not active.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={enableDesktopNotifications}
              disabled={saving || !desktopCapable}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
              {preferences.permission_state === 'granted' ? 'Refresh Permission' : 'Enable Desktop Alerts'}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Permission: {preferences.permission_state}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Smartphone size={15} className="text-green-600" />
            In-app notifications and badges
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Mobile and desktop continue to use the in-portal notifications center and unread badges. Future push delivery can reuse these settings.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Notification categories
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(categoryLabels).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 text-sm dark:border-gray-700"
            >
              <span className="text-gray-700 dark:text-gray-200">{label}</span>
              <input
                type="checkbox"
                checked={Boolean(preferences.categories[key])}
                disabled={saving}
                onChange={(event) => {
                  const categories = {
                    ...DEFAULTS[scope],
                    ...preferences.categories,
                    [key]: event.target.checked,
                  }
                  setPreferences((current) => current ? { ...current, categories } : current)
                  void persist({ categories })
                }}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
            </label>
          ))}
        </div>
      </div>

      {!desktopCapable && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Desktop browser notifications are only enabled on supported desktop browsers. Mobile stays on in-app notifications and badges.
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <XCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          {success}
        </div>
      )}
    </div>
  )
}
