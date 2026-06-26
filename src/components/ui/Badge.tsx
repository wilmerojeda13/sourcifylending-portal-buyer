'use client'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'
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
    <span className={cn('badge inline-flex max-w-full whitespace-normal break-words text-center leading-tight', variants[variant], className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const { locale } = useLanguage()
  type StatusBadgeConfig = { variant: BadgeProps['variant']; label: string; key?: string }
  const map: Record<string, StatusBadgeConfig> = {
    pending: { variant: 'info', label: 'Pending', key: 'status.pending' },
    invited: { variant: 'info', label: 'Invited', key: 'status.invited' },
    completed: { variant: 'success', label: 'Completed', key: 'status.completed' },
    locked: { variant: 'locked', label: 'Locked', key: 'status.locked' },
    overdue: { variant: 'danger', label: 'Overdue', key: 'status.overdue' },
    active: { variant: 'success', label: 'Active', key: 'status.active' },
    free_active: { variant: 'success', label: 'Free Plan Active', key: 'status.freeActive' },
    paid_active: { variant: 'success', label: 'Active Subscription', key: 'status.paidActive' },
    paid_inactive: { variant: 'danger', label: 'Subscription Inactive', key: 'status.paidInactive' },
    inactive: { variant: 'danger', label: 'Inactive', key: 'status.inactive' },
    canceled: { variant: 'danger', label: 'Canceled', key: 'status.canceled' },
    past_due: { variant: 'warning', label: 'Past Due', key: 'status.pastDue' },
    trialing: { variant: 'info', label: 'Trial', key: 'status.trialing' },
    Ready: { variant: 'success', label: 'Ready', key: 'status.ready' },
    'Conditionally Ready': { variant: 'warning', label: 'Conditionally Ready', key: 'status.conditionallyReady' },
    'Not Ready': { variant: 'danger', label: 'Not Ready', key: 'status.notReady' },
  }
  const item: StatusBadgeConfig = map[status] || { variant: 'default', label: status }
  return <Badge variant={item.variant}>{item.key ? t(locale, item.key, item.label) : item.label}</Badge>
}
