'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Megaphone, Users, PhoneCall, ScrollText,
  Settings, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const MOBILE_NAV = [
  { href: '/admin/voice',           label: 'Home',      icon: LayoutDashboard },
  { href: '/admin/voice/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/admin/voice/leads',     label: 'Leads',     icon: Users },
  { href: '/admin/voice/live',      label: 'Live',      icon: PhoneCall },
  { href: '/admin/voice/logs',      label: 'Logs',      icon: ScrollText },
  { href: '/admin/voice/analytics', label: 'Analytics',  icon: BarChart3 },
  { href: '/admin/voice/settings',  label: 'Settings',  icon: Settings },
]

export default function VoiceMobileNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 z-20 px-1 py-1.5 safe-area-pb">
      <div className="flex justify-between gap-0.5 overflow-x-auto scrollbar-none">
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/admin/voice' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-xl transition-colors min-w-0 flex-1',
                active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[9px] font-medium leading-none text-center truncate w-full">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
