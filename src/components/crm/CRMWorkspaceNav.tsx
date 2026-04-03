'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
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

  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 min-w-max rounded-2xl border border-gray-200 bg-white/80 p-1.5 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        {ITEMS.map(item => {
          const active = item.mode === 'overview'
            ? pathname === '/admin/crm' && searchParams.get('view') !== 'board' && searchParams.get('focus') !== 'leads'
            : item.mode === 'leads'
              ? pathname === '/admin/crm' && searchParams.get('view') !== 'board' && searchParams.get('focus') === 'leads'
              : item.mode === 'pipeline'
                ? pathname === '/admin/crm' && searchParams.get('view') === 'board'
                : pathname.startsWith(item.href)

          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={cn(
                'rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'brand-chip-hover'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
