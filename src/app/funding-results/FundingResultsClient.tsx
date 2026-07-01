'use client'

import { useState } from 'react'
import {
  TrendingUp, Plus, DollarSign, CheckCircle2, ArrowUpRight,
  Trash2, XCircle, Loader2, Calendar, ThumbsDown, ThumbsUp,
  BarChart2, RefreshCw,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useLanguage } from '@/components/i18n/LanguageProvider'

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
  clientStatus?: string | null
  initialFundingGoal?: number | null
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

export default function FundingResultsClient({ initialApprovals, startDate, assignedProgram, clientStatus, initialFundingGoal }: Props) {
  const { locale } = useLanguage()
  const [outcomes, setOutcomes] = useState<Outcome[]>(initialApprovals)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [fundingGoal, setFundingGoal] = useState<number | null>(initialFundingGoal ?? null)
  const [fundingGoalInput, setFundingGoalInput] = useState<string>(fundingGoal ? String(fundingGoal) : '')
  const [savingGoal, setSavingGoal] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)

  // Resolve which program key governs the outcome type list
  const activeProgramKey: string | null = assignedProgram
    ?? (form.program_type === 'Program A' ? 'program_a'
      : form.program_type === 'Program B' ? 'program_b'
      : form.program_type === 'Program C' ? 'program_c'
      : null)
  const outcomeTypes = getOutcomeTypes(activeProgramKey)

  // Feature eligibility: Funding Goal feature only for active Program A/B clients
  const isEligibleForGoal = assignedProgram && ['program_a', 'program_b'].includes(assignedProgram) &&
    (clientStatus === 'active' || clientStatus === 'trialing')

  const text = (en: string, es: string) => (locale === 'es' ? es : en)
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n)
  const localizeProgramLabel = (program: string) => {
    switch (program) {
      case 'program_a':
      case 'Program A':
        return text('Program A â€” 0% Intro APR', 'Programa A â€” APR introductorio 0%')
      case 'program_b':
      case 'Program B':
        return text('Program B â€” Business Credit Builder', 'Programa B â€” Constructor de crÃ©dito empresarial')
      case 'program_c':
      case 'Program C':
        return text('Program C â€” Capital Monitoring', 'Programa C â€” Monitoreo de capital')
      default:
        return program
    }
  }
  const localizeOutcomeType = (value: string) => {
    if (locale !== 'es') return value
    const map: Record<string, string> = {
      '0% APR Card': 'Tarjeta con APR 0%',
      'Business Credit Card': 'Tarjeta de crÃ©dito empresarial',
      'Charge Card': 'Tarjeta de cargo',
      'Line of Credit': 'LÃ­nea de crÃ©dito',
      'Cash Credit': 'CrÃ©dito en efectivo',
      'Other Program A Outcome': 'Otro resultado del Programa A',
      'Vendor Account': 'Cuenta de proveedor',
      'Store Account': 'Cuenta comercial',
      'Fleet Account': 'Cuenta de flota',
      'Net 30 Account': 'Cuenta Net-30',
      'Business Trade Account': 'Cuenta comercial empresarial',
      'Other Program B Outcome': 'Otro resultado del Programa B',
      'Readiness Milestone': 'Hito de preparaciÃ³n',
      'Monitored Approval': 'AprobaciÃ³n monitoreada',
      'Referral / External Approval': 'AprobaciÃ³n referida / externa',
      'Other Program C Outcome': 'Otro resultado del Programa C',
    }
    return map[value] ?? value
  }
  const localizeDeclineReason = (value: string) => {
    if (locale !== 'es') return value
    const map: Record<string, string> = {
      'low credit score': 'Puntaje de crÃ©dito bajo',
      'insufficient revenue': 'Ingresos insuficientes',
      'too many inquiries': 'Demasiadas consultas',
      'short time in business': 'Poco tiempo en el negocio',
      'high utilization': 'UtilizaciÃ³n alta',
      'weak banking': 'Actividad bancaria dÃ©bil',
      'unverifiable business profile': 'Perfil comercial no verificable',
      other: 'Otro',
    }
    return map[value.toLowerCase()] ?? value
  }
  const localizeStatus = (status: string) => {
    switch (status) {
      case 'Approved':
        return text('Approved', 'Aprobado')
      case 'Declined':
        return text('Declined', 'Rechazado')
      case 'Pending':
        return text('Pending', 'Pendiente')
      case 'Closed':
        return text('Closed', 'Cerrado')
      default:
        return status
    }
  }

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

  // ─── Funding Goal Metrics ───────────────────────────────────────────────────
  const remainingToGoal = fundingGoal && fundingGoal > 0 ? Math.max(fundingGoal - totalApproved, 0) : 0
  const progressPercent = fundingGoal && fundingGoal > 0 ? Math.min((totalApproved / fundingGoal) * 100, 100) : 0

  const setField = <K extends keyof typeof EMPTY_FORM>(k: K, v: typeof EMPTY_FORM[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async (status: 'Approved' | 'Declined') => {
    setFormError(null)
    if (!form.approval_type) { setFormError(text('Outcome type is required.', 'El tipo de resultado es obligatorio.')); return }
    if (!form.issuer_name.trim()) { setFormError(text('Issuer / vendor name is required.', 'El nombre del emisor / proveedor es obligatorio.')); return }
    if (!form.approval_date) { setFormError(text('Date is required.', 'La fecha es obligatoria.')); return }
    if (status === 'Declined' && !form.decline_reason) {
      setFormError(text('Decline reason is required.', 'El motivo del rechazo es obligatorio.')); return
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
      if (!res.ok) { setFormError(data.error || text('Failed to save.', 'No se pudo guardar.')); return }
      setOutcomes(prev => [data.approval, ...prev])
      setShowForm(false)
      setForm({ ...EMPTY_FORM })
    } catch {
      setFormError(text('Something went wrong.', 'Algo salió mal.'))
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

  const saveGoal = async () => {
    setGoalError(null)
    const goalValue = fundingGoalInput.trim()

    if (!goalValue) {
      // Clear goal
      setSavingGoal(true)
      try {
        const res = await fetch('/api/funding-approvals', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fundingGoal: null }),
        })
        if (!res.ok) {
          const data = await res.json()
          setGoalError(data.error || text('Failed to save.', 'No se pudo guardar.'))
          return
        }
        setFundingGoal(null)
        setFundingGoalInput('')
      } catch {
        setGoalError(text('Something went wrong.', 'Algo salió mal.'))
      } finally {
        setSavingGoal(false)
      }
      return
    }

    const parsed = parseFloat(goalValue)
    if (isNaN(parsed) || parsed < 0) {
      setGoalError(text('Enter a valid amount.', 'Ingresa un monto válido.'))
      return
    }

    setSavingGoal(true)
    try {
      const res = await fetch('/api/funding-approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundingGoal: parsed }),
      })
      if (!res.ok) {
        const data = await res.json()
        setGoalError(data.error || text('Failed to save.', 'No se pudo guardar.'))
        return
      }
      setFundingGoal(parsed)
    } catch {
      setGoalError(text('Something went wrong.', 'Algo salió mal.'))
    } finally {
      setSavingGoal(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={20} className="text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{text('Funding Results', 'Resultados de financiamiento')}</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {text('Track every approval and decline.', 'Registra cada aprobación y rechazo.')}
            {assignedProgram && (
              <span className="ml-1 text-green-600 font-medium">{localizeProgramLabel(assignedProgram)}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
        >
          <Plus size={16} /> {text('Log Funding Outcome', 'Registrar resultado')}
        </button>
      </div>

      {/* Hero total — approved only */}
      <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white">
        <p className="text-sm font-medium text-green-100 mb-1">{text('Total Approved Funding So Far', 'Financiamiento aprobado hasta ahora')}</p>
        <p className="text-4xl font-bold tracking-tight">{formatCurrency(totalApproved)}</p>
        {startDate && (
          <p className="text-xs text-green-200 mt-2 flex items-center gap-1">
            <Calendar size={12} /> {text('Since', 'Desde')} {formatDate(startDate)}
          </p>
        )}
      </div>

      {/* Funding Goal Section — only for eligible clients */}
      {isEligibleForGoal && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
            {text('Funding Goal', 'Objetivo de financiamiento')} <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">{text('(optional)', '(opcional)')}</span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {text(
                "Set the minimum funding amount you want to reach. We'll help you track progress toward your target.",
                'Define el monto mÃ­nimo de financiamiento que deseas alcanzar. Te ayudaremos a seguir el progreso hacia tu meta.'
              )}
            </p>
            <div className="flex items-end gap-2 mb-3">
              <div className="flex-1">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={fundingGoalInput}
                    onChange={(e) => { setFundingGoalInput(e.target.value); setGoalError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveGoal() }}
                    placeholder={text('e.g. 100000', 'ej. 100000')}
                    min="0"
                    step="1"
                    className="w-full pl-7 pr-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
              </div>
              <button
                onClick={saveGoal}
                disabled={savingGoal}
                className="flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
              >
                {savingGoal ? <Loader2 size={14} className="animate-spin" /> : text('Save', 'Guardar')}
              </button>
              {fundingGoal && (
                <button
                  onClick={() => { setFundingGoalInput(''); setGoalError(null) }}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1"
                >
                  {text('Clear', 'Limpiar')}
                </button>
              )}
            </div>

            {/* Error message */}
            {goalError && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-xl px-3 py-2 mb-3">
                <XCircle size={13} className="text-red-500" />
                <p className="text-xs text-red-700 dark:text-red-400">{goalError}</p>
              </div>
            )}
          </div>

          {/* Goal progress — show only if goal is set */}
          {fundingGoal && fundingGoal > 0 && (
            <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{text('Funding Goal', 'Objetivo de financiamiento')}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(fundingGoal)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{text('Achieved', 'Logrado')}</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(totalApproved)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{text('Remaining', 'Restante')}</p>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(remainingToGoal)}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{text('Progress to Goal', 'Progreso hacia la meta')}</p>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{Math.round(progressPercent)}%</p>
                </div>
                <div className="w-full h-3 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><ThumbsUp size={11} /> {text('Total Approvals', 'Aprobaciones totales')}</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{approvedOnly.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><ThumbsDown size={11} /> {text('Total Declines', 'Rechazos totales')}</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{declinedOnly.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><BarChart2 size={11} /> {text('Approval Rate', 'Tasa de aprobación')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {approvalRate !== null ? `${approvalRate}%` : '—'}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><DollarSign size={11} /> {text('Largest Approval', 'Aprobación más grande')}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
            {largestApproval ? formatCurrency(effectiveAmount(largestApproval)) : '—'}
          </p>
          {largestApproval && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{largestApproval.issuer_name}</p>}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">{text('Most Recent', 'Más reciente')}</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">
            {mostRecent ? mostRecent.issuer_name : '—'}
          </p>
          {mostRecent && (
            <p className="text-xs text-gray-400 dark:text-gray-500">{formatCurrency(effectiveAmount(mostRecent))} · {mostRecent.approval_date}</p>
          )}
        </div>
      </div>

      {/* Log Funding Outcome form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{text('Log Funding Outcome', 'Registrar resultado de financiamiento')}</h2>
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
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">{text('Program', 'Programa')}</label>
              {assignedProgram ? (
                <div className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {localizeProgramLabel(assignedProgram)}
                  <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-500">{text('(auto)', '(automático)')}</span>
                </div>
              ) : (
                <select
                  value={form.program_type}
                  onChange={e => { setField('program_type', e.target.value); setField('approval_type', '') }}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">{text('Select program…', 'Selecciona un programa…')}</option>
                  <option value="Program A">{text('Program A — 0% Intro APR', 'Programa A — APR introductorio 0%')}</option>
                  <option value="Program B">{text('Program B — Business Credit Builder', 'Programa B — Constructor de crédito empresarial')}</option>
                  <option value="Program C">{text('Program C — Capital Monitoring', 'Programa C — Monitoreo de capital')}</option>
                </select>
              )}
            </div>

            {/* Outcome type — filtered by program */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">
                {text('Outcome Type', 'Tipo de resultado')} <span className="text-red-400">*</span>
              </label>
              <select
                value={form.approval_type}
                onChange={e => setField('approval_type', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{text('Select type…', 'Selecciona un tipo…')}</option>
                {outcomeTypes.map(t => <option key={t} value={t}>{localizeOutcomeType(t)}</option>)}
              </select>
            </div>

            {/* Issuer */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">
                {assignedProgram === 'program_b' ? text('Vendor / Issuer', 'Proveedor / emisor') : text('Issuer / Bank', 'Emisor / banco')} <span className="text-red-400">*</span>
              </label>
              <input
                value={form.issuer_name}
                onChange={e => setField('issuer_name', e.target.value)}
                placeholder={assignedProgram === 'program_b' ? text('e.g. Uline', 'ej. Uline') : text('e.g. Chase', 'ej. Chase')}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* Account name */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">{text('Account / Product Name', 'Nombre de la cuenta / producto')}</label>
              <input
                value={form.account_name}
                onChange={e => setField('account_name', e.target.value)}
                placeholder={text('e.g. Chase Ink Business', 'ej. Chase Ink Business')}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">
                {text('Date', 'Fecha')} <span className="text-red-400">*</span>
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
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">{text('Credit Limit', 'Límite de crédito')}</label>
                <input
                  type="number"
                  value={form.approved_limit}
                  onChange={e => setField('approved_limit', e.target.value)}
                  placeholder={text('e.g. 20000', 'ej. 20000')}
                  min="0"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
            )}

            {/* Funded amount — Program A / non-B only */}
            {assignedProgram !== 'program_b' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">{text('Funded Amount', 'Monto financiado')}</label>
                <input
                  type="number"
                  value={form.approved_amount}
                  onChange={e => setField('approved_amount', e.target.value)}
                  placeholder={text('e.g. 50000', 'ej. 50000')}
                  min="0"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
            )}

            {/* Decline reason */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">
                {text('Decline Reason', 'Motivo del rechazo')} <span className="text-gray-300 font-normal normal-case">{text('(required if declining)', '(obligatorio si se rechaza)')}</span>
              </label>
              <select
                value={form.decline_reason}
                onChange={e => setField('decline_reason', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{text('— Select if declined —', '— Selecciona si se rechaza —')}</option>
                {DECLINE_REASONS.map(r => <option key={r} value={r.toLowerCase()}>{localizeDeclineReason(r)}</option>)}
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
                {text('Mark for reattempt', 'Marcar para reintento')}
              </label>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase tracking-wide">{text('Notes', 'Notas')}</label>
              <input
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder={text('Optional notes…', 'Notas opcionales…')}
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
                {text('Log Decline', 'Registrar rechazo')}
              </button>
              <button
                type="button"
                onClick={() => submit('Approved')}
                disabled={submitting}
                className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                {text('Log Approval', 'Registrar aprobación')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outcome History Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{text('Outcome History', 'Historial de resultados')}</h2>
          {outcomes.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {locale === 'es'
                ? `${outcomes.length} registro${outcomes.length !== 1 ? 's' : ''}`
                : `${outcomes.length} record${outcomes.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {outcomes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <DollarSign size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{text('No outcomes logged yet', 'Aún no hay resultados registrados')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{text('Click "Log Funding Outcome" to record your first result.', 'Haz clic en "Registrar resultado de financiamiento" para guardar tu primer resultado.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-gray-700">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{text('Date', 'Fecha')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{text('Issuer', 'Emisor')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">{text('Account', 'Cuenta')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">{text('Type', 'Tipo')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{text('Amount', 'Monto')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{text('Status', 'Estado')}</th>
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
                          {text('Reattempt', 'Reintento')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden sm:table-cell">{o.account_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">
                      {localizeOutcomeType(o.approval_type)}
                      {o.decline_reason && (
                        <span className="block text-[10px] text-red-400">{localizeDeclineReason(o.decline_reason)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white whitespace-nowrap">
                      {o.status === 'Approved' && effectiveAmount(o) > 0 ? (
                        <span className="text-green-600 dark:text-green-400">{formatCurrency(effectiveAmount(o))}</span>
                      ) : o.status === 'Declined' ? (
                        <span className="text-red-400 text-xs">{text('Declined', 'Rechazado')}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        {o.status === 'Approved' && <><CheckCircle2 size={9} /><ArrowUpRight size={9} /></>}
                        {localizeStatus(o.status)}
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
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{text('Approval Timeline', 'Línea de tiempo de aprobaciones')}</h2>
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
                        <span className="text-xs text-green-700 dark:text-green-400 font-bold">{formatCurrency(effectiveAmount(o))}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{o.approval_date}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{localizeOutcomeType(o.approval_type)}</span>
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
        {text(
          'Approval totals reflect results logged in the portal and may include products approved by third-party issuers or vendors. SourcifyLending does not guarantee approvals, limits, or funding.',
          'Los totales de aprobación reflejan resultados registrados en el portal y pueden incluir productos aprobados por emisores o proveedores externos. SourcifyLending no garantiza aprobaciones, límites ni financiamiento.'
        )}
      </p>
    </div>
  )
}
