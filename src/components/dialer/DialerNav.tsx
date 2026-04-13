'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, Menu, PhoneCall, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

const PRIMARY_NAV = [
  { href: '/admin/dialer', label: 'Dialer' },
  { href: '/admin/dialer/campaigns', label: 'Campaigns' },
  { href: '/admin/dialer/analytics', label: 'Analytics' },
  { href: '/admin/crm', label: 'CRM' },
]

function isActive(pathname: string, href: string) {
  if (href === '/admin/crm') return pathname.startsWith('/admin/crm')
  if (href === '/admin/dialer') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function DialerNav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const activeLabel = useMemo(() => {
    return PRIMARY_NAV.find(item => isActive(pathname, item.href))?.label ?? 'Dialer'
  }, [pathname])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-gray-800 bg-[#060b16]/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex min-h-[72px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin"
              className="hidden items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-300 sm:flex"
            >
              <ChevronLeft size={13} />
              Admin
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-400/10 text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.03),0_12px_24px_rgba(0,0,0,0.18)]">
                <PhoneCall size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Campaign Dialer
                </p>
                <p className="truncate text-sm font-semibold text-white">{activeLabel}</p>
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            {PRIMARY_NAV.map(item => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-sky-400/30 bg-sky-400/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'border-transparent text-gray-400 hover:border-gray-800 hover:bg-gray-900 hover:text-white'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-800 bg-gray-900 text-gray-200 transition-colors hover:bg-gray-800 md:hidden"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <div
          className={cn(
            'overflow-hidden transition-all duration-200 md:hidden',
            menuOpen ? 'max-h-64 pb-4 opacity-100' : 'max-h-0 pb-0 opacity-0'
          )}
        >
          <div className="grid gap-2 rounded-xl border border-gray-800 bg-[#0b1120] p-2">
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
            >
              <ChevronLeft size={15} />
              Admin
            </Link>
            {PRIMARY_NAV.map(item => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-sky-400/30 bg-sky-400/12 text-white'
                      : 'border-transparent text-gray-300 hover:border-gray-800 hover:bg-gray-900'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
}
