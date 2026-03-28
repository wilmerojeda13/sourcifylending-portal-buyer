'use client'
import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'locked'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    success: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
    warning: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
    danger: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
    info: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
    locked: 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
  }
  return (
    <span className={cn('badge', variants[variant], className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    pending: { variant: 'info', label: 'Pending' },
    completed: { variant: 'success', label: 'Completed' },
    locked: { variant: 'locked', label: 'Locked' },
    overdue: { variant: 'danger', label: 'Overdue' },
    active: { variant: 'success', label: 'Active' },
    inactive: { variant: 'danger', label: 'Inactive' },
    canceled: { variant: 'danger', label: 'Canceled' },
    past_due: { variant: 'warning', label: 'Past Due' },
    trialing: { variant: 'info', label: 'Trial' },
    Ready: { variant: 'success', label: 'Ready' },
    'Conditionally Ready': { variant: 'warning', label: 'Conditionally Ready' },
    'Not Ready': { variant: 'danger', label: 'Not Ready' },
  }
  const item = map[status] || { variant: 'default' as const, label: status }
  return <Badge variant={item.variant}>{item.label}</Badge>
}
