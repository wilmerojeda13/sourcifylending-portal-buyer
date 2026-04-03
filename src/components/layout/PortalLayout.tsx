'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import GlobalAIPanel from '@/components/ai/GlobalAIPanel'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Bot, FileText, CheckSquare, BarChart2,
  CreditCard, Bell, LogOut, Menu, X, ChevronRight, Star, TrendingUp, ShieldCheck, Zap, ArrowUpCircle,
  MessageSquare, Settings, ShieldAlert, DollarSign, Building2, BookOpen, PieChart, ClipboardList, PlayCircle, Plus, Lock
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { useBusinessContext } from '@/lib/use-business-context'
import type { AccessibleBusiness } from '@/types'

const BASE_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agent', label: 'AI Agent', icon: Bot },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/progress', label: 'Progress', icon: CheckSquare },
  { href: '/reports', label: 'Reports', icon: BarChart2 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
]

// Prospect accounts only see Dashboard + Funding Results + Upgrade + Support
const PROSPECT_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
}: PortalLayoutProps) {
  const uwReviewDue = !!uwNextDueAt && new Date(uwNextDueAt) < new Date()
  const isProspect = accountState === 'prospect'
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [liveNotificationCount, setLiveNotificationCount] = useState(notificationCount)
  const [showAddBusiness, setShowAddBusiness] = useState(false)
  const [newBusinessName, setNewBusinessName] = useState('')
  const [newBusinessEntityType, setNewBusinessEntityType] = useState('')
  const [newBusinessIndustry, setNewBusinessIndustry] = useState('')
  const [creatingBusiness, setCreatingBusiness] = useState(false)
  const [businessCreateError, setBusinessCreateError] = useState<string | null>(null)
  const supabase = createClient()
  const { businesses, activeBusinessId, hasMultipleBusinesses, loading: businessLoading, refresh: refreshBusinesses } = useBusinessContext()
  const canManageBusinesses = businesses.some((business) => business.role === 'owner' || business.role === 'admin')

  // Nav items are based on the ACTIVE program only (assignedProgram)
  // allPrograms is only used to decide whether to show the program switcher
  const enrolledPrograms = allPrograms ?? (assignedProgram ? [assignedProgram] : [])
  const hasA = assignedProgram === 'program_a'
  const hasB = assignedProgram === 'program_b'
  const isMultiProgram = enrolledPrograms.filter(p => p !== 'program_c').length > 1

  // ── Program-aware sidebar nav ──────────────────────────────────────────────
  // Prospects get a minimal nav. Active members get program-specific items:
  //   Program A  → Credit Optimization, Credit Disputes
  //   Program B  → Biz Credit Setup, Biz Credit Monitoring, Biz Resources
  //   Program C  → base items only (no program-specific extras)
  //   All active → Opportunities, Funding Results, Credit Disputes, AI Credits, Reports, Billing, Support
  //   Delegate   → same as active member but Billing is hidden
  const sidebarNavItems = isProspect
    ? PROSPECT_NAV_ITEMS
    : [
        ...BASE_NAV_ITEMS.slice(0, 4), // Dashboard, AI Agent, Documents, Progress

        // ── Program A only ───────────────────────────────────────────────────
        ...(hasA
          ? [{ href: '/credit-optimization', label: 'Credit Optimization', icon: Star }]
          : []),

        // ── Program B only ───────────────────────────────────────────────────
        ...(hasB
          ? [
              { href: '/business-credit-setup',      label: 'Biz Credit Setup',      icon: Building2 },
              { href: '/business-credit-monitoring',  label: 'Biz Credit Monitoring', icon: TrendingUp },
              { href: '/business-resources',          label: 'Biz Resources',         icon: BookOpen },
            ]
          : []),

        // ── Underwriting review — Program A & B only ─────────────────────────
        ...(hasA || hasB
          ? [{ href: '/underwriting', label: 'Underwrite Your Biz', icon: ClipboardList }]
          : []),

        // ── Shared for all active members ────────────────────────────────────
        { href: '/opportunities',   label: 'Opportunities',   icon: TrendingUp },
        { href: '/funding-results', label: 'Funding Results', icon: DollarSign },
        { href: '/roi',             label: 'ROI Tracker',     icon: PieChart },

        // ── Program A only: credit dispute tooling ───────────────────────────
        ...(hasA
          ? [{ href: '/credit-disputes', label: 'Credit Disputes', icon: ShieldAlert }]
          : []),

        { href: '/ai-usage',        label: 'AI Credits',      icon: Zap },

        { href: '/reports', label: 'Reports', icon: BarChart2 },
        // Delegates cannot access Billing
        ...(!isDelegate ? [{ href: '/billing', label: 'Billing', icon: CreditCard }] : []),
        { href: '/training',  label: 'Training Videos', icon: PlayCircle },
        { href: '/support',   label: 'Support Inbox', icon: MessageSquare },
        { href: '/settings',  label: 'Settings',      icon: Settings },
      ]

  const [switching, setSwitching] = useState(false)

  const currentBusiness = businesses.find((business) => business.id === activeBusinessId) ?? null
  const currentBusinessPaid = currentBusiness
    ? currentBusiness.subscription_status === 'active' || currentBusiness.subscription_status === 'trialing'
    : accountState === 'active_member'
  const currentBusinessStatusLabel = currentBusiness
    ? currentBusiness.subscription_status === 'active' || currentBusiness.subscription_status === 'trialing'
      ? 'Active'
      : currentBusiness.subscription_status === 'pending'
        ? 'Pending'
        : 'Subscription Required'
    : accountState === 'active_member'
      ? 'Active'
      : 'Pending'
  const currentBusinessStatusClassName =
    currentBusinessStatusLabel === 'Active'
      ? 'border-green-500/30 bg-green-500/10 text-green-300'
      : currentBusinessStatusLabel === 'Pending'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  const subscriptionGateAllowedPaths = new Set(['/dashboard', '/billing', '/funding-results', '/support', '/settings', '/training', '/notifications'])
  const shouldShowSubscriptionGate =
    !portalBlocked &&
    !currentBusinessPaid &&
    !subscriptionGateAllowedPaths.has(pathname)

  const switchBusiness = async (businessId: string) => {
    if (!businessId || businessId === activeBusinessId) return
    const targetBusiness = businesses.find((business) => business.id === businessId) ?? null
    setSwitching(true)
    try {
      await fetch('/api/portal/business-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      await refreshBusinesses()
      if (targetBusiness && !['active', 'trialing'].includes(targetBusiness.subscription_status)) {
        router.push('/billing?subscription_required=1')
      } else {
        router.refresh()
      }
    } finally {
      setSwitching(false)
    }
  }

  const createBusiness = async () => {
    const trimmedName = newBusinessName.trim()
    if (!trimmedName) {
      setBusinessCreateError('Business name is required.')
      return
    }

    setCreatingBusiness(true)
    setBusinessCreateError(null)
    try {
      const res = await fetch('/api/portal/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: trimmedName,
          entity_type: newBusinessEntityType,
          industry: newBusinessIndustry,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to add business')
      }

      setShowAddBusiness(false)
      setNewBusinessName('')
      setNewBusinessEntityType('')
      setNewBusinessIndustry('')
      await refreshBusinesses()
      router.push(data?.redirect_to || '/dashboard')
      router.refresh()
    } catch (error) {
      setBusinessCreateError(error instanceof Error ? error.message : 'Failed to add business')
    } finally {
      setCreatingBusiness(false)
    }
  }

  useEffect(() => {
    const onRefreshBusinesses = () => { refreshBusinesses().catch(() => {}) }
    window.addEventListener('portal-business-changed', onRefreshBusinesses)
    return () => window.removeEventListener('portal-business-changed', onRefreshBusinesses)
  }, [refreshBusinesses])

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

  const BusinessSwitcher = ({ compact = false }: { compact?: boolean }) => {
    if (businesses.length === 0) {
      if (businessLoading) {
        return compact ? null : (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1">Business</p>
            <div className="h-11 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          </div>
        )
      }
      return null
    }

    return (
      <div className={cn(compact ? 'min-w-0 max-w-[220px]' : 'w-full')}>
        <div className={cn(
          'rounded-2xl border border-gray-200/70 bg-white/90 shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80',
          compact ? 'p-2.5' : 'p-3'
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={cn(
                'font-semibold uppercase tracking-[0.16em] text-gray-400',
                compact ? 'text-[9px]' : 'text-[10px]'
              )}>
                Business
              </p>
              {currentBusiness && (
                <p className={cn(
                  'mt-1 truncate font-semibold text-gray-900 dark:text-gray-100',
                  compact ? 'text-xs' : 'text-sm'
                )}>
                  {currentBusiness.label}
                </p>
              )}
            </div>
            {!compact && canManageBusinesses && (
              <button
                type="button"
                onClick={() => {
                  setBusinessCreateError(null)
                  setShowAddBusiness(true)
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-green-500/30 hover:bg-green-500/10 hover:text-green-300 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300"
              >
                <Plus size={12} />
                Add Business
              </button>
            )}
          </div>

          <div className={cn('mt-2', compact ? 'space-y-1.5' : 'space-y-2')}>
            <select
              value={activeBusinessId ?? ''}
              onChange={(event) => switchBusiness(event.target.value)}
              disabled={switching || businessLoading || businesses.length <= 1}
              className={cn(
                'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-70',
                compact ? 'h-9 px-3 text-xs' : 'h-10 px-3 text-sm'
              )}
            >
              {businesses.map((business: AccessibleBusiness) => (
                <option key={business.id} value={business.id}>
                  {business.label}{!['active', 'trialing'].includes(business.subscription_status) ? ' — Subscription Required' : ''}
                </option>
              ))}
            </select>

            <div className={cn(
              'flex gap-2',
              compact ? 'flex-wrap items-center' : 'items-center justify-between'
            )}>
              <span className={cn(
                'inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
                currentBusinessStatusClassName
              )}>
                {currentBusinessStatusLabel}
              </span>
              {compact && canManageBusinesses && (
                <button
                  type="button"
                  onClick={() => {
                    setBusinessCreateError(null)
                    setShowAddBusiness(true)
                    setMobileOpen(false)
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 text-[10px] font-semibold text-gray-600 transition-colors hover:border-green-500/30 hover:bg-green-500/10 hover:text-green-300 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300"
                >
                  <Plus size={11} />
                  Add
                </button>
              )}
            </div>

            {!compact && (
              <p className="text-[11px] leading-relaxed text-gray-400">
                {hasMultipleBusinesses
                  ? `${businesses.length} businesses on this login`
                  : 'Each business keeps its own subscription, documents, and portal progress.'}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
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
            href="mailto:support@sourcifylending.com"
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
        <div className="px-1 pb-2">
          <BusinessSwitcher />
        </div>
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
          {isProspect && (
            <span className="text-[9px] font-bold px-1 py-0.5 bg-green-100 text-green-700 rounded-full uppercase shrink-0">Free</span>
          )}
          {isDelegate && (
            <span className="text-[9px] font-bold px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase shrink-0">Delegate</span>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {isDemo ? 'Demo Account' : isDelegate ? 'Delegate Access' : isProspect ? 'Free Prospect Account' : 'Client Account'}
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
              {currentBusiness && (
                <span className="text-[11px] text-gray-400 block truncate">{currentBusiness.label}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasMultipleBusinesses && (
              <div className="hidden sm:block">
                <BusinessSwitcher compact />
              </div>
            )}
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
          {(hasMultipleBusinesses || canManageBusinesses) && (
            <div className="lg:hidden mb-4">
              <BusinessSwitcher />
            </div>
          )}
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

        {/* Global AI Panel — persistent across all portal pages */}
        <GlobalAIPanel
          assignedProgram={assignedProgram}
          accountState={accountState}
          userName={userName}
        />

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 z-10 px-1 py-1.5 safe-area-pb">
          <div className={`grid gap-0.5 ${isProspect ? 'grid-cols-6' : 'grid-cols-6'}`}>
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

      {showAddBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Add Business</h2>
                <p className="text-xs text-gray-400 mt-0.5">Create a separate business profile under this login. Each business requires its own subscription.</p>
              </div>
              <button
                type="button"
                onClick={() => !creatingBusiness && setShowAddBusiness(false)}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Business Name</label>
                <input
                  value={newBusinessName}
                  onChange={(event) => setNewBusinessName(event.target.value)}
                  placeholder="Acme Trucking LLC"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Entity Type</label>
                  <input
                    value={newBusinessEntityType}
                    onChange={(event) => setNewBusinessEntityType(event.target.value)}
                    placeholder="LLC"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Industry</label>
                  <input
                    value={newBusinessIndustry}
                    onChange={(event) => setNewBusinessIndustry(event.target.value)}
                    placeholder="Trucking"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
              {businessCreateError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {businessCreateError}
                </p>
              )}
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                New businesses start unsubscribed and will be sent to checkout before portal features unlock.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowAddBusiness(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createBusiness}
                disabled={creatingBusiness}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                <Plus size={14} />
                {creatingBusiness ? 'Creating…' : 'Create Business'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
