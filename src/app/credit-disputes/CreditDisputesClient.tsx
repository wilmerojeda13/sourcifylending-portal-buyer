'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, Plus, Clock, CheckCircle2, AlertTriangle, FileText,
  Send, ChevronDown, ChevronUp, Copy, XCircle, ExternalLink, Loader2
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useLanguage } from '@/components/i18n/LanguageProvider'

interface Dispute {
  id: string
  bureau: string
  dispute_type: string
  item_disputed: string
  incorrect_information: string
  correct_information: string
  generated_letter?: string | null
  date_generated?: string
  date_sent?: string | null
  investigation_deadline?: string | null
  status: string
  response_notes?: string | null
  created_at: string
  updated_at: string
}

type Step = 1 | 2 | 2.5 | 3 | 4

const BUREAUS = ['Experian', 'Equifax', 'TransUnion', 'Furnisher / Creditor', 'Debt Collector'] as const
const DISPUTE_TYPES = ['Personal Information', 'Account Information', 'Collection Account', 'Hard Inquiry', 'Obsolete Reporting'] as const
const COLLECTION_RECIPIENTS = ['Credit Bureau', 'Furnisher / Creditor', 'Debt Collector'] as const

const DISPUTE_TYPE_INFO: Record<string, { laws: string; tip: string }> = {
  'Personal Information': {
    laws: 'FCRA § 611 (15 U.S.C. § 1681i) · FCRA § 607(b) (15 U.S.C. § 1681e)',
    tip: 'Use for wrong name, address, DOB, phone, or employer on your report.',
  },
  'Account Information': {
    laws: 'FCRA § 611 · FCRA § 607(b) · FCRA § 623 (15 U.S.C. § 1681s-2)',
    tip: 'Use for wrong balance, payment history, duplicate accounts, or accounts not yours.',
  },
  'Collection Account': {
    laws: 'FCRA §§ 611, 607, 623 · FDCPA § 809 (15 U.S.C. § 1692g) when directed to a debt collector',
    tip: 'Select where this letter is going — bureau, furnisher, or debt collector — to apply the correct law.',
  },
  'Hard Inquiry': {
    laws: 'FCRA § 604 (15 U.S.C. § 1681b) · FCRA § 611 (15 U.S.C. § 1681i)',
    tip: 'Use for unauthorized or unrecognized hard inquiries with no permissible purpose.',
  },
  'Obsolete Reporting': {
    laws: 'FCRA § 605 (15 U.S.C. § 1681c) · FCRA § 611 (15 U.S.C. § 1681i)',
    tip: 'Use for negative items beyond the 7-year (or 10-year bankruptcy) reporting window.',
  },
}

