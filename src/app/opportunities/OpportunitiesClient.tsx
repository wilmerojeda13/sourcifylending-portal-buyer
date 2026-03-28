'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import type { AccountOpportunity, OpportunityCategory } from '@/types'
import {
  ExternalLink, Lock, CheckCircle, Clock, AlertCircle, Sparkles,
  Brain, ChevronDown, ChevronUp, AlertTriangle, X, ArrowRight,
  Shield, TrendingUp, Star, CheckCheck, XCircle, RotateCcw,
} from 'lucide-react'
import OutcomeFeedbackModal from '@/components/OutcomeFeedbackModal'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MatchResult {
  stage_label: string
  computed_stage: string
  tradeline_count: number
  tradeline_range: string
  recommended: Array<AccountOpportunity & { ai_reasoning: string | null; approval_probability: 'high' | 'medium' | 'low' }>
  locked: AccountOpportunity[]
  completed_stages: AccountOpportunity[]
  stage_counts: { current: number; future: number; completed: number }
}

interface Props {
  opportunities: AccountOpportunity[]
  currentStage: string | null
  assignedProgram: string | null
  isActive: boolean
  userIndustry?: string | null
  userStatuses?: Record<string, string>   // opportunityId → 'applied' | 'approved' | 'denied' | 'pending'
}

// ─── Stage Metadata ───────────────────────────────────────────────────────────
const B_STAGES = ['Foundation', 'Store Credit', 'Fleet & Gas', 'Cash & Revolving']

const STAGE_META: Record<string, { num: number; range: string; advanceTo: string; advanceReq: string }> = {
  Foundation:         { num: 1, range: '0–2 tradelines',  advanceTo: 'Store Credit',    advanceReq: 'Open 3+ reporting vendor accounts' },
  'Store Credit':     { num: 2, range: '3–5 tradelines',  advanceTo: 'Fleet & Gas',     advanceReq: 'Build 6+ total tradelines' },
  'Fleet & Gas':      { num: 3, range: '6–8 tradelines',  advanceTo: 'Cash & Revolving',advanceReq: 'Build 9+ total tradelines' },
  'Cash & Revolving': { num: 4, range: '9+ tradelines',   advanceTo: '',                advanceReq: 'Top stage — apply for corporate cards' },
}

// ─── Category display ─────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  funding: 'Business Card',
  vendor: 'Net-30 Vendor',
  store: 'Store Account',
  fleet: 'Fleet / Gas',
  cash: 'Cash / Line',
  monitoring: 'Monitoring',
}

const CATEGORY_COLORS: Record<OpportunityCategory, string> = {
  funding:    'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  vendor:     'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  store:      'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  fleet:      'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  cash:       'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  monitoring: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
}

const ALL_CATEGORIES: (OpportunityCategory | '')[] = ['', 'funding', 'vendor', 'store', 'fleet', 'cash', 'monitoring']

// ─── Industry personalization ─────────────────────────────────────────────────
const INDUSTRY_TIPS: Record<string, { headline: string; tips: string[] }> = {
  Construction: {
    headline: 'Construction & Contracting Funding Priorities',
    tips: [
      'Fleet/gas cards are especially valuable — fuel costs are a major operating expense',
      'Net-30 vendors like Grainger and Lowe\'s report to D&B while covering job-site supplies',
      'Establish equipment financing tradelines early — lenders look for asset-backed credit history',
    ],
  },
  Healthcare: {
    headline: 'Healthcare & Medical Funding Priorities',
    tips: [
      'Business credit cards with 0% intro APR can bridge gaps between insurance reimbursements',
      'Vendor accounts for medical supplies help build business credit without a personal guarantee',
      'Revenue-based lines of credit are popular in healthcare — show consistent monthly deposits',
    ],
  },
  Technology: {
    headline: 'Tech & Software Funding Priorities',
    tips: [
      'Corporate cards (Brex, Ramp) are designed for tech companies and report to D&B without a personal guarantee',
      'SaaS businesses often qualify for lines of credit based on recurring revenue',
      'Dell and Lenovo business credit are strong tech-specific tradelines that report to multiple bureaus',
    ],
  },
  Retail: {
    headline: 'Retail & E-Commerce Funding Priorities',
    tips: [
      'Store accounts are easy entry points that report to business bureaus',
      'High-limit business cards with rewards optimize inventory purchasing while building credit history',
      'Net-30 vendor accounts for packaging and supplies (Uline, Quill) are ideal starter tradelines',
    ],
  },
  'Restaurants/Food Service': {
    headline: 'Food & Hospitality Funding Priorities',
    tips: [
      'Fleet/gas cards cover delivery vehicle costs and report monthly to business bureaus',
      'Net-30 vendor accounts with food/supply distributors establish early trade history',
      'Business cards with dining and food service rewards maximize return on daily spending',
    ],
  },
  'Transportation/Logistics': {
    headline: 'Transportation & Logistics Funding Priorities',
    tips: [
      'WEX and Shell Fleet cards are purpose-built for this industry — report to D&B and Experian',
      'Fleet account tradelines are the fastest path to a strong PAYDEX score for logistics companies',
      'Fuel and maintenance vendor net-30 accounts diversify your tradeline portfolio quickly',
    ],
  },
  'Real Estate': {
    headline: 'Real Estate Funding Priorities',
    tips: [
      'Lowe\'s and CDW accounts are strong tradelines for property investors and landlords',
      '0% intro APR business cards provide interest-free working capital for renovations',
      'Business lines of credit are preferred by RE investors — establish the profile now before you need them',
    ],
  },
  'Professional Services': {
    headline: 'Professional Services Funding Priorities',
    tips: [
      'Corporate charge cards (Brex, Ramp) require no personal guarantee and suit service businesses',
      'Build tradelines through office supply vendors (Quill, Staples) while covering everyday expenses',
      'Business credit cards with travel and software rewards align with typical service business spending',
    ],
  },
  Manufacturing: {
    headline: 'Manufacturing Funding Priorities',
    tips: [
      'Grainger, Zoro, and Graybar industrial net-30 accounts are strong manufacturing tradelines',
      'Equipment financing tradelines improve your business credit depth and signal capital worthiness',
      'Fleet accounts for delivery and logistics vehicles report monthly to business bureaus',
    ],
  },
}

