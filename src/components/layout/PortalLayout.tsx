'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'
import { SUPPORT_EMAIL } from '@/lib/site-config'
import {
  LayoutDashboard, Bot, FileText, CheckSquare, BarChart2,
  CreditCard, Bell, LogOut, Menu, X, ChevronRight, Star, TrendingUp, ShieldCheck, Zap, ArrowUpCircle,
  MessageSquare, Settings, ShieldAlert, DollarSign, Building2, BookOpen, PieChart, ClipboardList, PlayCircle, Lock, RefreshCcw
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import PortalAIFloatingWidget from '@/components/ai/PortalAIFloatingWidget'
import type { PlanTier, SubscriptionStatus } from '@/types'

const BASE_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agent', label: 'AI Agent', icon: Bot },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/progress', label: 'Progress', icon: CheckSquare },
  { href: '/reports', label: 'Reports', icon: BarChart2 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
]

// Prospect accounts get the reduced prospect nav, with Inquiry Disputes added to that set
const PROSPECT_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/credit-disputes', label: 'Inquiry Disputes', icon: ShieldAlert },
  { href: '/funding-results', label: 'Funding Results', icon: DollarSign },
  { href: '/training', label: 'Training Videos', icon: PlayCircle },
  { href: '/billing', label: 'Upgrade', icon: ArrowUpCircle },
  { href: '/support', label: 'Support', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
]

// Bottom mobile nav always shows these 6 for members
const MOBILE_NAV_ITEMS = BASE_NAV_ITEMS

interface PortalLayoutProps {
  children: React.ReactNode
  userName?: string
  programLabel?: string
  notificationCount?: number
  assignedProgram?: string | null
  portalBlocked?: boolean
  isDemo?: boolean
  isAdmin?: boolean
  isDelegate?: boolean
  accountState?: 'prospect' | 'active_member'
  /** ISO string — when set and in the past, shows a "Due" badge on Monthly Review nav item */
  uwNextDueAt?: string | null
  /** Demo accounts only: the other program available to switch to */
  demoSecondaryProgram?: string | null
  /** All active program_codes for this user (enables multi-program nav + switcher) */
  allPrograms?: string[]
  /** User's plan tier (free or paid) - controls feature access */
  planTier?: PlanTier | null
  /** User's subscription status - controls access to paid features */
  subscriptionStatus?: SubscriptionStatus | null
}

