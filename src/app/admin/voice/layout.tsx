import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  LayoutDashboard, Megaphone, Users, PhoneCall, ScrollText,
  ShieldOff, FileText, Settings, BarChart3, ChevronLeft,
} from 'lucide-react'

const NAV = [
  { href: '/admin/voice',             label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/admin/voice/campaigns',   label: 'Campaigns',        icon: Megaphone       },
  { href: '/admin/voice/leads',       label: 'Lead Lists',       icon: Users           },
  { href: '/admin/voice/live',        label: 'Live Calls',       icon: PhoneCall       },
  { href: '/admin/voice/logs',        label: 'Call Logs',        icon: ScrollText      },
  { href: '/admin/voice/suppression', label: 'Suppression',      icon: ShieldOff       },
  { href: '/admin/voice/templates',   label: 'Templates',        icon: FileText        },
  { href: '/admin/voice/analytics',   label: 'Analytics',        icon: BarChart3       },
  { href: '/admin/voice/settings',    label: 'Settings',         icon: Settings        },
]

export default async function VoiceLayout({ children }: { children: React.ReactNode }) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100">
          <Link href="/admin" className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 mb-3">
            <ChevronLeft size={14} /> Admin Hub
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <PhoneCall size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Voice Campaigns</p>
              <p className="text-[10px] text-gray-400">AI Calling Module</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors group"
            >
              <Icon size={16} className="text-gray-400 group-hover:text-indigo-500 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-[10px] font-bold text-amber-700 mb-1">B2B ONLY MODE</p>
            <p className="text-[10px] text-amber-600 leading-relaxed">
              This tool is for business outreach only. You are responsible for compliance.
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