// ─── Activity tracker (fire-and-forget) ──────────────────────────────────────
function trackEvent(eventType: string, data?: Record<string, unknown>) {
  fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, event_data: data }),
  }).catch(() => {}) // Never block the UI
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

function getOpportunityStatus(opp: AccountOpportunity, currentStage: string | null): 'recommended' | 'future' {
  if (!currentStage) return 'future'
  const stageOrder: Record<string, string[]> = {
    program_a: ['Credit Readiness', 'Application Strategy', 'Card Acquisition', 'Optimization'],
    program_b: B_STAGES,
    program_c: ['Monthly Review'],
  }
  const programStages = Object.values(stageOrder).find(arr => arr.includes(opp.stage))
  if (!programStages) return 'future'
  const oppIdx = programStages.indexOf(opp.stage)
  const userIdx = programStages.indexOf(currentStage)
  if (userIdx === -1) return 'future'
  return oppIdx <= userIdx ? 'recommended' : 'future'
}

function rankScore(opp: AccountOpportunity): number {
  let score = opp.priority_score ?? 50
  if (opp.pg_required === 'no') score += 15
  if (opp.reports_to?.includes('Dun & Bradstreet')) score += 8
  score += (opp.reports_to?.split(',').length ?? 1) * 3
  return score
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-700">
      <CheckCheck size={9} /> Approved
    </span>
  )
  if (status === 'applied' || status === 'pending') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-700">
      <Clock size={9} /> Applied
    </span>
  )
  if (status === 'denied') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-700">
      <XCircle size={9} /> Denied
    </span>
  )
  return null
}

// ─── MarkResultRow ────────────────────────────────────────────────────────────
// Shown on each active card so the user can record what happened
function MarkResultRow({
  oppId,
  currentStatus,
  onMark,
  onClear,
}: {
  oppId: string
  currentStatus: string | null
  onMark: (oppId: string, status: string) => void
  onClear: (oppId: string) => void
}) {
  if (currentStatus === 'approved') {
    return (
      <div className="flex items-center gap-2 pt-1">
        <StatusBadge status="approved" />
        <button
          onClick={() => onClear(oppId)}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
          title="Undo"
        >
          <RotateCcw size={9} /> Undo
        </button>
      </div>
    )
  }
  if (currentStatus === 'applied' || currentStatus === 'pending') {
    return (
      <div className="flex items-center gap-2 pt-1">
        <StatusBadge status="applied" />
        <button
          onClick={() => onMark(oppId, 'approved')}
          className="text-[10px] bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-lg border border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
        >
          ✓ Got Approved
        </button>
        <button
          onClick={() => onClear(oppId)}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
        >
          <RotateCcw size={9} />
        </button>
      </div>
    )
  }
  if (currentStatus === 'denied') {
    return (
      <div className="flex items-center gap-2 pt-1">
        <StatusBadge status="denied" />
        <button
          onClick={() => onClear(oppId)}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
        >
          <RotateCcw size={9} /> Reset
        </button>
      </div>
    )
  }
  // No status yet — show mark buttons
  return (
    <div className="flex items-center gap-1 pt-1 flex-wrap">
      <span className="text-[10px] text-gray-400 mr-0.5">Mark result:</span>
      <button
        onClick={() => onMark(oppId, 'approved')}
        className="text-[10px] bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-lg border border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors font-medium"
      >
        ✓ Approved
      </button>
      <button
        onClick={() => onMark(oppId, 'applied')}
        className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
      >
        ⏳ Applied
      </button>
      <button
        onClick={() => onMark(oppId, 'denied')}
        className="text-[10px] bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-lg border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors font-medium"
      >
        ✗ Denied
      </button>
    </div>
  )
}