const OPTION_BASE = 'p-3 rounded-xl border-2 text-sm font-semibold text-left transition-all duration-150'
const OPTION_INACTIVE = 'border-slate-700/80 text-slate-200/90 bg-slate-900/30 hover:border-emerald-400/70 hover:bg-slate-800/70 hover:text-white'
const OPTION_ACTIVE = 'border-emerald-400 bg-emerald-900/45 text-emerald-50 shadow-[0_0_0_1px_rgba(74,222,128,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]'
const CONTINUE_BUTTON = 'flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors shadow-sm'
const NOTICE_PANEL = 'rounded-2xl border border-red-500/30 bg-red-950/35 px-4 py-3 text-sm leading-relaxed text-red-100'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  'Draft':              { label: 'Draft',              color: 'bg-gray-100 text-gray-600',   icon: FileText },
  'Generated':          { label: 'Generated',          color: 'bg-blue-100 text-blue-700',   icon: FileText },
  'Sent':               { label: 'Sent',               color: 'bg-purple-100 text-purple-700', icon: Send },
  'Under Investigation':{ label: 'Under Investigation',color: 'bg-amber-100 text-amber-700', icon: Clock },
  'Resolved':           { label: 'Resolved',           color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  'Escalated':          { label: 'Escalated',          color: 'bg-red-100 text-red-700',     icon: AlertTriangle },
  'Deleted':            { label: 'Deleted',            color: 'bg-gray-100 text-gray-400',   icon: XCircle },
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export default function CreditDisputesClient({ initialDisputes, prospectMode = false, documentsUploadedCount = 0 }: { initialDisputes: Dispute[]; prospectMode?: boolean; documentsUploadedCount?: number }) {
  const { locale } = useLanguage()
  const [disputes, setDisputes] = useState<Dispute[]>(initialDisputes)
  const [showForm, setShowForm] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [bureau, setBureau] = useState('')
  const [disputeType, setDisputeType] = useState('')
  const [recipientType, setRecipientType] = useState('')
  const [itemDisputed, setItemDisputed] = useState('')
  const [incorrectInfo, setIncorrectInfo] = useState('')
  const [correctInfo, setCorrectInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [generatedLetter, setGeneratedLetter] = useState<string | null>(null)
  const [legalBasis, setLegalBasis] = useState<{ statute: string; cite: string; purpose: string }[]>([])
  const [newDisputeId, setNewDisputeId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [escalationLoading, setEscalationLoading] = useState<string | null>(null)
  const [escalationLetter, setEscalationLetter] = useState<{ id: string; text: string } | null>(null)
  const router = useRouter()
  const inquiryOnlyMode = prospectMode
  const isPaidWorkflow = !inquiryOnlyMode
  const canOpenPaidBuilder = !isPaidWorkflow || documentsUploadedCount > 0
  const text = (en: string, es: string) => (locale === 'es' ? es : en)
  const localizeBureau = (value: string) => {
    if (locale !== 'es') return value
    const map: Record<string, string> = {
      'Furnisher / Creditor': 'Proveedor de datos / acreedor',
      'Debt Collector': 'Cobrador de deudas',
    }
    return map[value] ?? value
  }
  const localizeDisputeType = (value: string) => {
    if (locale !== 'es') return value
    const map: Record<string, string> = {
      'Personal Information': 'Información personal',
      'Account Information': 'Información de la cuenta',
      'Collection Account': 'Cuenta en cobranza',
      'Hard Inquiry': 'Consulta dura',
      'Obsolete Reporting': 'Reporte obsoleto',
    }
    return map[value] ?? value
  }
  const localizeRecipientType = (value: string) => {
    if (locale !== 'es') return value
    const map: Record<string, string> = {
      'Credit Bureau': 'Buró de crédito',
      'Furnisher / Creditor': 'Proveedor de datos / acreedor',
      'Debt Collector': 'Cobrador de deudas',
    }
    return map[value] ?? value
  }
  const localizedTip = (type: string) => {
    switch (type) {
      case 'Personal Information':
        return text(
          'Use for wrong name, address, DOB, phone, or employer on your report.',
          'Úsalo para nombre, dirección, fecha de nacimiento, teléfono o empleador incorrectos en tu reporte.'
        )
      case 'Account Information':
        return text(
          'Use for wrong balance, payment history, duplicate accounts, or accounts not yours.',
          'Úsalo para saldo incorrecto, historial de pagos incorrecto, cuentas duplicadas o cuentas que no te pertenecen.'
        )
      case 'Collection Account':
        return text(
          'Select where this letter is going — bureau, furnisher, or debt collector — to apply the correct law.',
          'Selecciona a dónde irá esta carta — buró, acreedor o cobrador — para aplicar la ley correcta.'
        )
      case 'Hard Inquiry':
        return text(
          'Use for unauthorized or unrecognized hard inquiries with no permissible purpose.',
          'Úsalo para consultas duras no autorizadas o no reconocidas sin propósito permitido.'
        )
      case 'Obsolete Reporting':
        return text(
          'Use for negative items beyond the 7-year (or 10-year bankruptcy) reporting window.',
          'Úsalo para elementos negativos fuera de la ventana de reporte de 7 años (o 10 años en bancarrota).'
        )
      default:
        return DISPUTE_TYPE_INFO[type]?.tip ?? ''
    }
  }
  const statusLabel = (status: string) => {
    switch (status) {
      case 'Draft': return text('Draft', 'Borrador')
      case 'Generated': return text('Generated', 'Generada')
      case 'Sent': return text('Sent', 'Enviada')
      case 'Under Investigation': return text('Under Investigation', 'En investigación')
      case 'Resolved': return text('Resolved', 'Resuelta')
      case 'Escalated': return text('Escalated', 'Escalada')
      case 'Deleted': return text('Deleted', 'Eliminada')
      default: return status
    }
  }

  const activeDisputes = disputes.filter(d => ['Sent', 'Under Investigation', 'Escalated'].includes(d.status))
  const deadlineSoon = activeDisputes.filter(d => d.investigation_deadline && daysUntil(d.investigation_deadline) <= 7)
  const effectiveDisputeType = inquiryOnlyMode ? 'Hard Inquiry' : disputeType

  const resetForm = () => {
    setStep(1); setBureau(''); setDisputeType(inquiryOnlyMode ? 'Hard Inquiry' : ''); setRecipientType(''); setItemDisputed('')
    setIncorrectInfo(''); setCorrectInfo(''); setFormError(null)
    setGeneratedLetter(null); setLegalBasis([]); setNewDisputeId(null)
  }

  const handleGenerate = async () => {
    setFormError(null)
    if (!itemDisputed.trim() || !incorrectInfo.trim() || !correctInfo.trim()) {
      setFormError(text('Please fill in all fields before generating.', 'Completa todos los campos antes de generar.')); return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/credit-disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bureau,
          dispute_type: effectiveDisputeType,
          recipient_type: inquiryOnlyMode ? undefined : recipientType || undefined,
          item_disputed: itemDisputed, incorrect_information: incorrectInfo,
          correct_information: correctInfo,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || text('Failed to generate letter.', 'No se pudo generar la carta.')); return }
      setDisputes(prev => [data.dispute, ...prev])
      setGeneratedLetter(data.dispute.generated_letter)
      setLegalBasis(data.legal_basis || [])
      setNewDisputeId(data.dispute.id)
      setStep(4)
    } catch {
      setFormError(text('Something went wrong. Please try again.', 'Algo salió mal. Inténtalo de nuevo.'))
    } finally {
      setSubmitting(false)
    }
  }

  const markSent = async (disputeId: string) => {
    const res = await fetch('/api/credit-disputes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: disputeId, status: 'Sent' }),
    })
    const data = await res.json()
    if (res.ok) setDisputes(prev => prev.map(d => d.id === disputeId ? data.dispute : d))
  }

  const updateStatus = async (disputeId: string, status: string) => {
    const res = await fetch('/api/credit-disputes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: disputeId, status }),
    })
    const data = await res.json()
    if (res.ok) setDisputes(prev => prev.map(d => d.id === disputeId ? data.dispute : d))
  }

  const generateEscalation = async (disputeId: string, type: string) => {
    setEscalationLoading(`${disputeId}-${type}`)
    const res = await fetch('/api/credit-disputes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: disputeId, escalation_type: type }),
    })
    const data = await res.json()
    if (res.ok) setEscalationLetter({ id: disputeId, text: data.escalation_letter })
    setEscalationLoading(null)
    if (type !== 'cfpb') await updateStatus(disputeId, 'Escalated')
  }

  const copyLetter = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={20} className="text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              {inquiryOnlyMode ? text('Free Inquiry Dispute Tool', 'Herramienta gratuita de disputa de consultas') : text('Paid Dispute Builder', 'Constructor de disputas de pago')}
            </h1>
          </div>
          <p className="text-sm text-gray-500 max-w-xl">
            {inquiryOnlyMode
              ? text('Generate hard inquiry dispute letters for inquiries you believe are unauthorized or inaccurate, then track them from one place.', 'Genera cartas de disputa por consultas duras que creas no autorizadas o inexactas y luego hazles seguimiento desde un solo lugar.')
              : text('Upload first, then use the paid dispute builder to organize AI-assisted review and draft disputes for inquiries, collections, and other paid items.', 'Primero sube tus documentos y luego usa el constructor de disputas de pago para organizar la revisión asistida por IA y redactar disputas para consultas, cobranzas y otros elementos de pago.')}
          </p>
        </div>
        <button
          onClick={() => {
            if (isPaidWorkflow && !canOpenPaidBuilder) {
              router.push('/documents')
              return
            }
            resetForm(); setShowForm(true)
          }}
          className={`flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0 ${
            isPaidWorkflow && !canOpenPaidBuilder
              ? 'bg-slate-700 hover:bg-slate-600'
              : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          <Plus size={16} /> {inquiryOnlyMode ? text('New Inquiry Dispute', 'Nueva disputa de consulta') : (documentsUploadedCount > 0 ? text('Build Dispute', 'Crear disputa') : text('Upload Report First', 'Sube el informe primero'))}
        </button>
      </div>

      <div className={NOTICE_PANEL}>
        <strong className="font-semibold text-red-50">{text('Informational Tool:', 'Herramienta informativa:')}</strong>{' '}
        {text('Dispute tools are provided to help consumers exercise their rights under the Fair Credit Reporting Act. SourcifyLending does not provide credit repair services.', 'Las herramientas de disputa se ofrecen para ayudar a los consumidores a ejercer sus derechos bajo la Ley de Reporte Justo de Crédito. SourcifyLending no ofrece servicios de reparación de crédito.')}
        {inquiryOnlyMode && (
          <span className="mt-1 block text-red-100/90">{text('Free accounts can generate hard inquiry dispute letters only.', 'Las cuentas gratuitas solo pueden generar cartas de disputa por consultas duras.')}</span>
        )}
        {!inquiryOnlyMode && (
          <span className="mt-1 block text-red-100/90">
            {text('Paid users can work on inquiries, collections, and other dispute items after uploading report and support documents.', 'Los usuarios de pago pueden trabajar consultas, cobranzas y otros elementos de disputa después de subir el informe y los documentos de respaldo.')}
          </span>
        )}
      </div>

      {!inquiryOnlyMode && documentsUploadedCount === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {text('Upload your credit report and supporting documents in', 'Sube tu informe de crédito y documentos de respaldo en')} <button onClick={() => router.push('/documents')} className="font-semibold underline underline-offset-2">{text('Documents', 'Documentos')}</button> {text('before starting the AI-assisted paid dispute workflow.', 'antes de iniciar el flujo de disputa de pago asistido por IA.')}
        </div>
      )}

      {deadlineSoon.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 space-y-1">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">{text('Upcoming Deadlines', 'Próximos vencimientos')}</p>
          {deadlineSoon.map(d => (
            <p key={d.id} className="text-sm text-red-700">
              <strong>{d.bureau}</strong> {text('dispute', 'disputa')} ({d.item_disputed}) —&nbsp;
              {text('deadline in', 'vence en')} <strong>{daysUntil(d.investigation_deadline!)} {text(`day${daysUntil(d.investigation_deadline!) !== 1 ? 's' : ''}`, `día${daysUntil(d.investigation_deadline!) !== 1 ? 's' : ''}`)}</strong>
            </p>
          ))}
        </div>
      )}

      {/* New Dispute Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {inquiryOnlyMode
                ? step === 4
                  ? text('Inquiry Dispute Letter Generated', 'Carta de disputa de consulta generada')
                  : text(`New Inquiry Dispute — Step ${step} of 3`, `Nueva disputa de consulta — Paso ${step} de 3`)
                : step === 4
                  ? text('Dispute Letter Generated', 'Carta de disputa generada')
                  : step === 2.5
                    ? text('New Dispute — Step 2b of 3', 'Nueva disputa — Paso 2b de 3')
                    : text(`New Dispute — Step ${step} of 3`, `Nueva disputa — Paso ${step} de 3`)}
            </h2>
            <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-600">
              <XCircle size={18} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {step === 1 && (
              <>
                <p className="text-sm font-semibold text-gray-700">{text('Step 1: Where is this letter going?', 'Paso 1: ¿A dónde se enviará esta carta?')}</p>
                <div className="grid grid-cols-2 gap-3">
                  {BUREAUS.map(b => (
                    <button key={b} onClick={() => setBureau(b)}
                      className={`${OPTION_BASE} ${bureau === b ? OPTION_ACTIVE : OPTION_INACTIVE}`}>
                      {localizeBureau(b)}
                    </button>
                  ))}
                </div>
                <button disabled={!bureau} onClick={() => setStep(2)}
                  className={`w-full mt-2 ${CONTINUE_BUTTON}`}>
                  {text('Continue →', 'Continuar →')}
                </button>
              </>
            )}

            {step === 2 && (
              <>
                {inquiryOnlyMode ? (
                  <>
                    <p className="text-sm font-semibold text-gray-700">{text('Step 2: Hard Inquiry Only', 'Paso 2: Solo consulta dura')}</p>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1">
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">{text('Free Account Scope', 'Alcance de cuenta gratuita')}</p>
                      <p className="text-xs text-blue-800 font-mono">{DISPUTE_TYPE_INFO['Hard Inquiry'].laws}</p>
                      <p className="text-xs text-blue-600">{localizedTip('Hard Inquiry')}</p>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {text('Only hard inquiry disputes are available on the free account.', 'Solo las disputas por consultas duras están disponibles en la cuenta gratuita.')}
                    </p>
                    <div className="flex gap-3 mt-2">
                      <button onClick={() => setStep(1)} className="flex-1 border border-slate-700 text-slate-200 text-sm font-semibold py-2.5 rounded-xl bg-slate-900/40 hover:bg-slate-800/70 transition-colors">{text('← Back', '← Atrás')}</button>
                      <button onClick={() => setStep(3)} className={`flex-1 ${CONTINUE_BUTTON}`}>{text('Continue →', 'Continuar →')}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-gray-700">{text('Step 2: Select Dispute Type', 'Paso 2: Selecciona el tipo de disputa')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {DISPUTE_TYPES.map(t => (
                        <button key={t} onClick={() => setDisputeType(t)}
                          className={`${OPTION_BASE} ${disputeType === t ? OPTION_ACTIVE : OPTION_INACTIVE}`}>
                          {localizeDisputeType(t)}
                        </button>
                      ))}
                    </div>
                    {disputeType && DISPUTE_TYPE_INFO[disputeType] && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">{text('Legal Basis', 'Base legal')}</p>
                        <p className="text-xs text-blue-800 font-mono">{DISPUTE_TYPE_INFO[disputeType].laws}</p>
                        <p className="text-xs text-blue-600">{localizedTip(disputeType)}</p>
                      </div>
                    )}
                    <div className="flex gap-3 mt-2">
                      <button onClick={() => setStep(1)} className="flex-1 border border-slate-700 text-slate-200 text-sm font-semibold py-2.5 rounded-xl bg-slate-900/40 hover:bg-slate-800/70 transition-colors">{text('← Back', '← Atrás')}</button>
                      <button disabled={!disputeType} onClick={() => disputeType === 'Collection Account' ? setStep(2.5) : setStep(3)} className={`flex-1 ${CONTINUE_BUTTON}`}>{text('Continue →', 'Continuar →')}</button>
                    </div>
                  </>
                )}
              </>
            )}

            {step === 2.5 && !inquiryOnlyMode && (
              <>
                <p className="text-sm font-semibold text-gray-700">{text('Step 2b: Who is this letter directed to?', 'Paso 2b: ¿A quién va dirigida esta carta?')}</p>
                <p className="text-xs text-gray-500">{text('Collection disputes use different laws depending on who receives the letter.', 'Las disputas de cobranza usan leyes diferentes según quién reciba la carta.')}</p>
                <div className="grid grid-cols-1 gap-3">
                  {COLLECTION_RECIPIENTS.map(r => (
                    <button key={r} onClick={() => setRecipientType(r)}
                      className={`${OPTION_BASE} ${recipientType === r ? OPTION_ACTIVE : OPTION_INACTIVE}`}>
                      <span>{localizeRecipientType(r)}</span>
                      <span className="block text-xs font-normal text-gray-400 mt-0.5">
                        {r === 'Credit Bureau' && 'FCRA §§ 611, 607, 623 — reinvestigation request'}
                        {r === 'Furnisher / Creditor' && 'FCRA § 623 — furnisher accuracy obligations'}
                        {r === 'Debt Collector' && 'FDCPA §§ 807, 808, 809 + FCRA — validation & accuracy'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setStep(2)} className="flex-1 border border-slate-700 text-slate-200 text-sm font-semibold py-2.5 rounded-xl bg-slate-900/40 hover:bg-slate-800/70 transition-colors">{text('← Back', '← Atrás')}</button>
                  <button disabled={!recipientType} onClick={() => setStep(3)} className={`flex-1 ${CONTINUE_BUTTON}`}>{text('Continue →', 'Continuar →')}</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-sm font-semibold text-gray-700">
                  {inquiryOnlyMode ? text('Step 3: Enter Inquiry Details', 'Paso 3: Ingresa los detalles de la consulta') : text('Step 3: Enter Dispute Details', 'Paso 3: Ingresa los detalles de la disputa')}
                </p>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                    {inquiryOnlyMode ? text('Inquiry Being Disputed', 'Consulta en disputa') : text('Item Being Disputed', 'Elemento en disputa')}
                  </label>
                  <input value={itemDisputed} onChange={e => setItemDisputed(e.target.value)} placeholder={inquiryOnlyMode ? text('e.g. Inquiry from Capital One on 03/12/2026', 'ej. Consulta de Capital One del 03/12/2026') : text('e.g. Account #12345 — Capital One', 'ej. Cuenta #12345 — Capital One')}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                    {inquiryOnlyMode ? text('Why the Inquiry Was Unauthorized or Inaccurate', 'Por qué la consulta fue no autorizada o inexacta') : text('Incorrect Information on File', 'Información incorrecta en el expediente')}
                  </label>
                  <textarea value={incorrectInfo} onChange={e => setIncorrectInfo(e.target.value)} rows={3} placeholder={inquiryOnlyMode ? text('Describe why you believe the inquiry was unauthorized or inaccurate…', 'Describe por qué crees que la consulta fue no autorizada o inexacta…') : text('Describe what is incorrect on your credit report…', 'Describe qué es incorrecto en tu informe de crédito…')}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                    {inquiryOnlyMode ? text('What Should Appear Instead', 'Qué debería aparecer en su lugar') : text('Correct Information', 'Información correcta')}
                  </label>
                  <textarea value={correctInfo} onChange={e => setCorrectInfo(e.target.value)} rows={3} placeholder={inquiryOnlyMode ? text('Describe what should be shown instead…', 'Describe qué debería mostrarse en su lugar…') : text('Describe what the correct information should be…', 'Describe cuál debería ser la información correcta…')}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none transition-all" />
                </div>
                {formError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-950/35 px-3 py-2">
                    <XCircle size={14} className="text-red-300" />
                    <p className="text-xs text-red-100">{formError}</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="flex-1 border border-slate-700 text-slate-200 text-sm font-semibold py-2.5 rounded-xl bg-slate-900/40 hover:bg-slate-800/70 transition-colors">{text('← Back', '← Atrás')}</button>
                  <button onClick={handleGenerate} disabled={submitting} className={`flex-1 ${CONTINUE_BUTTON} flex items-center justify-center gap-2`}>
                    {submitting ? <><Loader2 size={15} className="animate-spin" /> {text('Generating…', 'Generando…')}</> : inquiryOnlyMode ? text('Generate Inquiry Letter', 'Generar carta de consulta') : text('Generate Letter', 'Generar carta')}
                  </button>
                </div>
              </>
            )}

            {step === 4 && generatedLetter && (
              <>
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <p className="text-sm text-green-700 font-medium">{text('Dispute letter generated and saved to your account.', 'Carta de disputa generada y guardada en tu cuenta.')}</p>
                </div>

                {legalBasis.length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">{text('Legal Basis Used', 'Base legal utilizada')}</p>
                    <div className="space-y-1.5">
                      {legalBasis.map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-xs font-bold text-blue-800 shrink-0 font-mono">{s.statute}</span>
                          <span className="text-xs text-blue-600">— {s.purpose}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{text('Your Dispute Letter', 'Tu carta de disputa')}</p>
                    <button onClick={() => copyLetter(generatedLetter)} className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 font-semibold">
                      <Copy size={13} /> {copied ? text('Copied!', '¡Copiado!') : text('Copy Letter', 'Copiar carta')}
                    </button>
                  </div>
                  <textarea readOnly value={generatedLetter} rows={14}
                    className="w-full px-4 py-3 text-xs font-mono border border-gray-200 rounded-xl bg-gray-50 resize-none" />
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
                  {text('This draft is generated for informational purposes to help consumers exercise rights under applicable consumer protection laws. SourcifyLending does not provide legal advice or credit repair services. Individual results vary.', 'Este borrador se genera con fines informativos para ayudar a los consumidores a ejercer sus derechos bajo las leyes aplicables de protección al consumidor. SourcifyLending no brinda asesoría legal ni servicios de reparación de crédito. Los resultados individuales varían.')}
                </p>

                {newDisputeId && (
                  <button onClick={() => { markSent(newDisputeId); setShowForm(false); resetForm() }}
                    className={`w-full ${CONTINUE_BUTTON} flex items-center justify-center gap-2`}>
                    <Send size={15} /> {text("I've Sent This Letter — Mark as Sent", 'Ya envié esta carta — Marcar como enviada')}
                  </button>
                )}
                <button onClick={() => { setShowForm(false); resetForm() }} className="w-full border border-slate-700 text-slate-200 text-sm font-semibold py-2.5 rounded-xl bg-slate-900/40 hover:bg-slate-800/70 transition-colors">
                  {text('Save for Later', 'Guardar para después')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dispute Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: text('Active Disputes', 'Disputas activas'), value: activeDisputes.length, color: 'text-blue-600' },
          { label: text('Resolved', 'Resueltas'), value: disputes.filter(d => d.status === 'Resolved').length, color: 'text-green-600' },
          { label: text('Escalated', 'Escaladas'), value: disputes.filter(d => d.status === 'Escalated').length, color: 'text-red-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Disputes List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">{text('Dispute History', 'Historial de disputas')}</h2>
        </div>
        {disputes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <ShieldCheck size={28} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">{text('No disputes yet', 'Aún no hay disputas')}</p>
            <p className="text-xs text-gray-400 mt-1">{text('Click "New Dispute" to generate your first FCRA letter.', 'Haz clic en "Nueva disputa" para generar tu primera carta FCRA.')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {disputes.map(dispute => {
              const cfg = STATUS_CONFIG[dispute.status] ?? STATUS_CONFIG['Draft']
              const StatusIcon = cfg.icon
              const isExpanded = expandedId === dispute.id
              const isExpired = dispute.investigation_deadline && daysUntil(dispute.investigation_deadline) < 0
              const days = dispute.investigation_deadline ? daysUntil(dispute.investigation_deadline) : null
              const canEscalate = dispute.status === 'Under Investigation' && (isExpired || (days !== null && days <= 3))

              return (
                <div key={dispute.id} className="px-6 py-4">
                  <button onClick={() => setExpandedId(isExpanded ? null : dispute.id)} className="w-full text-left">
                    <div className="flex items-start gap-3 justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{localizeBureau(dispute.bureau)}</span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-500">{localizeDisputeType(dispute.dispute_type)}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                            <StatusIcon size={10} /> {statusLabel(cfg.label)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{dispute.item_disputed}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400">{text('Created', 'Creada')} {formatDate(dispute.created_at)}</span>
                          {dispute.date_sent && <span className="text-xs text-gray-400">{text('Sent', 'Enviada')} {formatDate(dispute.date_sent)}</span>}
                          {dispute.investigation_deadline && days !== null && (
                            <span className={`text-xs font-semibold ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                              {days < 0 ? text('Deadline passed', 'Vencimiento superado') : text(`Deadline: ${days}d`, `Vence en: ${days}d`)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-gray-400 shrink-0 mt-0.5">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {dispute.generated_letter && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{text('Dispute Letter', 'Carta de disputa')}</p>
                            <button onClick={() => copyLetter(dispute.generated_letter!)} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-semibold">
                              <Copy size={12} /> {text('Copy', 'Copiar')}
                            </button>
                          </div>
                          <textarea readOnly value={dispute.generated_letter} rows={6}
                            className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-xl bg-gray-50 resize-none" />
                        </div>
                      )}

                      {/* Status actions */}
                      <div className="flex flex-wrap gap-2">
                        {(dispute.status === 'Generated') && (
                          <button onClick={() => markSent(dispute.id)} className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            <Send size={12} /> {text('Mark as Sent', 'Marcar como enviada')}
                          </button>
                        )}
                        {dispute.status === 'Sent' && (
                          <button onClick={() => updateStatus(dispute.id, 'Under Investigation')} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            <Clock size={12} /> {text('Mark Under Investigation', 'Marcar en investigación')}
                          </button>
                        )}
                        {['Sent', 'Under Investigation'].includes(dispute.status) && (
                          <button onClick={() => updateStatus(dispute.id, 'Resolved')} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            <CheckCircle2 size={12} /> {text('Mark Resolved', 'Marcar resuelta')}
                          </button>
                        )}
                        {dispute.status !== 'Deleted' && dispute.status !== 'Resolved' && (
                          <button onClick={() => updateStatus(dispute.id, 'Deleted')} className="flex items-center gap-1.5 border border-gray-200 text-gray-500 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                            <XCircle size={12} /> {text('Delete', 'Eliminar')}
                          </button>
                        )}
                      </div>

                      {/* Escalation options */}
                      {canEscalate && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                          <p className="text-xs font-bold text-red-700 mb-2">{text('Deadline Approaching or Passed — Escalation Options', 'Vencimiento próximo o superado — Opciones de escalación')}</p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { type: 'followup', label: text('Follow-Up Dispute Letter', 'Carta de seguimiento de disputa') },
                              { type: 'method_of_verification', label: text('Method of Verification', 'Método de verificación') },
                              { type: 'cfpb', label: text('CFPB Complaint Letter', 'Carta de queja ante CFPB') },
                            ].map(({ type, label }) => (
                              <button key={type}
                                onClick={() => generateEscalation(dispute.id, type)}
                                disabled={escalationLoading === `${dispute.id}-${type}`}
                                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                                {escalationLoading === `${dispute.id}-${type}` ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Escalation letter viewer */}
                      {escalationLetter?.id === dispute.id && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">{text('Escalation Letter', 'Carta de escalación')}</p>
                            <button onClick={() => copyLetter(escalationLetter.text)} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold">
                              <Copy size={12} /> {text('Copy', 'Copiar')}
                            </button>
                          </div>
                          <textarea readOnly value={escalationLetter.text} rows={8}
                            className="w-full px-3 py-2 text-xs font-mono border border-red-100 rounded-xl bg-red-50 resize-none" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
