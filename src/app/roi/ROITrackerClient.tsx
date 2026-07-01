'use client'

import { useEffect, useState } from 'react'
import {
  TrendingUp, DollarSign, BarChart2, Percent, ArrowUpRight,
  ArrowDownRight, Loader2, CheckCircle2, CreditCard, Calendar,
  Zap, Building2, Info,
} from 'lucide-react'
import { useLanguage } from '@/components/i18n/LanguageProvider'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ROIData {
  totalInvested: number
  totalApprovedValue: number
  netROI: number
  roiPercent: number | null
  setupPaid: number
  recurringPaid: number
  addonPaid: number
  totalPayments: number
  totalApprovals: number
  byApprovalType: { type: string; count: number; value: number }[]
  byProgram: { program: string; count: number; value: number }[]
  mostRecentApproval: Record<string, unknown> | null
  largestApproval: Record<string, unknown> | null
  timeline: TimelineEvent[]
  activePrograms: string[]
  enrolledSince: string | null
}

interface TimelineEvent {
  date: string
  type: 'payment' | 'approval'
  label: string
  amount: number
  subLabel?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatMoney(n: number, locale: 'en' | 'es', compact = false): string {
  if (compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency', currency: 'USD',
      notation: 'compact', maximumFractionDigits: 1,
    }).format(n)
  }
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(d: string, locale: 'en' | 'es'): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch { return d }
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({
  label, value, sub, icon, color, positive,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  color: string
  positive?: boolean | null
  locale: 'en' | 'es'
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${positive === true ? 'text-green-700' : positive === false ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ROITrackerClient() {
  const { locale } = useLanguage()
  const [data, setData] = useState<ROIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const text = (en: string, es: string) => (locale === 'es' ? es : en)

  useEffect(() => {
    fetch('/api/roi')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError(text('Failed to load ROI data.', 'No se pudieron cargar los datos de ROI.')); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-green-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
        <p className="text-sm text-red-700">{error || text('Something went wrong.', 'Algo salió mal.')}</p>
      </div>
    )
  }

  const {
    totalInvested, totalApprovedValue, netROI, roiPercent,
    setupPaid, recurringPaid, addonPaid,
    totalApprovals, byApprovalType, byProgram,
    mostRecentApproval, largestApproval, timeline,
    enrolledSince,
  } = data

  const roiIsPositive = netROI > 0
  const hasApprovals = totalApprovals > 0
  const hasInvestment = totalInvested > 0

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={20} className="text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">{text('ROI Tracker', 'Seguimiento ROI')}</h1>
        </div>
        <p className="text-sm text-gray-500">
          {text('Your investment vs. approved value — updated automatically as results are logged.', 'Tu inversión frente al valor aprobado — se actualiza automáticamente a medida que se registran resultados.')}
          {enrolledSince && (
            <span className="ml-1 text-gray-400">
              {text('· Member since', '· Miembro desde')} {formatDate(enrolledSince.slice(0, 10), locale)}
            </span>
          )}
        </p>
      </div>

      {/* ── Hero gradient card ──────────────────────────────────────────────── */}
      <div className={`rounded-2xl p-6 text-white ${roiIsPositive ? 'bg-gradient-to-br from-green-600 to-green-700' : 'bg-gradient-to-br from-gray-700 to-gray-800'}`}>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium opacity-80 mb-1">{text('Estimated ROI Based on Approved Value', 'ROI estimado basado en el valor aprobado')}</p>
            <p className="text-5xl font-bold tracking-tight">
              {roiPercent !== null ? `${roiPercent > 0 ? '+' : ''}${roiPercent.toLocaleString(locale === 'es' ? 'es-ES' : 'en-US')}%` : '—'}
            </p>
            <p className="text-sm opacity-70 mt-2">
              {hasInvestment && hasApprovals
                ? text(
                  `${formatMoney(totalApprovedValue, locale)} approved on ${formatMoney(totalInvested, locale)} invested`,
                  `${formatMoney(totalApprovedValue, locale)} aprobados sobre ${formatMoney(totalInvested, locale)} invertidos`
                )
                : hasInvestment
                  ? text('No approved outcomes logged yet — keep building!', 'Aún no hay resultados aprobados registrados — sigue avanzando.')
                  : text('No payments logged yet', 'Aún no hay pagos registrados')}
            </p>
          </div>
          {roiPercent !== null && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold self-start sm:self-auto ${roiIsPositive ? 'bg-white/20' : 'bg-white/10'}`}>
              {roiIsPositive
                ? <ArrowUpRight size={16} />
                : <ArrowDownRight size={16} />}
              {text('Net', 'Resultado neto')} {roiIsPositive ? text('Gain', 'ganancia') : text('Gap', 'brecha')}: {formatMoney(Math.abs(netROI), locale)}
            </div>
          )}
        </div>
      </div>

      {/* ── 4 Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label={text('Total Invested', 'Total invertido')}
          value={formatMoney(totalInvested, locale)}
          sub={text('Payments collected to date', 'Pagos cobrados hasta la fecha')}
          icon={<DollarSign size={18} className="text-blue-600" />}
          color="bg-blue-100"
          locale={locale}
        />
        <SummaryCard
          label={text('Total Approved Value', 'Valor total aprobado')}
          value={formatMoney(totalApprovedValue, locale)}
          sub={text(
            `${totalApprovals} approved outcome${totalApprovals !== 1 ? 's' : ''}`,
            `${totalApprovals} resultado${totalApprovals !== 1 ? 's' : ''} aprobado${totalApprovals !== 1 ? 's' : ''}`
          )}
          icon={<CheckCircle2 size={18} className="text-green-600" />}
          color="bg-green-100"
          positive={hasApprovals}
          locale={locale}
        />
        <SummaryCard
          label={text('Net ROI', 'ROI neto')}
          value={netROI === 0 ? '$0' : `${netROI > 0 ? '+' : ''}${formatMoney(netROI, locale)}`}
          sub={text('Approved value minus invested', 'Valor aprobado menos inversión')}
          icon={<BarChart2 size={18} className={roiIsPositive ? 'text-green-600' : 'text-gray-500'} />}
          color={roiIsPositive ? 'bg-green-100' : 'bg-gray-100'}
          positive={netROI !== 0 ? roiIsPositive : null}
          locale={locale}
        />
        <SummaryCard
          label="ROI %"
          value={roiPercent !== null ? `${roiPercent > 0 ? '+' : ''}${roiPercent.toLocaleString(locale === 'es' ? 'es-ES' : 'en-US')}%` : '—'}
          sub={hasInvestment ? text('Based on approved value only', 'Basado solo en valor aprobado') : text('No investment on file yet', 'Aún no hay inversión registrada')}
          icon={<Percent size={18} className={roiIsPositive ? 'text-green-600' : 'text-gray-500'} />}
          color={roiIsPositive ? 'bg-green-100' : 'bg-gray-100'}
          positive={roiPercent !== null ? roiPercent > 0 : null}
          locale={locale}
        />
      </div>

      {/* ── Two-column: Investment + Returns ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Investment Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <CreditCard size={15} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-900">{text('Investment Breakdown', 'Desglose de inversión')}</h2>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: text('Setup / Enrollment Fee', 'Cargo de inscripción / inicio'), amount: setupPaid, icon: <Zap size={13} className="text-blue-400" /> },
              { label: text('Monthly Advisory Fees', 'Cargos mensuales de asesoría'), amount: recurringPaid, icon: <Calendar size={13} className="text-purple-400" /> },
              { label: text('Add-On Programs', 'Programas complementarios'), amount: addonPaid, icon: <Building2 size={13} className="text-green-400" /> },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {row.icon}
                  {row.label}
                </div>
                <span className={`text-sm font-semibold ${row.amount > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                  {formatMoney(row.amount, locale)}
                </span>
              </div>
            ))}
            <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">{text('Total Invested', 'Total invertido')}</span>
              <span className="text-sm font-bold text-blue-700">{formatMoney(totalInvested, locale)}</span>
            </div>
          </div>
        </div>

        {/* Returns Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-green-500" />
            <h2 className="text-sm font-semibold text-gray-900">{text('Approved Value Breakdown', 'Desglose del valor aprobado')}</h2>
          </div>
          <div className="p-5">
            {!hasApprovals ? (
              <div className="text-center py-6">
                <TrendingUp size={28} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">{text('No approved outcomes yet', 'Aún no hay resultados aprobados')}</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  {text('Log your first approval in Funding Results to see your return here.', 'Registra tu primera aprobación en Resultados de financiamiento para ver tu retorno aquí.')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {byApprovalType.map(row => (
                  <div key={row.type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">{row.type}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{row.count}×</span>
                        <span className="text-sm font-semibold text-green-700">{formatMoney(row.value, locale)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: totalApprovedValue > 0 ? `${Math.round((row.value / totalApprovedValue) * 100)}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900">{text('Total Approved Value', 'Valor total aprobado')}</span>
                  <span className="text-sm font-bold text-green-700">{formatMoney(totalApprovedValue, locale)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Highlights ──────────────────────────────────────────────────────── */}
      {(mostRecentApproval || largestApproval) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mostRecentApproval && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">{text('Most Recent Approval', 'Aprobación más reciente')}</p>
              <p className="text-sm font-bold text-gray-900">
                {mostRecentApproval.issuer_name as string}
                {mostRecentApproval.account_name ? ` — ${mostRecentApproval.account_name as string}` : ''}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{mostRecentApproval.approval_type as string}</p>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(mostRecentApproval.approval_date as string, locale)}</p>
            </div>
          )}
          {largestApproval && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">{text('Largest Approval', 'Aprobación más grande')}</p>
              <p className="text-sm font-bold text-gray-900">
                {largestApproval.issuer_name as string}
                {largestApproval.account_name ? ` — ${largestApproval.account_name as string}` : ''}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{largestApproval.approval_type as string}</p>
              <p className="text-lg font-bold text-green-700 mt-1">
                {formatMoney(Number(largestApproval.approved_limit) || Number(largestApproval.approved_amount) || 0, locale)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── By Program breakdown (only if multi-program) ─────────────────────── */}
      {byProgram.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">{text('Approved Value by Program', 'Valor aprobado por programa')}</h2>
          </div>
          <div className="p-5 space-y-3">
            {byProgram.map(row => (
              <div key={row.program} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{row.program}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{text(`${row.count} approval${row.count !== 1 ? 's' : ''}`, `${row.count} aprobación${row.count !== 1 ? 'es' : ''}`)}</span>
                  <span className="font-semibold text-green-700">{formatMoney(row.value, locale)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Combined Timeline ────────────────────────────────────────────────── */}
      {timeline.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">{text('Investment & Approval Timeline', 'Cronología de inversión y aprobaciones')}</h2>
          </div>
          <div className="p-5">
            <div className="relative">
              <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-gray-100" />
              <div className="space-y-4">
                {timeline.map((event, i) => {
                  const isApproval = event.type === 'approval'
                  return (
                    <div key={i} className="flex gap-4 relative">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${isApproval ? 'bg-green-100' : 'bg-blue-100'}`}>
                        {isApproval
                          ? <CheckCircle2 size={13} className="text-green-600" />
                          : <CreditCard size={13} className="text-blue-500" />}
                      </div>
                      <div className="flex-1 pb-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 leading-tight">{event.label}</p>
                            {event.subLabel && (
                              <p className="text-xs text-gray-400 mt-0.5">{event.subLabel}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(event.date, locale)}</p>
                          </div>
                          <span className={`text-sm font-bold shrink-0 ${isApproval ? 'text-green-700' : 'text-blue-700'}`}>
                            {isApproval ? '+' : '-'}{formatMoney(event.amount, locale)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state if no data at all ────────────────────────────────────── */}
      {!hasInvestment && !hasApprovals && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <TrendingUp size={32} className="text-gray-200 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-gray-700 mb-2">{text('Your ROI tracker is ready', 'Tu seguimiento ROI está listo')}</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
            {text('As your payments are logged and funding outcomes are recorded, your ROI will calculate automatically here.', 'A medida que se registren tus pagos y resultados de financiamiento, tu ROI se calculará automáticamente aquí.')}
          </p>
        </div>
      )}

      {/* ── Legal disclaimer ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 bg-gray-50 rounded-xl px-4 py-3">
        <Info size={13} className="text-gray-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-400 leading-relaxed">
          {text(
            'ROI calculations are based on approved credit limits and approved funding values logged in your portal — not realized business revenue or cash in hand. Approved credit limits represent available access, not guaranteed income. SourcifyLending does not guarantee approvals, credit limits, funding outcomes, or investment returns.',
            'Los cálculos de ROI se basan en límites de crédito aprobados y valores de financiamiento aprobados registrados en tu portal, no en ingresos comerciales realizados ni efectivo disponible. Los límites de crédito aprobados representan acceso disponible, no ingresos garantizados. SourcifyLending no garantiza aprobaciones, límites de crédito, resultados de financiamiento ni retornos de inversión.'
          )}
        </p>
      </div>
    </div>
  )
}
