'use client'

import { X } from 'lucide-react'

export default function BulkSelectionBar({
  selectedCount,
  onSelectAll,
  onClear,
  children,
}: {
  selectedCount: number
  onSelectAll?: () => void
  onClear: () => void
  children: React.ReactNode
}) {
  if (selectedCount === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/20 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold text-green-800 dark:text-green-200">
          {selectedCount.toLocaleString()} selected
        </div>
        {onSelectAll && (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs font-semibold text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
          >
            Select all filtered
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-lg border border-green-300 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100 dark:border-green-800 dark:text-green-200 dark:hover:bg-green-900/40"
        >
          <X size={14} />
          Clear
        </button>
      </div>
    </div>
  )
}
