'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Bell, Users, CreditCard, RefreshCw, MessageSquare,
  FileText, TrendingUp, BarChart2, AlertTriangle, CheckCircle,
  Info, Loader2, UserPlus,
} from 'lucide-react'

type EventSeverity = 'info' | 'success' | 'warning' | 'critical'
type EventCategory = 'accounts' | 'billing' | 'subscriptions' | 'support' | 'documents' | 'funding' | 'reports'

interface PortalEvent {
  id: string
  user_id: string | null
  event_type: string
  event_category: string
  title: string
  message: string | null
  metadata: Record<string, unknown> | null
  severity: EventSeverity
  created_by: string | null
  created_at: string
  profiles?: {
    full_name: string | null
    email: string | null
    business_name: string | null
  } | null
}

interface Props {
  initialEvents: PortalEvent[]
  initialUnreadCount: number
}

const CATEGORY_TABS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: <BarChart2 size={14} /> },
  { id: 'leads', label: 'Leads', icon: <UserPlus size={14} /> },
  { id: 'accounts', label: 'Accounts', icon: <Users size={14} /> },
  { id: 'billing', label: 'Billing', icon: <CreditCard size={14} /> },
  { id: 'subscriptions', label: 'Subscriptions', icon: <RefreshCw size={14} /> },
  { id: 'support', label: 'Support', icon: <MessageSquare size={14} /> },
  { id: 'documents', label: 'Documents', icon: <FileText size={14} /> },
  { id: 'funding', label: 'Funding', icon: <TrendingUp size={14} /> },
]

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  leads: <UserPlus size={16} className="text-violet-600" />,
  accounts: <Users size={16} className="text-blue-600" />,
  billing: <CreditCard size={16} className="text-green-600" />,
  subscriptions: <RefreshCw size={16} className="text-purple-600" />,
  support: <MessageSquare size={16} className="text-amber-600" />,
  documents: <FileText size={16} className="text-gray-500" />,
  funding: <TrendingUp size={16} className="text-emerald-600" />,
  reports: <BarChart2 size={16} className="text-indigo-600" />,
}

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  info: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
}

const SEVERITY_DOT: Record<EventSeverity, string> = {
  info: 'bg-blue-400',
  success: 'bg-green-400',
  warning: 'bg-amber-400',
  critical: 'bg-red-500',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months !== 1 ? 's' : ''} ago`
}

export default function ActivityFeedClient({ initialEvents, initialUnreadCount }: Props) {
  const [events, setEvents] = useState<PortalEvent[]>(initialEvents)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [markingRead, setMarkingRead] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchEvents = useCallback(async (category?: string) => {
    try {
      const cat = category ?? activeCategory
      const params = new URLSearchParams({ limit: '100' })
      if (cat !== 'all') params.set('category', cat)
      const res = await fetch(`/api/admin/activity?${params}`)
      const data = await res.json()
      if (res.ok && data.events) setEvents(data.events)

      const nRes = await fetch('/api/admin/notifications')
      const nData = await nRes.json()
      if (nRes.ok) setUnreadCount(nData.unread_count ?? 0)
    } catch {
      // silent fail
    }
  }, [activeCategory])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => { fetchEvents() }, 60_000)
    return () => clearInterval(interval)
  }, [fetchEvents])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchEvents()
    setRefreshing(false)
  }

  async function handleCategoryChange(cat: string) {
    setActiveCategory(cat)
    const params = new URLSearchParams({ limit: '100' })
    if (cat !== 'all') params.set('category', cat)
    try {
      const res = await fetch(`/api/admin/activity?${params}`)
      const data = await res.json()
      if (res.ok && data.events) setEvents(data.events)
    } catch {
      // silent fail
    }
  }

  async function markAllRead() {
    setMarkingRead(true)
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      })
      setUnreadCount(0)
    } catch {
      // silent fail
    } finally {
      setMarkingRead(false)
    }
  }

  const filteredEvents = activeCategory === 'all'
    ? events
    : events.filter((e) => e.event_category === activeCategory)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <ArrowLeft size={18} className="text-gray-600 dark:text-gray-300" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Bell size={20} className="text-amber-500" />
              Activity Feed
              {unreadCount > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300">
                  {unreadCount} unread
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Real-time client activity and admin alerts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingRead}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
            >
              {markingRead ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} className="text-green-500" />}
              Mark all read
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-1 flex gap-1 overflow-x-auto">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleCategoryChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap ${
              activeCategory === tab.id
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Info size={32} className="text-gray-200 dark:text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No activity yet</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
              {activeCategory === 'all'
                ? 'Events will appear here as clients interact with the portal.'
                : `No ${activeCategory} events recorded yet.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {filteredEvents.map((event) => {
              const showBadge = event.severity === 'warning' || event.severity === 'critical'
              const userName = event.profiles?.full_name || event.profiles?.email || null
              const memberHref = event.user_id ? `/admin/members/${event.user_id}` : null

              return (
                <div key={event.id} className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  {/* Category icon */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    event.event_category === 'leads' ? 'bg-violet-50 dark:bg-violet-900/30' :
                    event.event_category === 'accounts' ? 'bg-blue-50 dark:bg-blue-900/30' :
                    event.event_category === 'billing' ? 'bg-green-50 dark:bg-green-900/30' :
                    event.event_category === 'subscriptions' ? 'bg-purple-50 dark:bg-purple-900/30' :
                    event.event_category === 'support' ? 'bg-amber-50 dark:bg-amber-900/30' :
                    event.event_category === 'documents' ? 'bg-gray-100 dark:bg-gray-700' :
                    event.event_category === 'funding' ? 'bg-emerald-50 dark:bg-emerald-900/30' :
                    'bg-indigo-50 dark:bg-indigo-900/30'
                  }`}>
                    {CATEGORY_ICONS[event.event_category] ?? <BarChart2 size={16} className="text-gray-400" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{event.title}</p>
                        {event.message && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{event.message}</p>
                        )}
                        {userName && memberHref && (
                          <Link
                            href={memberHref}
                            className="text-xs text-green-600 hover:text-green-700 font-medium mt-1 inline-flex items-center gap-1"
                          >
                            <Users size={11} />
                            {userName}
                            {event.profiles?.business_name && ` · ${event.profiles.business_name}`}
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {showBadge && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${SEVERITY_COLORS[event.severity]}`}>
                            {event.severity}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[event.severity]}`} />
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">{relativeTime(event.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Metadata */}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(event.metadata).slice(0, 4).map(([k, v]) => (
                          <span key={k} className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                            {k.replace(/_/g, ' ')}: {String(v).slice(0, 40)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-gray-400 dark:text-gray-500">
        Showing last {filteredEvents.length} events &bull; Auto-refreshes every 60 seconds
      </p>
    </div>
  )
}
