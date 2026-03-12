'use client'

import { useState, useMemo } from 'react'
import type { AccountOpportunity, OpportunityCategory } from '@/types'
import { ExternalLink, Lock, CheckCircle, Clock, AlertCircle } from 'lucide-react'

interface Props {
  opportunities: AccountOpportunity[]
  currentStage: string | null
  assignedProgram: string | null
  isActive: boolean
}

const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  funding: 'Business Card',
  vendor: 'Net-30 Vendor',
  store: 'Store Account',
  fleet: 'Fleet / Gas',
  cash: 'Cash / Line',
  monitoring: 'Monitoring',
}

const CATEGORY_COLORS: Record<OpportunityCategory, string> = {
  funding: 'bg-blue-100 text-blue-700',
  vendor: 'bg-purple-100 text-purple-700',
  store: 'bg-orange-100 text-orange-700',
  fleet: 'bg-yellow-100 text-yellow-700',
  cash: 'bg-green-100 text-green-700',
  monitoring: 'bg-gray-100 text-gray-600',
}

const ALL_CATEGORIES: (OpportunityCategory | '')[] = [
  '', 'funding', 'vendor', 'store', 'fleet', 'cash', 'monitoring',
]

function getOpportunityStatus(opp: AccountOpportunity, currentStage: string | null) {
  if (!currentStage) return 'future'
  if (opp.stage === currentStage) return 'recommended'

  // Simplified stage ordering per program
  const stageOrder: Record<string, string[]> = {
    program_a: ['Credit Readiness', 'Application Strategy', 'Card Acquisition', 'Optimization'],
    program_b: ['Foundation', 'Store Credit', 'Fleet & Gas', 'Cash & Revolving'],
    program_c: ['Monthly Review'],
  }

  const programStages = Object.values(stageOrder).find((arr) => arr.includes(opp.stage))
  if (!programStages) return 'future'

  const oppIdx = programStages.indexOf(opp.stage)
  const userIdx = programStages.indexOf(currentStage)

  if (userIdx === -1) return 'future'
  if (oppIdx <= userIdx) return 'recommended'
  return 'future'
}

export default function OpportunitiesClient({
  opportunities,
  currentStage,
  assignedProgram,
  isActive,
}: Props) {
  const [filterCategory, setFilterCategory] = useState<OpportunityCategory | ''>('')
  const [filterPG, setFilterPG] = useState<'all' | 'yes' | 'no' | 'varies'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'recommended' | 'future'>('all')

  const enriched = useMemo(() =>
    opportunities.map((opp) => ({
      ...opp,
      status: getOpportunityStatus(opp, currentStage),
    })),
    [opportunities, currentStage]
  )

  const filtered = useMemo(() => {
    return enriched.filter((opp) => {
      if (filterCategory && opp.category !== filterCategory) return false
      if (filterPG !== 'all' && opp.pg_required !== filterPG) return false
      if (filterStatus !== 'all' && opp.status !== filterStatus) return false
      return true
    })
  }, [enriched, filterCategory, filterPG, filterStatus])

  const recommendedCount = enriched.filter((o) => o.status === 'recommended').length
  const futureCount = enriched.filter((o) => o.status === 'future').length

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-center">
          <div className="text-lg font-bold text-green-700">{recommendedCount}</div>
          <div className="text-xs text-green-600">Recommended Now</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-center">
          <div className="text-lg font-bold text-gray-600">{futureCount}</div>
          <div className="text-xs text-gray-500">Future Stage</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-center">
          <div className="text-lg font-bold text-blue-700">{opportunities.length}</div>
          <div className="text-xs text-blue-600">Total Available</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2.5 flex-wrap items-center">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as OpportunityCategory | '')}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Categories</option>
          {ALL_CATEGORIES.filter(Boolean).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c as OpportunityCategory]}</option>
          ))}
        </select>

        <select
          value={filterPG}
          onChange={(e) => setFilterPG(e.target.value as typeof filterPG)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">All (PG / No PG)</option>
          <option value="no">No Personal Guarantee</option>
          <option value="yes">Personal Guarantee Required</option>
          <option value="varies">PG Varies</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">All Stages</option>
          <option value="recommended">Recommended Now</option>
          <option value="future">Future Stage</option>
        </select>

        <span className="text-sm text-gray-400 ml-1">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((opp) => (
          <OpportunityCard
            key={opp.id}
            opp={opp}
            status={opp.status as 'recommended' | 'future'}
            isActive={isActive}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No opportunities match the selected filters.
        </div>
      )}
    </div>
  )
}

function OpportunityCard({
  opp,
  status,
  isActive,
}: {
  opp: AccountOpportunity
  status: 'recommended' | 'future'
  isActive: boolean
}) {
  const isRecommended = status === 'recommended'
  const blurred = !isActive

  return (
    <div
      className={`bg-white rounded-2xl border p-5 space-y-3 transition-all ${
        isRecommended
          ? 'border-green-200 shadow-sm ring-1 ring-green-100'
          : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isRecommended ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                <CheckCircle size={10} /> Recommended Now
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full uppercase tracking-wide">
                <Clock size={10} /> Future Stage
              </span>
            )}
            {opp.pg_required === 'no' && (
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                No PG
              </span>
            )}
            {opp.pg_required === 'yes' && (
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                PG Required
              </span>
            )}
            {opp.pg_required === 'varies' && (
              <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                PG Varies
              </span>
            )}
          </div>
          <h3 className="font-bold text-gray-900 text-sm leading-snug">{opp.name}</h3>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[opp.category]}`}>
          {CATEGORY_LABELS[opp.category]}
        </span>
      </div>

      {/* Terms */}
      {opp.terms && (
        <p className="text-xs text-green-700 font-medium bg-green-50 px-3 py-1.5 rounded-lg">
          {opp.terms}
        </p>
      )}

      {/* Description */}
      {opp.description && (
        <p className={`text-xs text-gray-600 leading-relaxed ${blurred ? 'blur-sm select-none' : ''}`}>
          {opp.description}
        </p>
      )}

      {/* Reports to */}
      {opp.reports_to && (
        <p className={`text-xs text-gray-400 ${blurred ? 'blur-sm select-none' : ''}`}>
          Reports to: <span className="text-gray-600">{opp.reports_to}</span>
        </p>
      )}

      {blurred && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
          <Lock size={12} />
          Reactivate your membership to view full details
        </div>
      )}

      {/* Actions */}
      {!blurred && (opp.learn_more_url || opp.apply_url) && (
        <div className="flex gap-2 pt-1">
          {opp.learn_more_url && (
            <a
              href={opp.learn_more_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Learn More <ExternalLink size={10} />
            </a>
          )}
          {opp.apply_url && (
            <a
              href={opp.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
            >
              Apply Now <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}

      {!blurred && !opp.learn_more_url && !opp.apply_url && isRecommended && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
          <AlertCircle size={12} />
          Contact your advisor for application guidance
        </div>
      )}

      {/* Stage label */}
      <p className="text-[10px] text-gray-300 pt-0.5">Stage: {opp.stage}</p>
    </div>
  )
}
