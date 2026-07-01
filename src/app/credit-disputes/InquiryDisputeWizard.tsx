'use client'

import { useState } from 'react'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { CheckCircle2, Copy, FileText, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react'
import { jsPDF } from 'jspdf'

type WizardStep = 1 | 2 | 3 | 4

const BUREAUS = ['Experian', 'Equifax', 'TransUnion'] as const

const REASONS = [
  'I do not recognize this inquiry',
  'I did not authorize this inquiry',
  'This inquiry appears duplicated',
  'This inquiry information is inaccurate',
  'This inquiry is related to identity theft or fraud',
] as const

const FLOW_STEPS = ['Select bureau', 'Enter inquiry details', 'Review and generate'] as const

const STEP_BUTTON = 'flex-1 bg-green-600 hover:bg-green-700 hover:text-white disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none text-white text-sm font-semibold py-2.5 rounded-xl transition-colors shadow-sm shadow-emerald-900/20'
const SECONDARY_BUTTON = 'flex-1 border border-slate-700 text-slate-100 text-sm font-semibold py-2.5 rounded-xl bg-slate-900/70 hover:bg-slate-800 hover:text-white transition-colors'
const SECTION_CARD = 'rounded-2xl border border-slate-800 bg-slate-950/70 shadow-sm'
const FIELD_CLASS = 'w-full px-4 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all'
const LABEL_CLASS = 'block text-xs font-semibold text-slate-300 mb-1 uppercase tracking-wide'
const SUMMARY_CARD = 'rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-200'

function formatReadableDate(dateValue: string, locale: 'en' | 'es') {
  if (!dateValue) return '—'
  const date = new Date(`${dateValue}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function InquiryDisputeWizard({ fullName, bureauOverride }: { fullName: string; bureauOverride?: string | null }) {
  const { locale } = useLanguage()
  const [step, setStep] = useState<WizardStep>(1)
  const [bureau, setBureau] = useState(bureauOverride ?? '')
  const [companyName, setCompanyName] = useState('')
  const [inquiryDate, setInquiryDate] = useState('')
  const [reason, setReason] = useState<(typeof REASONS)[number] | ''>('')
  const [notes, setNotes] = useState('')
  const [supportingDocuments, setSupportingDocuments] = useState<string[]>([])
  const [generatedLetter, setGeneratedLetter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  const text = (en: string, es: string) => (locale === 'es' ? es : en)

  const reset = () => {
    setStep(1)
    setBureau(bureauOverride ?? '')
    setCompanyName('')
    setInquiryDate('')
    setReason('')
    setNotes('')
    setSupportingDocuments([])
    setGeneratedLetter('')
    setSubmitting(false)
    setError(null)
    setConfirmed(false)
    setCopied(false)
  }

  const onSelectFiles = (files: FileList | null) => {
    setSupportingDocuments(Array.from(files ?? []).map((file) => file.name))
  }

  const handleGenerate = async () => {
    setError(null)
    if (!bureau || !companyName.trim() || !inquiryDate || !reason || !notes.trim() || !confirmed) {
      setError(text('Complete every required field and confirm the statement before generating.', 'Completa todos los campos requeridos y confirma la declaración antes de generar.'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/credit-disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: 'guided_inquiry',
          bureau,
          inquiry_company: companyName.trim(),
          inquiry_date: inquiryDate,
          inquiry_reason: reason,
          user_statement: notes.trim(),
          supporting_documents: supportingDocuments,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || text('Failed to generate letter.', 'No se pudo generar la carta.'))
        return
      }

      setGeneratedLetter(data.dispute.generated_letter)
      setStep(4)
    } catch {
      setError(text('Something went wrong. Please try again.', 'Algo salió mal. Inténtalo de nuevo.'))
    } finally {
      setSubmitting(false)
    }
  }

  const copyLetter = async () => {
    await navigator.clipboard.writeText(generatedLetter)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const downloadPdf = () => {
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const margin = 48
    const maxWidth = pageWidth - margin * 2
    const lines = pdf.splitTextToSize(generatedLetter, maxWidth)

    pdf.setFont('courier', 'normal')
    pdf.setFontSize(10)
    pdf.text(lines, margin, margin)
    pdf.save(`inquiry-dispute-letter-${bureau || 'bureau'}.pdf`)
  }

  const printLetter = () => {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>${text('Inquiry Dispute Letter', 'Carta de disputa de consulta')}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; margin: 40px; color: #111827; line-height: 1.45; }
            pre { white-space: pre-wrap; word-wrap: break-word; font-size: 12px; }
          </style>
        </head>
        <body>
          <pre>${generatedLetter.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
          <script>
            window.onload = function () {
              window.print();
              setTimeout(function () { window.close(); }, 250);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const stepLabel = (label: (typeof FLOW_STEPS)[number]) => {
    if (label === 'Select bureau') return text('Select bureau', 'Selecciona la agencia')
    if (label === 'Enter inquiry details') return text('Enter inquiry details', 'Ingresa los detalles de la consulta')
    return text('Review and generate', 'Revisar y generar')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={20} className="text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">{text('Prepare Inquiry Dispute Letter', 'Preparar carta de disputa de consulta')}</h1>
          </div>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            {text(
              'This free tool helps you prepare a dispute letter for a credit inquiry you believe is inaccurate or unauthorized. We do not review your credit report or decide what to dispute.',
              'Esta herramienta gratuita te ayuda a preparar una carta de disputa para una consulta de crédito que crees inexacta o no autorizada. No revisamos tu informe de crédito ni decidimos qué disputar.'
            )}
            <span className="block mt-1 text-slate-400">{text('Preparing as', 'Preparando como')}: {fullName}</span>
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 hover:text-white text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <FileText size={16} />
          {text('Start Over', 'Empezar de nuevo')}
        </button>
      </div>

      <div className={`${SECTION_CARD} px-5 py-4 text-sm text-slate-200`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">{text('How this works', 'Cómo funciona')}</p>
            <p className="mt-1 font-medium text-white">{text('Prepare your own inquiry dispute letter in three simple steps.', 'Prepara tu propia carta de disputa de consulta en tres pasos simples.')}</p>
          </div>
          <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">{text('Free self-service', 'Autoservicio gratis')}</span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">{text('No report review', 'Sin revisión de informe')}</span>
          </div>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <li className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-slate-200">{text('We do not review your credit report or decide what to dispute.', 'No revisamos tu informe de crédito ni decidimos qué disputar.')}</li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-slate-200">{text('You must enter the inquiry details from your own report.', 'Debes ingresar los detalles de la consulta desde tu propio informe.')}</li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-slate-200">{text('Choose the bureau the letter should be prepared for.', 'Elige la agencia de crédito para la que se preparará la carta.')}</li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-slate-200">{text('We generate a rule-based letter template when you finish.', 'Generamos una plantilla de carta basada en reglas cuando termines.')}</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FLOW_STEPS.map((label, index) => {
          const stepNumber = index + 1
          const active = step === stepNumber || (step === 4 && stepNumber === 3)
          return (
            <div
              key={label}
              className={`rounded-xl border px-4 py-3 text-sm transition-colors ${
                active ? 'border-emerald-400 bg-emerald-500/15 text-white shadow-[0_0_0_1px_rgba(34,197,94,0.18)]' : 'border-slate-700 bg-slate-900/70 text-slate-400'
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{text('Step', 'Paso')} {stepNumber}</p>
              <p className="mt-1 font-semibold">{stepLabel(label)}</p>
            </div>
          )
        })}
      </div>

      {step === 1 && (
        <div className={`${SECTION_CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">{text('Step 1 of 3 · Select your bureau', 'Paso 1 de 3 · Selecciona tu agencia')}</h2>
            <p className="mt-1 text-xs text-slate-400">{text('Choose the credit bureau listed on the inquiry you want to dispute.', 'Elige la agencia de crédito que aparece en la consulta que quieres disputar.')}</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {BUREAUS.map((item) => (
                <button
                  key={item}
                  onClick={() => setBureau(item)}
                  className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold text-left transition-colors hover:text-white ${
                    bureau === item
                      ? 'border-emerald-400 bg-emerald-600 text-white shadow-[0_0_0_1px_rgba(34,197,94,0.2),0_8px_20px_rgba(16,185,129,0.12)]'
                      : 'border-slate-700 bg-slate-900/80 text-slate-100 hover:border-emerald-500 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-300">
              {text('This letter will be prepared for', 'Esta carta se preparará para')}:{' '}
              <span className="font-semibold text-white">{bureau || text('select a bureau', 'selecciona una agencia')}</span>
            </p>
            <div className="flex gap-3">
              <button disabled={!bureau} onClick={() => setStep(2)} className={STEP_BUTTON}>
                {text('Continue', 'Continuar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={`${SECTION_CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">{text('Step 2 of 3 · Enter inquiry details', 'Paso 2 de 3 · Ingresa los detalles de la consulta')}</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className={SUMMARY_CARD}>
              <p className="font-semibold text-white">{text('Destination', 'Destino')}</p>
              <p className="mt-1 text-slate-300">{text('This letter will be sent to', 'Esta carta se enviará a')}: <span className="font-semibold text-white">{bureau || text('select a bureau', 'selecciona una agencia')}</span></p>
              <p className="text-slate-300">{text('Inquiry being disputed', 'Consulta en disputa')}: <span className="font-semibold text-white">{companyName || text('company name', 'nombre de la empresa')}{inquiryDate ? ` ${text('on', 'el')} ${formatReadableDate(inquiryDate, locale)}` : ''}</span></p>
            </div>

            <div>
              <label className={LABEL_CLASS}>{text('Inquiry company name', 'Nombre de la empresa consultada')}</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={text('Example: Capital One', 'Ejemplo: Capital One')}
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>{text('Inquiry date', 'Fecha de la consulta')}</label>
              <input
                type="date"
                value={inquiryDate}
                onChange={(e) => setInquiryDate(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>{text('Reason for dispute', 'Motivo de la disputa')}</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
                className={FIELD_CLASS}
              >
                <option value="">{text('Select a reason', 'Selecciona un motivo')}</option>
                {REASONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>{text('User statement / notes', 'Declaración / notas del usuario')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder={text('Explain why you believe the inquiry is inaccurate or unauthorized.', 'Explica por qué crees que la consulta es inexacta o no autorizada.')}
                className={`${FIELD_CLASS} resize-none`}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>{text('Supporting documents (optional)', 'Documentos de respaldo (opcional)')}</label>
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Upload size={15} className="text-emerald-400" />
                  <span>{text('Choose files to include in your preparation notes.', 'Elige archivos para incluir en tus notas de preparación.')}</span>
                </div>
                <input
                  type="file"
                  multiple
                  onChange={(e) => onSelectFiles(e.target.files)}
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-green-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-green-700"
                />
                {supportingDocuments.length > 0 && (
                  <p className="mt-3 text-xs text-slate-400">
                    {text('Selected', 'Seleccionados')}: {supportingDocuments.join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className={SECONDARY_BUTTON}>{text('Back', 'Atrás')}</button>
              <button disabled={!companyName.trim() || !inquiryDate || !reason} onClick={() => setStep(3)} className={STEP_BUTTON}>
                {text('Review', 'Revisar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={`${SECTION_CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">{text('Step 3 of 3 · Review and confirm', 'Paso 3 de 3 · Revisar y confirmar')}</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className={`${SUMMARY_CARD} space-y-1.5`}>
              <p><span className="font-semibold text-white">{text('Sending to', 'Enviando a')}:</span> <span className="text-slate-300">{bureau}</span></p>
              <p><span className="font-semibold text-white">{text('Inquiry being disputed', 'Consulta en disputa')}:</span> <span className="text-slate-300">{companyName} {text('on', 'el')} {formatReadableDate(inquiryDate, locale)}</span></p>
              <p><span className="font-semibold text-white">{text('Reason', 'Motivo')}:</span> <span className="text-slate-300">{reason}</span></p>
              <p><span className="font-semibold text-white">{text('Notes', 'Notas')}:</span> <span className="text-slate-300">{notes}</span></p>
              <p><span className="font-semibold text-white">{text('Documents', 'Documentos')}:</span> <span className="text-slate-300">{supportingDocuments.length > 0 ? supportingDocuments.join(', ') : text('None selected', 'Ninguno seleccionado')}</span></p>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-slate-100">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
              />
              <span>{text('I reviewed my credit report and believe this inquiry is inaccurate or unauthorized.', 'Revisé mi informe de crédito y creo que esta consulta es inexacta o no autorizada.')}</span>
            </label>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-950/35 px-3 py-2">
                <XCircle size={14} className="text-red-300" />
                <p className="text-xs text-red-100">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className={SECONDARY_BUTTON}>{text('Back', 'Atrás')}</button>
              <button disabled={!confirmed || submitting} onClick={handleGenerate} className={`${STEP_BUTTON} flex items-center justify-center gap-2`}>
                {submitting ? <><Loader2 size={15} className="animate-spin" /> {text('Generating…', 'Generando…')}</> : text('Generate Letter', 'Generar carta')}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 4 && generatedLetter && (
        <div className={`${SECTION_CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">{text('Letter generated', 'Carta generada')}</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <p className="text-sm text-slate-100 font-medium">{text('Your inquiry dispute letter is ready.', 'Tu carta de disputa de consulta está lista.')}</p>
            </div>

            <div className={SUMMARY_CARD}>
              <p><span className="font-semibold text-white">{text('Sending to', 'Enviando a')}:</span> <span className="text-slate-300">{bureau}</span></p>
              <p><span className="font-semibold text-white">{text('Inquiry being disputed', 'Consulta en disputa')}:</span> <span className="text-slate-300">{companyName} {text('on', 'el')} {formatReadableDate(inquiryDate, locale)}</span></p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{text('Prepared letter', 'Carta preparada')}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={downloadPdf} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 hover:text-white">
                    <FileText size={13} /> {text('Download PDF', 'Descargar PDF')}
                  </button>
                  <button onClick={printLetter} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 hover:text-white">
                    {text('Print', 'Imprimir')}
                  </button>
                  <button onClick={copyLetter} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 hover:text-white">
                    <Copy size={13} /> {copied ? text('Copied!', '¡Copiado!') : text('Copy Letter', 'Copiar carta')}
                  </button>
                </div>
              </div>
              <textarea
                readOnly
                value={generatedLetter}
                rows={18}
                className="w-full px-4 py-3 text-xs font-mono border border-slate-700 rounded-xl bg-slate-950 text-slate-200 resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
