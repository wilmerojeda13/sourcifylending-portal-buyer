'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ArrowUpRight, Megaphone, Users, Clock, CheckCircle2, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin/dialer/campaigns', label: 'Campaigns',       icon: Megaphone },
  { href: '/admin/dialer/leads',     label: 'Raw Leads',       icon: Users },
  { href: '/admin/dialer/callbacks', label: 'Callbacks',       icon: Clock },
  { href: '/admin/dialer/qualified', label: 'Ready to Promote',icon: CheckCircle2 },
  { href: '/admin/dialer/analytics', label: 'Analytics',       icon: BarChart3 },
]

export default function DialerNav() {
  const pathname = usePathname()

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-11 gap-3">
          {/* Back to Admin */}
          <Link
            href="/admin"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 shrink-0 transition-colors"
          >
            <ChevronLeft size={13} /> Admin
          </Link>

          <span className="text-gray-700">|</span>
          <span className="text-[11px] font-bold text-white uppercase tracking-widest shrink-0">Dialer</span>
          <span className="text-gray-700">|</span>

          {/* Nav tabs */}
          <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0 scrollbar-hide">
            {NAV_ITEMS.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                    active
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800',
                  )}
                >
                  <Icon size={13} />
                  {item.label}
                </Link>
              )
            })}
          </div>

          {/* Open CRM */}
          <a
            href="/admin/crm"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 shrink-0 transition-colors ml-auto"
          >
            CRM <ArrowUpRight size={11} />
          </a>
        </div>
      </div>
    </nav>
  )
}
