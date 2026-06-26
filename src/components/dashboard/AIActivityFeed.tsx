'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle, ChevronDown, ChevronUp, Info, Loader2, Sparkles } from 'lucide-react'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'

interface ActivityEvent {
  id: string
  event_type: string
  title: string
  message: string | null
  severity: 'info' | 'success' | 'warning' | 'critical'
  created_at: string
}

const EVENT_CATEGORY_COLORS: Record<string, string> = {
  billing: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
  subscriptions: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  leads: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  accounts: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  alerts: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
}

function EventIcon({ severity }: { severity: string }) {
  if (severity === 'critical' || severity === 'warning') {
    return <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
  }
  if (severity === 'success') {
    return <CheckCircle size={15} className="text-green-500 shrink-0 mt-0.5" />
  }
  return <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
}

function formatTimeAgo(dateStr: string, text: (key: string, fallback: string) => string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return text('dashboard.justNow', 'just now')
  if (mins < 60) return text('dashboard.minutesAgo', '{{count}}m ago').replace('{{count}}', String(mins))
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return text('dashboard.hoursAgo', '{{count}}h ago').replace('{{count}}', String(hrs))
  return text('dashboard.daysAgo', '{{count}}d ago').replace('{{count}}', String(Math.floor(hrs / 24)))
}

export default function AIActivityFeed() {
  const { locale } = useLanguage()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const text = (key: string, fallback: string) => t(locale, key, fallback)

  useEffect(() => {
    fetch('/api/admin/activity?limit=20&category=all')
      .then((response) => response.json())
      .then((data) => setEvents(data.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
            <Bot size={16} className="text-green-600" />
          </div>
          <p className="font-bold text-gray-900 dark:text-white text-sm">{text('dashboard.activityFeed', 'Activity Feed')}</p>
        </div>
        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm py-2">
          <Loader2 size={14} className="animate-spin" /> {text('dashboard.loading', 'Loading...')}
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
            <Bot size={16} className="text-green-600" />
          </div>
          <p className="font-bold text-gray-900 dark:text-white text-sm">{text('dashboard.activityFeed', 'Activity Feed')}</p>
        </div>
        <div className="flex flex-col items-center py-6 text-center">
          <Sparkles size={22} className="text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">{text('dashboard.noActivityYet', 'No activity yet.')}</p>
          <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">{text('dashboard.activityAppears', 'Activity will appear here as events occur.')}</p>
        </div>
      </div>
    )
  }

  const visible = showAll ? events : events.slice(0, 5)
  const hasAlerts = events.some((event) => event.severity === 'critical' || event.severity === 'warning')

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
            <Bot size={16} className="text-green-600" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-white text-sm">{text('dashboard.activityFeed', 'Activity Feed')}</p>
            {hasAlerts && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">{text('dashboard.alerts', 'Alerts')}</p>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {events.length} {text('dashboard.events', 'events')}
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((event) => (
          <div
            key={event.id}
            className={`rounded-xl border px-3 py-2.5 transition-all cursor-pointer ${
              event.severity === 'critical' || event.severity === 'warning'
                ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30'
                : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700'
            }`}
            onClick={() => setExpanded(expanded === event.id ? null : event.id)}
          >
            <div className="flex items-start gap-2">
              <EventIcon severity={event.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={`text-xs font-semibold leading-snug ${
                      event.severity === 'warning' || event.severity === 'critical'
                        ? 'text-amber-800 dark:text-amber-300'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {event.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      EVENT_CATEGORY_COLORS[event.event_type] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {event.event_type}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                    {formatTimeAgo(event.created_at, text)}
                  </span>
                </div>
              </div>
              {event.message &&
                (expanded === event.id ? (
                  <ChevronUp size={12} className="text-gray-400 shrink-0 mt-1" />
                ) : (
                  <ChevronDown size={12} className="text-gray-400 shrink-0 mt-1" />
                ))}
            </div>

            {expanded === event.id && event.message && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed pl-5 border-t border-gray-100 dark:border-gray-700 pt-2">
                {event.message}
              </p>
            )}
          </div>
        ))}
      </div>

      {events.length > 5 && (
        <button
          onClick={() => setShowAll((value) => !value)}
          className="w-full mt-3 text-xs text-green-600 hover:text-green-700 font-medium py-1.5 text-center"
        >
          {showAll
            ? text('dashboard.showLess', 'Show less')
            : text('dashboard.showMore', 'Show {{count}} more').replace('{{count}}', String(events.length - 5))}
        </button>
      )}
    </div>
  )
}