// ─── CompletedSection ─────────────────────────────────────────────────────────
function CompletedSection({
  opps,
  localStatuses,
  onClear,
}: {
  opps: AccountOpportunity[]
  localStatuses: Record<string, string>
  onClear: (oppId: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (opps.length === 0) return null

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition-colors w-full text-left"
      >
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        <CheckCheck size={15} className="text-green-500" />
        Completed Opportunities
        <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold ml-1">
          {opps.length}
        </span>
        <span className="text-xs text-gray-400 font-normal ml-auto">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {opps.map(opp => {
            const status = localStatuses[opp.id]
            return (
              <div
                key={opp.id}
                className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-start justify-between gap-3 opacity-75"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <StatusBadge status={status} />
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[opp.category]}`}>
                      {CATEGORY_LABELS[opp.category]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 leading-snug">{opp.name}</p>
                  {opp.terms && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{opp.terms}</p>}
                </div>
                <button
                  onClick={() => onClear(opp.id)}
                  className="shrink-0 text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors whitespace-nowrap"
                  title="Move back to active"
                >
                  <RotateCcw size={10} /> Undo
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OpportunitiesClient({
  opportunities,
  currentStage,
  assignedProgram,
  isActive,
  userIndustry,
  userStatuses = {},
}: Props) {
  // Local status state — initialised from server, updated optimistically
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>(userStatuses)

  const markStatus = useCallback(async (oppId: string, status: string) => {
    setLocalStatuses(prev => ({ ...prev, [oppId]: status }))
    fetch('/api/opportunities/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: oppId, status }),
    }).catch(() => {})
  }, [])

  const clearStatus = useCallback(async (oppId: string) => {
    setLocalStatuses(prev => {
      const next = { ...prev }
      delete next[oppId]
      return next
    })
    fetch('/api/opportunities/status', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: oppId }),
    }).catch(() => {})
  }, [])

  const [matchData, setMatchData] = useState<MatchResult | null>(null)
  const [matchLoading, setMatchLoading] = useState(assignedProgram === 'program_b')
  const [warnOpportunity, setWarnOpportunity] = useState<AccountOpportunity | null>(null)
  const [feedbackOpportunity, setFeedbackOpportunity] = useState<AccountOpportunity | null>(null)
  const [showBrowseAll, setShowBrowseAll] = useState(false)
  const [filterCategory, setFilterCategory] = useState<OpportunityCategory | ''>('')
  const [filterPG, setFilterPG] = useState<'all' | 'yes' | 'no' | 'varies'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'recommended' | 'future'>('all')

  // When the feedback modal is submitted, sync status locally
  const handleFeedbackSubmitted = useCallback((opp: AccountOpportunity, outcome: string) => {
    const map: Record<string, string> = { approved: 'approved', denied: 'denied', pending: 'applied' }
    if (map[outcome]) markStatus(opp.id, map[outcome])
    setFeedbackOpportunity(null)
  }, [markStatus])

  // Fire outcome feedback modal ~3s after clicking Apply
  const handleApply = useCallback((opp: AccountOpportunity) => {
    fetch('/api/events/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'application_started',
        opportunity_id: opp.id,
        opportunity_name: opp.name,
        stage: opp.stage,
        program: opp.program,
      }),
    }).catch(() => {})
    setTimeout(() => setFeedbackOpportunity(opp), 3000)
  }, [])

  // Fetch AI match data for Program B
  useEffect(() => {
    if (assignedProgram !== 'program_b') return
    fetch('/api/opportunities/match')
      .then(r => r.json())
      .then(data => setMatchData(data))
      .catch(() => {})
      .finally(() => setMatchLoading(false))
  }, [assignedProgram])

  // Exclude monitoring category for apply-able opps
  const applyableOpps = useMemo(() =>
    opportunities.filter(o => o.category !== 'monitoring'),
  [opportunities])

  const localRecommended = useMemo(() => {
    if (!currentStage) return []
    const stageOpps = applyableOpps.filter(o => o.stage === currentStage)
    const fallback = stageOpps.length === 0
      ? applyableOpps.filter(o => o.stage === 'Store Credit')
      : stageOpps
    return [...fallback]
      .sort((a, b) => rankScore(b) - rankScore(a))
      .slice(0, 3)
      .map(o => ({ ...o, ai_reasoning: null as string | null, approval_probability: 'high' as const }))
  }, [applyableOpps, currentStage])

  const localLocked = useMemo(() => {
    if (!currentStage) return []
    const userIdx = B_STAGES.indexOf(currentStage)
    return applyableOpps.filter(o => B_STAGES.indexOf(o.stage) > userIdx)
  }, [applyableOpps, currentStage])

  const recommended = matchData?.recommended ?? localRecommended
  const locked = matchData?.locked ?? localLocked
  const industryTip = userIndustry ? INDUSTRY_TIPS[userIndustry] : null

  // ── Program B: Full Engine UI ──────────────────────────────────────────────
  if (assignedProgram === 'program_b') {
    const stage = currentStage ?? 'Foundation'
    const stageMeta = STAGE_META[stage]
    const userStageIdx = B_STAGES.indexOf(stage)

    // Active = not approved; Completed = approved
    const activeRecommended = recommended.filter(o => localStatuses[o.id] !== 'approved')
    const completedOpps = opportunities.filter(o => localStatuses[o.id] === 'approved')

    return (
      <div className="space-y-6">

        {/* ── Stage Progress Banner ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-widest mb-1">Current Stage</p>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {stageMeta?.num}
                </span>
                {stage}
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {stageMeta?.range} · {matchData?.tradeline_count ?? '—'} tradeline tasks completed
              </p>
            </div>
            {stageMeta?.advanceTo && (
              <div className="text-right shrink-0">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold">Next Stage</p>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1 justify-end">
                  {stageMeta.advanceTo} <ArrowRight size={14} className="text-green-500" />
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{stageMeta.advanceReq}</p>
              </div>
            )}
          </div>

          {/* Stage progress track */}
          <div className="flex items-center gap-0">
            {B_STAGES.map((s, idx) => {
              const isPast = idx < userStageIdx
              const isCurrent = idx === userStageIdx
              const isFuture = idx > userStageIdx
              return (
                <div key={s} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`h-2 w-full rounded-full transition-all ${
                      isPast ? 'bg-green-500' :
                      isCurrent ? 'bg-green-600' :
                      'bg-gray-100 dark:bg-gray-700'
                    }`} />
                    <span className={`text-[9px] font-semibold mt-1.5 text-center leading-tight ${
                      isCurrent ? 'text-green-600' : isPast ? 'text-green-400' : 'text-gray-300 dark:text-gray-600'
                    }`}>
                      {s}
                    </span>
                  </div>
                  {idx < B_STAGES.length - 1 && (
                    <ArrowRight size={10} className={`shrink-0 mx-0.5 mb-3 ${isFuture ? 'text-gray-200' : 'text-green-400'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Industry Tip ── */}
        {industryTip && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-green-600" />
              <p className="text-sm font-bold text-green-900">{industryTip.headline}</p>
            </div>
            <ul className="space-y-1.5">
              {industryTip.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-green-800">
                  <span className="text-green-500 font-bold mt-0.5 shrink-0">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Section 1: Recommended Next Accounts ── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-green-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Recommended Next Accounts</h2>
            <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">
              {stage} Stage
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 ml-0.5">
            Open these accounts in order. Each builds your business credit and advances you to the next stage.
          </p>

          {matchLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-green-100 dark:border-green-900/40 p-5 animate-pulse space-y-3">
                  <div className="flex gap-2 items-center">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/40 rounded-full shrink-0" />
                    <div className="flex-1">
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-16 mb-1" />
                      <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded w-3/4" />
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-full" />
                  <div className="h-14 bg-blue-50 dark:bg-blue-900/20 rounded-xl" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
                  <div className="h-9 bg-green-100 dark:bg-green-900/40 rounded-xl" />
                </div>
              ))}
            </div>
          ) : activeRecommended.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeRecommended.map((opp, idx) => (
                <RecommendedCard
                  key={opp.id}
                  opp={opp}
                  rank={idx + 1}
                  isActive={isActive}
                  currentStatus={localStatuses[opp.id] ?? null}
                  onApply={handleApply}
                  onMarkStatus={markStatus}
                  onClearStatus={clearStatus}
                />
              ))}
            </div>
          ) : recommended.length > 0 && activeRecommended.length === 0 ? (
            // All recommended are approved — show a congrats banner
            <div className="text-center py-8 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl">
              <CheckCheck size={28} className="mx-auto mb-2 text-green-500" />
              <p className="text-sm font-bold text-green-800 dark:text-green-300">All current-stage accounts completed!</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">Great work. Your advisor will advance your stage when tradelines report.</p>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
              <AlertCircle size={24} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              No opportunities found for your current stage. Contact your advisor.
            </div>
          )}
        </div>

        {/* ── Section 2: Locked Opportunities ── */}
        {locked.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Lock size={15} className="text-gray-400" />
              <h2 className="text-base font-bold text-gray-500 dark:text-gray-400">Locked Opportunities</h2>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-semibold">
                {locked.length} accounts
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 ml-0.5">
              Complete your <strong className="text-gray-600 dark:text-gray-300">{stage}</strong> stage accounts first to unlock these.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {locked.slice(0, 6).map(opp => (
                <LockedCard
                  key={opp.id}
                  opp={opp}
                  currentStage={stage}
                  onApplyAttempt={() => setWarnOpportunity(opp)}
                />
              ))}
            </div>
            {locked.length > 6 && (
              <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-3">
                +{locked.length - 6} more locked opportunities unlock as you progress
              </p>
            )}
          </div>
        )}

        {/* ── Section 3: Browse All (collapsible) ── */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-5">
          <button
            onClick={() => setShowBrowseAll(!showBrowseAll)}
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition-colors"
          >
            {showBrowseAll ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Browse All {opportunities.length} Program B Opportunities
          </button>

          {showBrowseAll && (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2.5 flex-wrap items-center">
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value as OpportunityCategory | '')}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Categories</option>
                  {ALL_CATEGORIES.filter(Boolean).map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c as OpportunityCategory]}</option>
                  ))}
                </select>
                <select
                  value={filterPG}
                  onChange={e => setFilterPG(e.target.value as typeof filterPG)}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All (PG / No PG)</option>
                  <option value="no">No Personal Guarantee</option>
                  <option value="yes">PG Required</option>
                  <option value="varies">PG Varies</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {opportunities
                  .filter(o => {
                    if (filterCategory && o.category !== filterCategory) return false
                    if (filterPG !== 'all' && o.pg_required !== filterPG) return false
                    return true
                  })
                  .map(opp => {
                    const oppIdx = B_STAGES.indexOf(opp.stage)
                    const isLocked = oppIdx > userStageIdx
                    return (
                      <OpportunityCard
                        key={opp.id}
                        opp={opp}
                        status={isLocked ? 'future' : 'recommended'}
                        isActive={isActive}
                        isLocked={isLocked}
                        currentStatus={localStatuses[opp.id] ?? null}
                        onLockedApply={isLocked ? () => setWarnOpportunity(opp) : undefined}
                        onApply={!isLocked ? handleApply : undefined}
                        onMarkStatus={markStatus}
                        onClearStatus={clearStatus}
                      />
                    )
                  })}
              </div>
            </div>
          )}
        </div>

        {/* ── Section 4: Completed Opportunities ── */}
        <CompletedSection
          opps={completedOpps}
          localStatuses={localStatuses}
          onClear={clearStatus}
        />

        {/* ── Out-of-Sequence Warning Modal ── */}
        {warnOpportunity && (
          <WarningModal
            opp={warnOpportunity}
            currentStage={stage}
            onClose={() => setWarnOpportunity(null)}
            onApplyAway={handleApply}
          />
        )}

        {/* ── Outcome Feedback Modal ── */}
        {feedbackOpportunity && (
          <OutcomeFeedbackModal
            opportunityName={feedbackOpportunity.name}
            opportunityId={feedbackOpportunity.id}
            program={feedbackOpportunity.program ?? assignedProgram ?? undefined}
            stage={feedbackOpportunity.stage ?? undefined}
            onClose={() => setFeedbackOpportunity(null)}
            onSubmitted={(outcome) => handleFeedbackSubmitted(feedbackOpportunity, outcome)}
          />
        )}
      </div>
    )
  }

  // ── Program A / C: existing UI ─────────────────────────────────────────────
  const enriched = useMemo(() =>
    opportunities.map(opp => ({
      ...opp,
      status: getOpportunityStatus(opp, currentStage),
    })), [opportunities, currentStage])

  // Separate active from completed (approved)
  const activeEnriched = enriched.filter(o => localStatuses[o.id] !== 'approved')
  const completedEnrichedOpps = enriched.filter(o => localStatuses[o.id] === 'approved')

  const filtered = activeEnriched.filter(opp => {
    if (filterCategory && opp.category !== filterCategory) return false
    if (filterPG !== 'all' && opp.pg_required !== filterPG) return false
    if (filterStatus !== 'all' && opp.status !== filterStatus) return false
    return true
  })

  const recommendedCount = activeEnriched.filter(o => o.status === 'recommended').length
  const futureCount = activeEnriched.filter(o => o.status === 'future').length

  return (
    <div className="space-y-5">
      {industryTip && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-green-600" />
            <p className="text-sm font-bold text-green-900">{industryTip.headline}</p>
          </div>
          <ul className="space-y-1.5">
            {industryTip.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-green-800">
                <span className="text-green-500 font-bold mt-0.5 shrink-0">•</span>
                {tip}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-green-600 mt-2 opacity-70">Based on your industry: {userIndustry}</p>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2.5 text-center">
          <div className="text-lg font-bold text-green-700 dark:text-green-400">{recommendedCount}</div>
          <div className="text-xs text-green-600 dark:text-green-500">Recommended Now</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-center">
          <div className="text-lg font-bold text-gray-600 dark:text-gray-300">{futureCount}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Future Stage</div>
        </div>
        {completedEnrichedOpps.length > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5 text-center">
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{completedEnrichedOpps.length}</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-500">Completed</div>
          </div>
        )}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2.5 text-center">
          <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{opportunities.length}</div>
          <div className="text-xs text-blue-600 dark:text-blue-500">Total Available</div>
        </div>
      </div>

      <div className="flex gap-2.5 flex-wrap items-center">
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as OpportunityCategory | '')} className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          <option value="">All Categories</option>
          {ALL_CATEGORIES.filter(Boolean).map(c => <option key={c} value={c}>{CATEGORY_LABELS[c as OpportunityCategory]}</option>)}
        </select>
        <select value={filterPG} onChange={e => setFilterPG(e.target.value as typeof filterPG)} className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          <option value="all">All (PG / No PG)</option>
          <option value="no">No Personal Guarantee</option>
          <option value="yes">PG Required</option>
          <option value="varies">PG Varies</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          <option value="all">All Stages</option>
          <option value="recommended">Recommended Now</option>
          <option value="future">Future Stage</option>
        </select>
        <span className="text-sm text-gray-400 dark:text-gray-500 ml-1">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(opp => (
          <OpportunityCard
            key={opp.id}
            opp={opp}
            status={opp.status as 'recommended' | 'future'}
            isActive={isActive}
            currentStatus={localStatuses[opp.id] ?? null}
            onApply={handleApply}
            onMarkStatus={markStatus}
            onClearStatus={clearStatus}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          No opportunities match the selected filters.
        </div>
      )}

      {/* ── Completed Opportunities ── */}
      <CompletedSection
        opps={completedEnrichedOpps}
        localStatuses={localStatuses}
        onClear={clearStatus}
      />

      {/* ── Outcome Feedback Modal ── */}
      {feedbackOpportunity && (
        <OutcomeFeedbackModal
          opportunityName={feedbackOpportunity.name}
          opportunityId={feedbackOpportunity.id}
          program={feedbackOpportunity.program ?? assignedProgram ?? undefined}
          stage={feedbackOpportunity.stage ?? undefined}
          onClose={() => setFeedbackOpportunity(null)}
          onSubmitted={(outcome) => handleFeedbackSubmitted(feedbackOpportunity, outcome)}
        />
      )}
    </div>
  )
}

