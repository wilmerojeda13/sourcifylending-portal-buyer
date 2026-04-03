'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/offline-crm', label: 'Leads' },
  { href: '/offline-crm/dialer', label: 'Dialer' },
]

export default function OfflineCRMNav() {
  const pathname = usePathname()

  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex min-w-max items-center gap-2 rounded-2xl border border-gray-800 bg-gray-900/90 p-1.5">
        {ITEMS.map((item) => {
          const active = item.href === '/offline-crm'
            ? pathname === '/offline-crm'
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
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
