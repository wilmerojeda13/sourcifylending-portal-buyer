'use client'

import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/admin/crm?focus=overview', label: 'Overview', mode: 'overview' },
  { href: '/admin/crm?focus=leads', label: 'Leads', mode: 'leads' },
  { href: '/admin/crm?view=board', label: 'Pipeline', mode: 'pipeline' },
  { href: '/admin/crm/calls', label: 'Calls' },
  { href: '/admin/crm/tasks', label: 'Tasks' },
  { href: '/admin/crm/calendar', label: 'Calendar' },
  { href: '/admin/crm/analytics', label: 'Analytics' },
]

export default function CRMWorkspaceNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const handleNavigation = (href: string) => {
    router.push(href)
  }

  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex min-w-max items-center gap-1 rounded-xl border border-gray-200 bg-white/90 p-0.5 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
        {ITEMS.map(item => {
          const focus = searchParams.get('focus')
          const view = searchParams.get('view')
          const active = item.mode === 'overview'
            ? pathname === '/admin/crm' && view !== 'board' && focus !== 'leads'
            : item.mode === 'leads'
              ? pathname === '/admin/crm' && focus === 'leads'
              : item.mode === 'pipeline'
                ? pathname === '/admin/crm' && view === 'board'
                : pathname.startsWith(item.href)

          return (
            <button
              key={`${item.href}-${item.label}`}
              onClick={() => handleNavigation(item.href)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'brand-chip-hover'
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
