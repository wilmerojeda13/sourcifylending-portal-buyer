'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Bot, FileText, CheckSquare, BarChart2,
  CreditCard, Bell, LogOut, Menu, X, ChevronRight
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agent', label: 'AI Agent', icon: Bot },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/progress', label: 'Progress', icon: CheckSquare },
  { href: '/reports', label: 'Reports', icon: BarChart2 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
]

interface PortalLayoutProps {
  children: React.ReactNode
  userName?: string
  programLabel?: string
  notificationCount?: number
}

export default function PortalLayout({
  children,
  userName = 'Client',
  programLabel,
  notificationCount = 0,
}: PortalLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
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
            ? 'bg-green-600 text-white shadow-sm'
            : 'text-gray-600 hover:bg-green-50 hover:text-green-700'
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
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SL</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">SourcifyLending</p>
            <p className="text-xs text-gray-400 truncate max-w-[140px]">{programLabel || 'Client Portal'}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-1">
        <Link
          href="/notifications"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <div className="relative">
            <Bell size={18} />
            {notificationCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </div>
          <span>Notifications</span>
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* User info */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-700 truncate">{userName}</p>
        <p className="text-xs text-gray-400 mt-0.5">Client Account</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-100 fixed h-full z-20">
        {sidebar}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 bg-white h-full shadow-xl z-50">
            <button
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100"
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
        <header className="lg:hidden bg-white border-b border-gray-100 px-4 py-3.5 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">SL</span>
            </div>
            <span className="font-bold text-gray-900 text-sm">SourcifyLending</span>
          </div>
          <div className="flex items-center gap-2">
            {notificationCount > 0 && (
              <Link href="/notifications" className="relative p-2">
                <Bell size={20} className="text-gray-600" />
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              </Link>
            )}
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-xl hover:bg-gray-50"
            >
              <Menu size={22} className="text-gray-700" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 max-w-5xl w-full mx-auto">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-10 px-1 py-1.5 safe-area-pb">
          <div className="grid grid-cols-6 gap-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-colors',
                    active ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'
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
