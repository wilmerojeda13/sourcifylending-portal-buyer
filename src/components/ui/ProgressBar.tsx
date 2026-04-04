'use client'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number          // 0–100
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  color?: 'green' | 'green' | 'yellow'
}

export function ProgressBar({
  value,
  className,
  showLabel = false,
  size = 'md',
  color = 'green',
}: ProgressBarProps) {
  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' }
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
  }

  const pct = Math.min(100, Math.max(0, value))

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Progress</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{pct}%</span>
        </div>
      )}
      <div className={cn('w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden', heights[size])}>
        <div
          className={cn('h-full rounded-full progress-bar-fill', colors[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
