'use client'

import { useState } from 'react'
import {
  TrendingUp, Plus, DollarSign, CheckCircle2, ArrowUpRight,
  Trash2, XCircle, Loader2, Calendar, ThumbsDown, ThumbsUp,
  BarChart2, RefreshCw,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Outcome {
  id: string
  program_type?: string | null
  approval_type: string
  issuer_name: string
  account_name?: string | null
  approved_amount?: number | null
  approved_limit?: number | null
  approval_date: string
  status: string
  notes?: string | null
  decline_reason?: string | null
  mark_for_reattempt?: boolean | null
  created_at: string
}

interface Props {
  initialApprovals: Outcome[]
  startDate: string | null
  assignedProgram: string | null
}

// ─── Program-aware outcome types ──────────────────────────────────────────────

const OUTCOME_TYPES_BY_PROGRAM: Record<string, string[]> = {
  program_a: [
    '0% APR Card',
    'Business Credit Card',
    'Charge Card',
    'Line of Credit',
    'Cash Credit',
    'Other Program A Outcome',
  ],
  program_b: [
    'Vendor Account',
    'Store Account',
    'Fleet Account',
    'Net 30 Account',
    'Business Trade Account',
    'Other Program B Outcome',
  ],
  program_c: [
    'Readiness Milestone',
    'Monitored Approval',
    'Referral / External Approval',
    'Other Program C Outcome',
  ],
}

// Credit-style outcome types — use approved_limit as the effective amount
const CREDIT_OUTCOME_TYPES = new Set([
  '0% APR Card', 'Business Credit Card', 'Charge Card',
  'Vendor Account', 'Store Account', 'Fleet Account',
  'Net 30 Account', 'Business Trade Account', 'Line of Credit',
])

const DECLINE_REASONS = [
  'Low credit score',
  'Insufficient revenue',
  'Too many inquiries',
  'Short time in business',
  'High utilization',
  'Weak banking',
  'Unverifiable business profile',
  'Other',
]

const PROGRAM_LABELS: Record<string, string> = {
  program_a: 'Program A — 0% Intro APR',
  program_b: 'Program B — Business Credit Builder',
  program_c: 'Program C — Capital Monitoring',
}

const STATUS_COLORS: Record<string, string> = {
  'Approved': 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  'Declined': 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  'Pending':  'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  'Closed':   'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
}

function effectiveAmount(o: Outcome): number {
  if (CREDIT_OUTCOME_TYPES.has(o.approval_type)) {
    return o.approved_limit ?? o.approved_amount ?? 0
  }
  return o.approved_amount ?? o.approved_limit ?? 0
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function getOutcomeTypes(programKey: string | null): string[] {
  if (!programKey) return Object.values(OUTCOME_TYPES_BY_PROGRAM).flat()
  return OUTCOME_TYPES_BY_PROGRAM[programKey] ?? Object.values(OUTCOME_TYPES_BY_PROGRAM).flat()
}

const EMPTY_FORM = {
  program_type: '',
  approval_type: '',
  issuer_name: '',
  account_name: '',
  approved_amount: '',
  approved_limit: '',
  approval_date: '',
  notes: '',
  decline_reason: '',
  mark_for_reattempt: false,
}

export default function FundingResultsClient({ initialApprovals, startDate, assignedProgram }: Props) {
  const [outcomes, setOutcomes] = useState<Outcome[]>(initialApprovals)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Resolve which program key governs the outcome type list
  const activeProgramKey: string | null = assignedProgram
    ?? (form.program_type === 'Program A' ? 'program_a'
      : form.program_type === 'Program B' ? 'program_b'
      : form.program_type === 'Program C' ? 'program_c'
      : null)
  const outcomeTypes = getOutcomeTypes(activeProgramKey)

  // ─── Metrics ────────────────────────────────────────────────────────────────
  const approvedOnly = outcomes.filter(o => o.status === 'Approved')
  const declinedOnly = outcomes.filter(o => o.status === 'Declined')
  const totalApproved = approvedOnly.reduce((sum, o) => sum + effectiveAmount(o), 0)
  const largestApproval = approvedOnly.reduce<Outcome | null>(
    (max, o) => (!max || effectiveAmount(o) > effectiveAmount(max) ? o : max), null
  )
  const mostRecent = approvedOnly[0] ?? null
  const approvalRate = outcomes.length > 0
    ? Math.round((approvedOnly.length / outcomes.length) * 100)
    : null

  const setField = <K extends keyof typeof EMPTY_FORM>(k: K, v: typeof EMPTY_FORM[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async (status: 'Approved' | 'Declined') => {
    setFormError(null)
    if (!form.approval_type) { setFormError('Outcome type is required.'); return }
    if (!form.issuer_name.trim()) { setFormError('Issuer / vendor name is required.'); return }
    if (!form.approval_date) { setFormError('Date is required.'); return }
    if (status === 'Declined' && !form.decline_reason) {
      setFormError('Decline reason is required.'); return
    }

    const programLabel = assignedProgram
      ? (PROGRAM_LABELS[assignedProgram] ?? '').split(' — ')[0]
      : form.program_type

    setSubmitting(true)
    try {
      const res = await fetch('/api/funding-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          program_type: programLabel || null,
          status,
          approved_amount: status === 'Approved' && form.approved_amount ? form.approved_amount : null,
          approved_limit: status === 'Approved' && form.approved_limit ? form.approved_limit : null,
          decline_reason: status === 'Declined' ? form.decline_reason : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Failed to save.'); return }
      setOutcomes(prev => [data.approval, ...prev])
      setShowForm(false)
      setForm({ ...EMPTY_FORM })
    } catch {
      setFormError('Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await fetch(`/api/funding-approvals?id=${id}`, { method: 'DELETE' })
      setOutcomes(prev => prev.filter(o => o.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const isCreditType = CREDIT_OUTCOME_TYPES.has(form.approval_type)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={20} className="text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Funding Results</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Track every approval and decline.
            {assignedProgram && (
              <span className="ml-1 text-green-600 font-medium">{PROGRAM_LABELS[assignedProgram]}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
        >
          <Plus size={16} /> Log Funding Outcome
        </button>
      </div>

      {/* Hero total — approved only */}
      <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white">
        <p className="text-sm font-medium text-green-100 mb-1">Total Approved Funding So Far</p>
        <p className="text-4xl font-bold tracking-tight">{formatMoney(totalApproved)}</p>
        {startDate && (
          <p className="text-xs text-green-200 mt-2 flex items-center gap-1">
            <Calendar size={12} /> Since {formatDate(startDate)}
          </p>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><ThumbsUp size={11} /> Total Approvals</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{approvedOnly.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><ThumbsDown size={11} /> Total Declines</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{declinedOnly.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><BarChart2 size={11} /> Approval Rate</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {approvalRate !== null ? `${approvalRate}%` : '—'}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><DollarSign size={11} /> Largest Approval</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
            {largestApproval ? formatMoney(effectiveAmount(largestApproval)) : '—'}
          </p>
          {largestApproval && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{largestApproval.issuer_name}</p>}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Most Recent</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">
            {mostRecent ? mostRecent.issuer_name : '—'}
          </p>
          {mostRecent && (
            <p className="text-xs text-gray-400 dark:text-gray-500">{formatMoney(effectiveAmount(mostRecent))} · {mostRecent.approval_date}</p>
          )}
        </div>
      </div>

      {/* Log Funding Outcome form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Log Funding Outcome</h2>
            <button
              onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); setFormError(null) }}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <XCircle size={18} />
            </button>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Program — locked if single program, selectable otherwise */}
            <div className={assignedProgram ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">Program</label>
              {assignedProgram ? (
                <div className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {PROGRAM_LABELS[assignedProgram] ?? assignedProgram}
                  <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-500">(auto)</span>
                </div>
              ) : (
                <select
                  value={form.program_type}
                  onChange={e => { setField('program_type', e.target.value); setField('approval_type', '') }}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select program…</option>
                  <option value="Program A">Program A — 0% Intro APR</option>
                  <option value="Program B">Program B — Business Credit Builder</option>
                  <option value="Program C">Program C — Capital Monitoring</option>
                </select>
              )}
            </div>

            {/* Outcome type — filtered by program */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">
                Outcome Type <span className="text-red-400">*</span>
              </label>
              <select
                value={form.approval_type}
                onChange={e => setField('approval_type', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select type…</option>
                {outcomeTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            {/* Issuer */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">
                {assignedProgram === 'program_b' ? 'Vendor / Issuer' : 'Issuer / Bank'} <span className="text-red-400">*</span>
              </label>
              <input
                value={form.issuer_name}
                onChange={e => setField('issuer_name', e.target.value)}
                placeholder={assignedProgram === 'program_b' ? 'e.g. Uline' : 'e.g. Chase'}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* Account name */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">Account / Product Name</label>
              <input
                value={form.account_name}
                onChange={e => setField('account_name', e.target.value)}
                placeholder="e.g. Chase Ink Business"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">
                Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.approval_date}
                onChange={e => setField('approval_date', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* Credit limit — credit account types only */}
            {isCreditType && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">Credit Limit</label>
                <input
                  type="number"
                  value={form.approved_limit}
                  onChange={e => setField('approved_limit', e.target.value)}
                  placeholder="e.g. 20000"
                  min="0"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
            )}

            {/* Funded amount — Program A / non-B only */}
            {assignedProgram !== 'program_b' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">Funded Amount</label>
                <input
                  type="number"
                  value={form.approved_amount}
                  onChange={e => setField('approved_amount', e.target.value)}
                  placeholder="e.g. 50000"
                  min="0"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
            )}

            {/* Decline reason */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">
                Decline Reason <span className="text-gray-300 font-normal normal-case">(required if declining)</span>
              </label>
              <select
                value={form.decline_reason}
                onChange={e => setField('decline_reason', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">— Select if declined —</option>
                {DECLINE_REASONS.map(r => <option key={r} value={r.toLowerCase()}>{r}</option>)}
              </select>
            </div>

            {/* Mark for reattempt */}
            <div className="flex items-center gap-2 pt-1">
              <input
                id="reattempt"
                type="checkbox"
                checked={form.mark_for_reattempt}
                onChange={e => setField('mark_for_reattempt', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label htmlFor="reattempt" className="text-sm text-gray-600 flex items-center gap-1.5 cursor-pointer">
                <RefreshCw size={13} className="text-gray-400" />
                Mark for reattempt
              </label>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">Notes</label>
              <input
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Optional notes…"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* Error */}
            {formError && (
              <div className="sm:col-span-2 flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-xl px-3 py-2">
                <XCircle size={13} className="text-red-500" />
                <p className="text-xs text-red-700 dark:text-red-400">{formError}</p>
              </div>
            )}

            {/* Two action buttons */}
            <div className="sm:col-span-2 flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={() => submit('Declined')}
                disabled={submitting}
                className="flex items-center justify-center gap-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}
                Log Decline
              </button>
              <button
                type="button"
                onClick={() => submit('Approved')}
                disabled={submitting}
                className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                Log Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outcome History Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Outcome History</h2>
          {outcomes.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{outcomes.length} record{outcomes.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {outcomes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <DollarSign size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No outcomes logged yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click &quot;Log Funding Outcome&quot; to record your first result.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-gray-700">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Issuer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Account</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Type</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {outcomes.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">{o.approval_date}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {o.issuer_name}
                      {o.mark_for_reattempt && (
                        <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                          Reattempt
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden sm:table-cell">{o.account_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">
                      {o.approval_type}
                      {o.decline_reason && (
                        <span className="block text-[10px] text-red-400 capitalize">{o.decline_reason}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white whitespace-nowrap">
                      {o.status === 'Approved' && effectiveAmount(o) > 0 ? (
                        <span className="text-green-600 dark:text-green-400">{formatMoney(effectiveAmount(o))}</span>
                      ) : o.status === 'Declined' ? (
                        <span className="text-red-400 text-xs">Declined</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        {o.status === 'Approved' && <><CheckCircle2 size={9} /><ArrowUpRight size={9} /></>}
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(o.id)}
                        disabled={deleting === o.id}
                        className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        {deleting === o.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approval timeline */}
      {approvedOnly.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Approval Timeline</h2>
          </div>
          <div className="p-6">
            <div className="relative">
              <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-green-100 dark:bg-green-900/40" />
              <div className="space-y-4">
                {[...approvedOnly].reverse().map((o, i) => (
                  <div key={o.id} className="flex gap-4 relative">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${i === approvedOnly.length - 1 ? 'bg-green-600' : 'bg-green-100 dark:bg-green-900/40'}`}>
                      <DollarSign size={13} className={i === approvedOnly.length - 1 ? 'text-white' : 'text-green-600 dark:text-green-400'} />
                    </div>
                    <div className="flex-1 pb-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {o.issuer_name}{o.account_name ? ` — ${o.account_name}` : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-green-700 dark:text-green-400 font-bold">{formatMoney(effectiveAmount(o))}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{o.approval_date}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{o.approval_type}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
        Approval totals reflect results logged in the portal and may include products approved by third-party issuers or vendors. SourcifyLending does not guarantee approvals, limits, or funding.
      </p>
    </div>
  )
}
