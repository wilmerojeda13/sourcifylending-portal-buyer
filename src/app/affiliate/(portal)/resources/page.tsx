'use client'
import { useEffect, useState } from 'react'
import { BookOpen, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

type ResourceCategory = 'compliance' | 'marketing' | 'program_summary' | 'sales_language' | 'how_it_works'

interface Resource {
  id: string
  title: string
  category: ResourceCategory
  content: string
  sort_order: number
}

const CATEGORY_CONFIG: Record<ResourceCategory, { label: string; color: string; bg: string }> = {
  compliance:      { label: 'Compliance',       color: 'text-red-700 dark:text-red-400',    bg: 'bg-red-100 dark:bg-red-900/40' },
  marketing:       { label: 'Marketing',        color: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-100 dark:bg-blue-900/40' },
  program_summary: { label: 'Program Summary',  color: 'text-indigo-700 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  sales_language:  { label: 'Sales Language',   color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-100 dark:bg-green-900/40' },
  how_it_works:    { label: 'How It Works',     color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/40' },
}

const FILTER_TABS = [
  { label: 'All', value: '' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Program Summary', value: 'program_summary' },
  { label: 'Sales Language', value: 'sales_language' },
  { label: 'Compliance', value: 'compliance' },
  { label: 'How It Works', value: 'how_it_works' },
]

function CategoryBadge({ category }: { category: ResourceCategory }) {
  const cfg = CATEGORY_CONFIG[category] ?? { label: category, color: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-700' }
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full uppercase ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function ResourceCard({ resource }: { resource: Resource }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-4 px-5 py-5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <CategoryBadge category={resource.category} />
          </div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-snug">{resource.title}</h3>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? (
            <ChevronUp size={18} className="text-gray-400 dark:text-gray-500" />
          ) : (
            <ChevronDown size={18} className="text-gray-400 dark:text-gray-500" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800">
          <div className="mt-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
            {resource.content}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AffiliateResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    fetch('/api/affiliate/resources')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setResources(d.resources ?? [])
      })
      .catch(() => setError('Failed to load resources'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = categoryFilter
    ? resources.filter((r) => r.category === categoryFilter)
    : resources

  if (error) {
    return (
      <div className="pt-16 lg:pt-0 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Failed to load resources</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-16 lg:pt-0">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Affiliate Resource Center</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
          Use only approved content when promoting SourcifyLending.
        </p>
      </div>

      {/* Compliance notice */}
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4 flex items-start gap-3">
        <span className="text-lg shrink-0">⚠️</span>
        <div>
          <p className="text-xs font-bold text-red-800 dark:text-red-300 uppercase tracking-wide mb-0.5">Compliance Notice</p>
          <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
            Only use pre-approved language and materials from this resource center. Do not make income guarantees,
            credit score promises, or claims not provided here. Violations may result in affiliate suspension.
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTER_TABS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setCategoryFilter(value)}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              categoryFilter === value
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 dark:text-gray-500 hover:border-indigo-200 dark:hover:border-indigo-700 hover:text-indigo-700 dark:text-indigo-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Resources list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm py-16 text-center">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <BookOpen size={22} className="text-gray-400 dark:text-gray-500" />
          </div>
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 dark:text-gray-500">
            {categoryFilter ? 'No resources in this category' : 'No resources available yet'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Check back soon — content is added regularly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  )
}
