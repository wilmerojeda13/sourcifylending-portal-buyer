'use client'

import { cn } from '@/lib/utils'

const TAG_COLOR_STYLES: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  lime: 'bg-lime-100 text-lime-700 border-lime-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  sky: 'bg-sky-100 text-sky-700 border-sky-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  pink: 'bg-pink-100 text-pink-700 border-pink-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
}

export interface CRMTagBadge {
  id: string
  name: string
  slug: string
  color: string
}

export default function TagBadge({
  tag,
  onClick,
  removable = false,
  onRemove,
  className,
}: {
  tag: CRMTagBadge
  onClick?: () => void
  removable?: boolean
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
        TAG_COLOR_STYLES[tag.color] ?? TAG_COLOR_STYLES.slate,
        onClick ? 'cursor-pointer' : '',
        className,
      )}
      onClick={onClick}
    >
      {tag.name}
      {removable && onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="rounded-full px-1 text-[10px] leading-none opacity-70 hover:opacity-100"
          aria-label={`Remove ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