// ─── RecommendedCard ──────────────────────────────────────────────────────────
function RecommendedCard({
  opp,
  rank,
  isActive,
  currentStatus,
  onApply,
  onMarkStatus,
  onClearStatus,
}: {
  opp: AccountOpportunity & { ai_reasoning: string | null; approval_probability?: 'high' | 'medium' | 'low' }
  rank: number
  isActive: boolean
  currentStatus: string | null
  onApply?: (opp: AccountOpportunity) => void
  onMarkStatus: (oppId: string, status: string) => void
  onClearStatus: (oppId: string) => void
}) {
  const learnMoreUrl = safeUrl(opp.learn_more_url)
  const prob = opp.approval_probability ?? (opp.pg_required === 'no' ? 'high' : 'medium')
  const rankIcon = ['🥇', '🥈', '🥉'][rank - 1] ?? `#${rank}`
  const isApproved = currentStatus === 'approved'

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm ring-1 p-5 flex flex-col space-y-3 transition-all ${
      isApproved
        ? 'border-green-300 dark:border-green-700 ring-green-200 dark:ring-green-800 opacity-60'
        : 'border-green-200 dark:border-green-700 ring-green-100 dark:ring-green-900/40'
    }`}>
      {/* Rank + Category */}
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base ${
          rank === 1 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-700' :
          rank === 2 ? 'bg-gray-50 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600' :
          'bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700'
        }`}>
          {rankIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {!isApproved && (
              <span className="text-[10px] font-bold bg-green-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                #{rank} Pick
              </span>
            )}
            {currentStatus && <StatusBadge status={currentStatus} />}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[opp.category]}`}>
              {CATEGORY_LABELS[opp.category]}
            </span>
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{opp.name}</h3>
        </div>
      </div>

      {/* Approval probability + PG badge */}
      {!isApproved && (
        <div className="flex gap-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
            prob === 'high' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
            prob === 'medium' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' :
            'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
          }`}>
            <TrendingUp size={9} />
            {prob === 'high' ? 'High' : prob === 'medium' ? 'Medium' : 'Lower'} Approval Odds
          </span>
          {opp.pg_required === 'no' && (
            <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Shield size={9} /> No PG
            </span>
          )}
          {opp.pg_required === 'yes' && (
            <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
              PG Required
            </span>
          )}
        </div>
      )}

      {/* Terms */}
      {opp.terms && (
        <p className="text-xs text-green-700 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-lg">
          {opp.terms}
        </p>
      )}

      {/* AI Reasoning or fallback description */}
      {!isApproved && (opp.ai_reasoning ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <Brain size={13} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{opp.ai_reasoning}</p>
        </div>
      ) : opp.description ? (
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{opp.description}</p>
      ) : null)}

      {/* Bureau reporting */}
      {opp.reports_to && (
        <div className="flex items-center gap-1.5">
          <Star size={11} className="text-amber-400 shrink-0" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Reports to: <span className="font-semibold text-gray-700 dark:text-gray-200">{opp.reports_to}</span>
          </p>
        </div>
      )}

      <div className="flex-1" />

      {/* Action buttons */}
      {isApproved ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-green-700 font-semibold flex items-center gap-1.5">
            <CheckCheck size={14} /> You got this one!
          </span>
          <button
            onClick={() => onClearStatus(opp.id)}
            className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
          >
            <RotateCcw size={9} /> Undo
          </button>
        </div>
      ) : !isActive ? (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-700">
          <Lock size={12} /> Reactivate membership to apply
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            {learnMoreUrl && (
              <a
                href={learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                Learn More <ExternalLink size={10} />
              </a>
            )}
            {opp.apply_url ? (
              <a
                href={`/api/opportunities/redirect?id=${opp.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onApply?.(opp)}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-700 transition-colors font-semibold"
              >
                Apply Now <ExternalLink size={10} />
              </a>
            ) : (
              <div className="flex-1 text-xs text-gray-400 text-center py-2">Contact advisor</div>
            )}
          </div>
          <MarkResultRow
            oppId={opp.id}
            currentStatus={currentStatus}
            onMark={onMarkStatus}
            onClear={onClearStatus}
          />
        </>
      )}
    </div>
  )
}

// ─── LockedCard ───────────────────────────────────────────────────────────────
function LockedCard({
  opp,
  currentStage,
  onApplyAttempt,
}: {
  opp: AccountOpportunity
  currentStage: string
  onApplyAttempt: () => void
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
              <Lock size={9} /> {opp.stage}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[opp.category]}`}>
              {CATEGORY_LABELS[opp.category]}
            </span>
          </div>
          <h3 className="font-bold text-gray-600 dark:text-gray-300 text-sm">{opp.name}</h3>
        </div>
      </div>

      {opp.terms && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{opp.terms}</p>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 blur-sm select-none leading-relaxed line-clamp-2">
        {opp.description ?? 'Complete your current stage to unlock application details and guidance for this account.'}
      </p>

      <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
        <Lock size={10} className="shrink-0" />
        Complete <strong className="text-gray-600 dark:text-gray-300 mx-1">{currentStage}</strong> to unlock
      </div>

      <button
        onClick={onApplyAttempt}
        className="w-full text-xs text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-center gap-1"
      >
        <Lock size={10} /> Apply (Locked)
      </button>
    </div>
  )
}

// ─── WarningModal ─────────────────────────────────────────────────────────────
function WarningModal({
  opp,
  currentStage,
  onClose,
  onApplyAway,
}: {
  opp: AccountOpportunity
  currentStage: string
  onClose: () => void
  onApplyAway?: (opp: AccountOpportunity) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-2xl flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-gray-900 dark:text-white text-base">Applying Out of Sequence</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This may hurt your approval odds</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 mb-4 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          You&apos;re in <strong>{currentStage}</strong> stage.{' '}
          <strong>{opp.name}</strong> is a <strong>{opp.stage}</strong> stage account.
        </div>

        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Applying before completing your current stage may cause:</p>
        <ul className="space-y-1.5 mb-5">
          {[
            'Higher chance of denial or lower credit limits',
            'Hard inquiries that temporarily lower your score',
            'A negative mark on your business credit profile',
            'Delays advancing to higher funding stages',
          ].map((risk, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="text-red-400 font-bold mt-0.5 shrink-0">×</span>
              {risk}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 text-sm px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors"
          >
            ← Stay in Sequence
          </button>
          {opp.apply_url && (
            <a
              href={`/api/opportunities/redirect?id=${opp.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                onApplyAway?.(opp)
                onClose()
              }}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-center font-medium"
            >
              Apply Anyway →
            </a>
          )}
        </div>

        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-3">
          Complete your current stage first for the best approval odds and credit limits.
        </p>
      </div>
    </div>
  )
}

// ─── OpportunityCard (Browse All / Program A+C) ───────────────────────────────
function OpportunityCard({
  opp,
  status,
  isActive,
  isLocked = false,
  currentStatus,
  onLockedApply,
  onApply,
  onMarkStatus,
  onClearStatus,
}: {
  opp: AccountOpportunity
  status: 'recommended' | 'future'
  isActive: boolean
  isLocked?: boolean
  currentStatus: string | null
  onLockedApply?: () => void
  onApply?: (opp: AccountOpportunity) => void
  onMarkStatus: (oppId: string, status: string) => void
  onClearStatus: (oppId: string) => void
}) {
  const isRecommended = status === 'recommended'
  const blurred = !isActive
  const learnMoreUrl = safeUrl(opp.learn_more_url)
  const isApproved = currentStatus === 'approved'

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border p-5 space-y-3 transition-all ${
      isApproved
        ? 'border-green-200 dark:border-green-700 opacity-60 bg-green-50/30 dark:bg-green-900/10'
        : isRecommended
          ? 'border-green-200 dark:border-green-700 shadow-sm ring-1 ring-green-100 dark:ring-green-900/40'
          : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isApproved ? (
              <StatusBadge status="approved" />
            ) : isRecommended ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                <CheckCircle size={10} /> Recommended Now
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full uppercase tracking-wide">
                <Clock size={10} /> Future Stage
              </span>
            )}
            {currentStatus && currentStatus !== 'approved' && <StatusBadge status={currentStatus} />}
            {opp.pg_required === 'no' && (
              <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full uppercase">No PG</span>
            )}
            {opp.pg_required === 'yes' && (
              <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full uppercase">PG Required</span>
            )}
            {opp.pg_required === 'varies' && (
              <span className="text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full uppercase">PG Varies</span>
            )}
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{opp.name}</h3>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[opp.category]}`}>
          {CATEGORY_LABELS[opp.category]}
        </span>
      </div>

      {opp.terms && (
        <p className="text-xs text-green-700 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-lg">{opp.terms}</p>
      )}

      {opp.description && (
        <p className={`text-xs text-gray-600 dark:text-gray-400 leading-relaxed ${blurred ? 'blur-sm select-none' : ''}`}>
          {opp.description}
        </p>
      )}

      {opp.reports_to && (
        <p className={`text-xs text-gray-400 dark:text-gray-500 ${blurred ? 'blur-sm select-none' : ''}`}>
          Reports to: <span className="text-gray-600 dark:text-gray-300">{opp.reports_to}</span>
        </p>
      )}

      {blurred && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-700">
          <Lock size={12} /> Reactivate your membership to view full details
        </div>
      )}

      {isApproved ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-green-700 font-semibold flex items-center gap-1.5">
            <CheckCheck size={13} /> Opportunity completed
          </span>
          <button
            onClick={() => onClearStatus(opp.id)}
            className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
          >
            <RotateCcw size={9} /> Undo
          </button>
        </div>
      ) : !blurred && (learnMoreUrl || opp.apply_url) ? (
        <>
          <div className="flex gap-2 pt-1">
            {learnMoreUrl && (
              <a href={learnMoreUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                Learn More <ExternalLink size={10} />
              </a>
            )}
            {opp.apply_url && (
              isLocked && onLockedApply ? (
                <button
                  onClick={onLockedApply}
                  className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <Lock size={10} /> Apply (Locked)
                </button>
              ) : (
                <a
                  href={`/api/opportunities/redirect?id=${opp.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onApply?.(opp)}
                  className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Apply Now <ExternalLink size={10} />
                </a>
              )
            )}
          </div>
          {isActive && !isLocked && (
            <MarkResultRow
              oppId={opp.id}
              currentStatus={currentStatus}
              onMark={onMarkStatus}
              onClear={onClearStatus}
            />
          )}
        </>
      ) : !blurred && !learnMoreUrl && !opp.apply_url && isRecommended ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg">
          <AlertCircle size={12} /> Contact your advisor for application guidance
        </div>
      ) : null}

      <p className="text-[10px] text-gray-300 dark:text-gray-600 pt-0.5">Stage: {opp.stage}</p>
    </div>
  )
}
