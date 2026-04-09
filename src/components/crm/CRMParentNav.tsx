'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface CRMParentNavProps {
  /** Breadcrumb trail items. Last item is the current page (not a link). */
  crumbs: BreadcrumbItem[]
  className?: string
}

export default function CRMParentNav({ crumbs, className }: CRMParentNavProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-1 text-sm', className)}
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1

        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronLeft size={12} className="text-gray-400" />
            )}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="text-gray-500 hover:text-green-700 transition-colors font-medium"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={cn(
                  'font-semibold',
                  isLast ? 'text-gray-900 dark:text-white' : 'text-gray-500'
                )}
              >
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/**
 * Hook to get the default CRM parent navigation crumbs.
 * Extend this as needed for detail pages.
 */
export function useCRMParentCrumbs(currentPage?: string): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [
    { label: 'Admin Hub', href: '/admin' },
    { label: 'Sales CRM', href: '/admin/crm' },
  ]

  if (currentPage) {
    crumbs.push({ label: currentPage })
  }

  return crumbs
}