export default function PortalLayout({
  children,
  userName = 'Client',
  programLabel,
  notificationCount = 0,
  assignedProgram,
  portalBlocked = false,
  isDemo = false,
  isAdmin = false,
  isDelegate = false,
  accountState = 'active_member',
  uwNextDueAt,
  demoSecondaryProgram,
  allPrograms,
  planTier,
  subscriptionStatus,
}: PortalLayoutProps) {
  const uwReviewDue = !!uwNextDueAt && new Date(uwNextDueAt) < new Date()
  const isProspect = accountState === 'prospect'
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [liveNotificationCount, setLiveNotificationCount] = useState(notificationCount)
  const [switching, setSwitching] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Nav items are based on the ACTIVE program only (assignedProgram)
  // allPrograms is only used to decide whether to show the program switcher
  const enrolledPrograms = useMemo(() => allPrograms ?? (assignedProgram ? [assignedProgram] : []), [allPrograms, assignedProgram])
  const hasA = assignedProgram === 'program_a'
  const hasB = assignedProgram === 'program_b'
  const isMultiProgram = useMemo(() => enrolledPrograms.filter((p) => p !== 'program_c').length > 1, [enrolledPrograms])

  // Free users also get the limited nav (same as prospects)
  const isFreeUser = planTier === 'free'

  const sidebarNavItems = useMemo(() => {
    if (isProspect || isFreeUser) return PROSPECT_NAV_ITEMS
    return [
      ...BASE_NAV_ITEMS.slice(0, 4),
      ...(hasA ? [{ href: '/credit-optimization', label: 'Credit Optimization', icon: Star }] : []),
      ...(hasB
        ? [
            { href: '/business-credit-setup', label: 'Biz Credit Setup', icon: Building2 },
            { href: '/business-credit-monitoring', label: 'Biz Credit Monitoring', icon: TrendingUp },
            { href: '/business-resources', label: 'Biz Resources', icon: BookOpen },
          ]
        : []),
      ...(hasA || hasB ? [{ href: '/underwriting', label: 'Underwrite Your Biz', icon: ClipboardList }] : []),
      { href: '/opportunities', label: 'Opportunities', icon: TrendingUp },
      { href: '/funding-results', label: 'Funding Results', icon: DollarSign },
      { href: '/roi', label: 'ROI Tracker', icon: PieChart },
      ...(hasA ? [{ href: '/credit-disputes', label: 'Credit Disputes', icon: ShieldAlert }] : []),
      { href: '/ai-usage', label: 'AI Credits', icon: Zap },
      { href: '/reports', label: 'Reports', icon: BarChart2 },
      ...(!isDelegate ? [{ href: '/billing', label: 'Billing', icon: CreditCard }] : []),
      { href: '/training', label: 'Training Videos', icon: PlayCircle },
      { href: '/support', label: 'Support Inbox', icon: MessageSquare },
      { href: '/settings', label: 'Settings', icon: Settings },
    ]
  }, [hasA, hasB, isDelegate, isFreeUser, isProspect])

  const currentBusinessPaid = planTier === 'free'
    ? true
    : subscriptionStatus === 'active' || subscriptionStatus === 'trialing' || accountState === 'active_member'

  const subscriptionGateAllowedPaths = useMemo(() => new Set(['/dashboard', '/billing', '/funding-results', '/support', '/settings', '/training', '/notifications']), [])
  const prospectInquiryDisputesPath = isProspect && pathname === '/credit-disputes'
  const shouldShowSubscriptionGate =
    !portalBlocked &&
    !currentBusinessPaid &&
    !subscriptionGateAllowedPaths.has(pathname) &&
    !prospectInquiryDisputesPath

  useEffect(() => {
    setLiveNotificationCount(notificationCount)
  }, [notificationCount])

  useEffect(() => {
    const onNotificationCount = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail
      if (typeof detail === 'number') {
        setLiveNotificationCount(detail)
      }
    }

    window.addEventListener('sl-member-notification-count', onNotificationCount)
    return () => window.removeEventListener('sl-member-notification-count', onNotificationCount)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  const handleSwitchProgram = async () => {
    setSwitching(true)
    try {
      await fetch('/api/demo/switch-program', { method: 'POST' })
      router.push('/dashboard')
      router.refresh()
    } finally {
      setSwitching(false)
    }
  }

  // Hard suspension screen — overrides all portal content
  if (portalBlocked) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">🚫</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Account Suspended</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Your portal access has been temporarily suspended. Please contact our support team to resolve this.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-green-700 transition-colors"
          >
            Contact Support
          </a>
          <div className="mt-6">
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  const NavLink = ({ href, label, icon: Icon }: typeof BASE_NAV_ITEMS[number]) => {
    const active = pathname === href || pathname.startsWith(href + '/')
    const showDueBadge = href === '/underwriting' && uwReviewDue
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
          active
            ? 'bg-green-600 text-white shadow-sm'
            : showDueBadge
            ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/40'
            : 'text-gray-600 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-700 dark:hover:text-green-400'
        )}
      >
        <Icon size={18} />
        <span>{label}</span>
        {showDueBadge && !active && (
          <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">DUE</span>
        )}
        {active && <ChevronRight size={14} className="ml-auto opacity-70" />}
      </Link>
    )
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SL</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight">SourcifyLending</p>
            <p className="text-xs text-gray-400 truncate max-w-[140px]">{programLabel || 'Client Portal'}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {sidebarNavItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-800 space-y-1">
        {isAdmin && (
          <Link
            href="/admin"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
          >
            <ShieldCheck size={18} className="text-green-600" />
            <span>Admin Panel</span>
          </Link>
        )}
        <Link
          href="/notifications"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950 dark:hover:text-green-300 transition-colors"
        >
          <div className="relative">
            <Bell size={18} />
            {liveNotificationCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {liveNotificationCount > 9 ? '9+' : liveNotificationCount}
              </span>
            )}
          </div>
          <span>Notifications</span>
        </Link>
        {/* Multi-program switcher — shown for any user with 2+ programs */}
        {isMultiProgram && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-4 pt-1">Switch Program</p>
            {enrolledPrograms.filter(p => p !== 'program_c').map(p => {
              const isActive = p === assignedProgram
              const label = p === 'program_a' ? 'Program A — APR Cards' : 'Program B — Biz Credit'
              return (
                <button
                  key={p}
                  onClick={async () => {
                    if (isActive) return
                    setSwitching(true)
                    try {
                      await fetch('/api/switch-program', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ program_code: p }),
                      })
                      router.push('/dashboard')
                      router.refresh()
                    } finally {
                      setSwitching(false)
                    }
                  }}
                  disabled={switching || isActive}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${
                    isActive
                      ? 'bg-green-600 text-white cursor-default'
                      : 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                  }`}
                >
                  <RefreshCcw size={16} className={switching && !isActive ? 'animate-spin' : ''} />
                  <span className="truncate">{isActive ? `✓ ${label}` : label}</span>
                </button>
              )
            })}
          </div>
        )}
        {/* Demo-only legacy switcher (kept for backward compat) */}
        {isDemo && demoSecondaryProgram && !isMultiProgram && (
          <button
            onClick={handleSwitchProgram}
            disabled={switching}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-60"
          >
            <RefreshCcw size={18} className={switching ? 'animate-spin' : ''} />
            <span>
              {switching
                ? 'Switching…'
                : `Switch to ${demoSecondaryProgram === 'program_a' ? 'Program A' : 'Program B'}`}
            </span>
          </button>
        )}
        <ThemeToggle />
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* User info */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{userName}</p>
          {isDemo && (
            <span className="text-[9px] font-bold px-1 py-0.5 bg-amber-100 text-amber-700 rounded-full uppercase shrink-0">Demo</span>
          )}
          {(isProspect || isFreeUser) && (
            <span className="text-[9px] font-bold px-1 py-0.5 bg-green-100 text-green-700 rounded-full uppercase shrink-0">Free</span>
          )}
          {isDelegate && (
            <span className="text-[9px] font-bold px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase shrink-0">Delegate</span>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {isDemo ? 'Demo Account' : isDelegate ? 'Delegate Access' : isFreeUser ? 'Free Plan Account' : isProspect ? 'Free Prospect Account' : 'Client Account'}
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 fixed h-full z-20">
        {sidebar}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 bg-white dark:bg-gray-900 h-full shadow-xl z-50">
            <button
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile Top Bar */}
        <header className="lg:hidden bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3.5 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">SL</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-bold text-gray-900 dark:text-gray-100 text-sm block truncate">SourcifyLending</span>
              {programLabel && (
                <span className="text-[11px] text-gray-400 block truncate">{programLabel}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {liveNotificationCount > 0 && (
              <Link href="/notifications" className="relative rounded-xl p-2 text-gray-600 transition-colors hover:bg-green-50 hover:text-green-700">
                <Bell size={20} />
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {liveNotificationCount > 9 ? '9+' : liveNotificationCount}
                </span>
              </Link>
            )}
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Menu size={22} className="text-gray-700" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 max-w-5xl w-full mx-auto">
          {isDemo && (
            <div className="mb-5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-lg">🧪</span>
              <div>
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Demo Account</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-snug">This is a seeded demo for testing and sales purposes. Data is not real.</p>
              </div>
            </div>
          )}
          {shouldShowSubscriptionGate ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <Lock size={22} />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Subscription Required</h1>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                This business needs its own subscription before you can access the portal. Each business is billed separately under the current plan structure.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Link href="/billing" className="btn-primary px-5 py-3 text-sm">
                  Choose a Plan
                </Link>
                <Link href="/dashboard" className="btn-secondary px-5 py-3 text-sm">
                  Back to Dashboard
                </Link>
              </div>
            </div>
          ) : (
            children
          )}
        </main>

        {/* Global AI Panel — loaded only after explicit launch to keep the shell light */}
        <PortalAIFloatingWidget
          assignedProgram={assignedProgram}
          accountState={accountState}
          userName={userName}
        />

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 z-10 px-1 py-1.5 safe-area-pb">
          <div className={`grid gap-0.5 ${isProspect ? 'grid-cols-7' : 'grid-cols-6'}`}>
            {(isProspect ? PROSPECT_NAV_ITEMS : MOBILE_NAV_ITEMS).map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-colors',
                    active ? 'text-green-600' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  )}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                  <span className="text-[10px] font-medium leading-none">{label.replace(' ', '\n')}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </div>

    </div>
  )
}
