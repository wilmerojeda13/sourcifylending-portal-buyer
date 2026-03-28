'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  DollarSign,
  BookOpen,
  PlayCircle,
  User,
  LogOut,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

const NAV_ITEMS = [
  { href: '/affiliate/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/affiliate/leads',       label: 'Leads',       icon: UserPlus },
  { href: '/affiliate/referrals',   label: 'Referrals',   icon: Users },
  { href: '/affiliate/commissions', label: 'Commissions', icon: DollarSign },
  { href: '/affiliate/resources',   label: 'Resources',   icon: BookOpen },
  { href: '/affiliate/training',    label: 'Training',    icon: PlayCircle },
  { href: '/affiliate/account',     label: 'Account',     icon: User },
]

interface Props {
  affiliateName: string
}

export default function AffiliateSidebar({ affiliateName }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/affiliate/login')
  }

  const NavLink = ({ href, label, icon: Icon }: typeof NAV_ITEMS[number]) => {
    const active = pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
          active
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400'
        )}
      >
        <Icon size={18} />
        <span>{label}</span>
        {active && <ChevronRight size={14} className="ml-auto opacity-70" />}
      </Link>
    )
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SL</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight">SourcifyLending</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-gray-400 dark:text-gray-500">Affiliates</p>
              <span className="text-[9px] font-bold px-1 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 rounded-full uppercase">
                Partner
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-800">
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
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{affiliateName}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Affiliate Partner</p>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 fixed h-full z-20">
        {sidebar}
      </aside>

      {/* Mobile Top Bar */}
      <header className="lg:hidden bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3.5 flex items-center justify-between fixed top-0 left-0 right-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">SL</span>
          </div>
          <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">Affiliates</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <Menu size={22} className="text-gray-700" />
        </button>
      </header>

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

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 z-20 px-1 py-1.5">
        <div className="grid grid-cols-6 gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-colors',
                  active ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium leading-none text-center">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
