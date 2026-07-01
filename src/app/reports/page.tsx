'use client'
import { useState, useEffect } from 'react'
import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel, formatDateTime } from '@/lib/utils'
import { BarChart2, FileText, Plus, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import type { Report, ReportType, UserProfile } from '@/types'
import toast from 'react-hot-toast'
import { useBusinessContext } from '@/lib/use-business-context'
import { useLanguage } from '@/components/i18n/LanguageProvider'

const REPORT_TYPES: { value: ReportType; label: { en: string; es: string }; desc: { en: string; es: string } }[] = [
  { value: 'credit_readiness_summary', label: { en: 'Credit Readiness Summary', es: 'Resumen de preparación crediticia' }, desc: { en: 'Overview of your current credit position and readiness indicators', es: 'Resumen de tu posición crediticia actual e indicadores de preparación' } },
  { value: 'funding_readiness_analysis', label: { en: 'Funding Readiness Analysis', es: 'Análisis de preparación para financiamiento' }, desc: { en: 'Full analysis of your funding readiness and gaps to address', es: 'Análisis completo de tu preparación para financiamiento y las brechas por atender' } },
  { value: 'tradeline_progress_report', label: { en: 'Tradeline Progress Report', es: 'Reporte de progreso de tradelines' }, desc: { en: 'Status of your tradeline-building progress and reporting accounts', es: 'Estado de tu progreso construyendo tradelines y cuentas que reportan' } },
  { value: 'monthly_monitoring_report', label: { en: 'Monthly Monitoring Report', es: 'Reporte de monitoreo mensual' }, desc: { en: 'Monthly credit and banking snapshot with action items', es: 'Resumen mensual de crédito y banca con acciones recomendadas' } },
  { value: 'next_step_summary', label: { en: 'Next Step Summary', es: 'Resumen de próximos pasos' }, desc: { en: 'Concise AI-generated guidance on your next required actions', es: 'Guía concisa generada por IA sobre tus próximas acciones requeridas' } },
]

export default function ReportsPage() {
  const { locale } = useLanguage()
  const { activeBusinessId } = useBusinessContext()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedType, setSelectedType] = useState<ReportType>('next_step_summary')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [activePrograms, setActivePrograms] = useState<string[]>([])
  const text = (en: string, es: string) => (locale === 'es' ? es : en)

  useEffect(() => {
    const init = async () => {
      if (!activeBusinessId) return
      const res = await fetch('/api/reports', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || text('Failed to load reports', 'No se pudieron cargar los reportes'))
        setLoading(false)
        return
      }
      setProfile(data.profile ?? null)
      setReports(data.reports || [])
      setIsActive(Boolean(data.is_active))
      setActivePrograms(data.active_programs ?? [])
      setLoading(false)
    }
    init()
  }, [activeBusinessId]) // eslint-disable-line react-hooks/exhaustive-deps

  const generateReport = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: selectedType }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || text('Failed to generate report. Please try again.', 'No se pudo generar el reporte. Inténtalo de nuevo.'))
        setGenerating(false)
        return
      }
      setReports((prev) => [data, ...prev])
      setExpandedId(data.report_id)
      toast.success(text('Report generated!', '¡Reporte generado!'))
    } catch {
      toast.error(text('Failed to generate report. Please try again.', 'No se pudo generar el reporte. Inténtalo de nuevo.'))
    }
    setGenerating(false)
  }

  const reportTypeEntry = (type: string) => REPORT_TYPES.find((r) => r.value === type)
  const reportTypeLabel = (type: string) => {
    const entry = reportTypeEntry(type)
    return entry ? entry.label[locale] : type
  }

  if (loading) {
    return (
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-200 rounded-2xl" />
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
        </div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program as string | null)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      allPrograms={activePrograms}
    >
      <div className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <BarChart2 size={24} className="text-green-500" />
          {text('Reports & Deliverables', 'Reportes y entregables')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{text('AI-generated reports stored in your portal', 'Reportes generados por IA guardados en tu portal')}</p>
      </div>

      <div className="card mb-6">
        <h2 className="section-title mb-4">{text('Generate New Report', 'Generar nuevo reporte')}</h2>
        <div className="space-y-3">
          <div>
            <label className="label">{text('Report Type', 'Tipo de reporte')}</label>
            <select
              className="input-field"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as ReportType)}
              disabled={generating}
            >
              {REPORT_TYPES.map((rt) => (
                <option key={rt.value} value={rt.value}>{rt.label[locale]}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              {REPORT_TYPES.find((rt) => rt.value === selectedType)?.desc[locale]}
            </p>
          </div>
          <button
            onClick={generateReport}
            disabled={generating}
            className="btn-primary w-full sm:w-auto"
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin" /> {text('Generating…', 'Generando…')}</>
            ) : (
              <><Plus size={16} /> {text('Generate Report', 'Generar reporte')}</>
            )}
          </button>
          {!isActive && (
            <p className="text-xs text-amber-600">
              <a href="/billing" className="underline font-semibold">{text('Subscribe', 'Suscríbete')}</a> {text('to generate and access reports', 'para generar y acceder a reportes')}
            </p>
          )}
        </div>
      </div>

      <h2 className="section-title mb-4">{text('Your Reports', 'Tus reportes')} ({reports.length})</h2>
      {reports.length === 0 ? (
        <div className="card text-center py-12">
          <BarChart2 size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">{text('No reports yet', 'Aún no hay reportes')}</p>
          <p className="text-xs text-gray-300 mt-1">{text('Generate your first report above', 'Genera tu primer reporte arriba')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.report_id} className="card">
              <button
                className="w-full flex items-center justify-between gap-3"
                onClick={() => setExpandedId(expandedId === report.report_id ? null : report.report_id)}
              >
                <div className="flex items-start gap-3 text-left">
                  <div className="w-9 h-9 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={18} className="text-green-500" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">{report.title}</p>
                    <p className="text-xs text-green-500 mt-0.5">{reportTypeLabel(report.report_type)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatDateTime(report.generated_at)}</p>
                  </div>
                </div>
                {expandedId === report.report_id
                  ? <ChevronUp size={18} className="text-gray-400 shrink-0" />
                  : <ChevronDown size={18} className="text-gray-400 shrink-0" />
                }
              </button>

              {expandedId === report.report_id && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div
                    className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: report.content
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n\n/g, '</p><p class="mb-3">')
                        .replace(/\n/g, '<br/>')
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  )
}
