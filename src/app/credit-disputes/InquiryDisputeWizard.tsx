'use client'

import { useState } from 'react'
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

function formatReadableDate(dateValue: string) {
  if (!dateValue) return '—'
  const date = new Date(`${dateValue}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function InquiryDisputeWizard({ fullName, bureauOverride }: { fullName: string; bureauOverride?: string | null }) {
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
      setError('Complete every required field and confirm the statement before generating.')
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
        setError(data.error || 'Failed to generate letter.')
        return
      }

      setGeneratedLetter(data.dispute.generated_letter)
      setStep(4)
    } catch {
      setError('Something went wrong. Please try again.')
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
          <title>Inquiry Dispute Letter</title>
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              margin: 40px;
              color: #111827;
              line-height: 1.45;
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 12px;
            }
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={20} className="text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Prepare Inquiry Dispute Letter</h1>
          </div>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            This free tool helps you prepare a dispute letter for a credit inquiry you believe is inaccurate or unauthorized.
            We do not review your credit report or decide what to dispute.
            <span className="block mt-1 text-slate-400">Preparing as: {fullName}</span>
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 hover:text-white text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <FileText size={16} />
          Start Over
        </button>
      </div>

      <div className={`${SECTION_CARD} px-5 py-4 text-sm text-slate-200`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">How this works</p>
            <p className="mt-1 font-medium text-white">Prepare your own inquiry dispute letter in three simple steps.</p>
          </div>
          <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">Free self-service</span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">No report review</span>
          </div>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <li className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-slate-200">We do not review your credit report or decide what to dispute.</li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-slate-200">You must enter the inquiry details from your own report.</li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-slate-200">Choose the bureau the letter should be prepared for.</li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-slate-200">We generate a rule-based letter template when you finish.</li>
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
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Step {stepNumber}</p>
              <p className="mt-1 font-semibold">{label}</p>
            </div>
          )
        })}
      </div>

      {step === 1 && (
        <div className={`${SECTION_CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">Step 1 of 3 · Select your bureau</h2>
            <p className="mt-1 text-xs text-slate-400">Choose the credit bureau listed on the inquiry you want to dispute.</p>
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
              This letter will be prepared for: <span className="font-semibold text-white">{bureau || 'select a bureau'}</span>
            </p>
            <div className="flex gap-3">
              <button disabled={!bureau} onClick={() => setStep(2)} className={STEP_BUTTON}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={`${SECTION_CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">Step 2 of 3 · Enter inquiry details</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className={`${SUMMARY_CARD}`}>
              <p className="font-semibold text-white">Destination</p>
              <p className="mt-1 text-slate-300">This letter will be sent to: <span className="font-semibold text-white">{bureau || 'select a bureau'}</span></p>
              <p className="text-slate-300">Inquiry being disputed: <span className="font-semibold text-white">{companyName || 'company name'}{inquiryDate ? ` on ${formatReadableDate(inquiryDate)}` : ''}</span></p>
            </div>

            <div>
              <label className={LABEL_CLASS}>Inquiry company name</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Example: Capital One"
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Inquiry date</label>
              <input
                type="date"
                value={inquiryDate}
                onChange={(e) => setInquiryDate(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Reason for dispute</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
                className={FIELD_CLASS}
              >
                <option value="">Select a reason</option>
                {REASONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>User statement / notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Explain why you believe the inquiry is inaccurate or unauthorized."
                className={`${FIELD_CLASS} resize-none`}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Supporting documents (optional)</label>
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Upload size={15} className="text-emerald-400" />
                  <span>Choose files to include in your preparation notes.</span>
                </div>
                <input
                  type="file"
                  multiple
                  onChange={(e) => onSelectFiles(e.target.files)}
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-green-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-green-700"
                />
                {supportingDocuments.length > 0 && (
                  <p className="mt-3 text-xs text-slate-400">
                    Selected: {supportingDocuments.join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className={SECONDARY_BUTTON}>Back</button>
              <button disabled={!companyName.trim() || !inquiryDate || !reason} onClick={() => setStep(3)} className={STEP_BUTTON}>
                Review
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={`${SECTION_CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">Step 3 of 3 · Review and confirm</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className={`${SUMMARY_CARD} space-y-1.5`}>
              <p><span className="font-semibold text-white">Sending to:</span> <span className="text-slate-300">{bureau}</span></p>
              <p><span className="font-semibold text-white">Inquiry being disputed:</span> <span className="text-slate-300">{companyName} on {formatReadableDate(inquiryDate)}</span></p>
              <p><span className="font-semibold text-white">Reason:</span> <span className="text-slate-300">{reason}</span></p>
              <p><span className="font-semibold text-white">Notes:</span> <span className="text-slate-300">{notes}</span></p>
              <p><span className="font-semibold text-white">Documents:</span> <span className="text-slate-300">{supportingDocuments.length > 0 ? supportingDocuments.join(', ') : 'None selected'}</span></p>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-slate-100">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
              />
              <span>I reviewed my credit report and believe this inquiry is inaccurate or unauthorized.</span>
            </label>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-950/35 px-3 py-2">
                <XCircle size={14} className="text-red-300" />
                <p className="text-xs text-red-100">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className={SECONDARY_BUTTON}>Back</button>
              <button disabled={!confirmed || submitting} onClick={handleGenerate} className={`${STEP_BUTTON} flex items-center justify-center gap-2`}>
                {submitting ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : 'Generate Letter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 4 && generatedLetter && (
        <div className={`${SECTION_CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">Letter generated</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <p className="text-sm text-slate-100 font-medium">Your inquiry dispute letter is ready.</p>
            </div>

            <div className={`${SUMMARY_CARD}`}>
              <p><span className="font-semibold text-white">Sending to:</span> <span className="text-slate-300">{bureau}</span></p>
              <p><span className="font-semibold text-white">Inquiry being disputed:</span> <span className="text-slate-300">{companyName} on {formatReadableDate(inquiryDate)}</span></p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Prepared letter</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={downloadPdf} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 hover:text-white">
                    <FileText size={13} /> Download PDF
                  </button>
                  <button onClick={printLetter} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 hover:text-white">
                    Print
                  </button>
                  <button onClick={copyLetter} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 hover:text-white">
                    <Copy size={13} /> {copied ? 'Copied!' : 'Copy Letter'}
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
