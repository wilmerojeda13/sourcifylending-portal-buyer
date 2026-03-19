'use client'

import { useState } from 'react'
import {
  ShieldCheck, Plus, Clock, CheckCircle2, AlertTriangle, FileText,
  Send, ChevronDown, ChevronUp, Copy, XCircle, ExternalLink, Loader2
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

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

export default function CreditDisputesClient({ initialDisputes }: { initialDisputes: Dispute[] }) {
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

  const activeDisputes = disputes.filter(d => ['Sent', 'Under Investigation', 'Escalated'].includes(d.status))
  const deadlineSoon = activeDisputes.filter(d => d.investigation_deadline && daysUntil(d.investigation_deadline) <= 7)

  const resetForm = () => {
    setStep(1); setBureau(''); setDisputeType(''); setRecipientType(''); setItemDisputed('')
    setIncorrectInfo(''); setCorrectInfo(''); setFormError(null)
    setGeneratedLetter(null); setLegalBasis([]); setNewDisputeId(null)
  }

  const handleGenerate = async () => {
    setFormError(null)
    if (!itemDisputed.trim() || !incorrectInfo.trim() || !correctInfo.trim()) {
      setFormError('Please fill in all fields before generating.'); return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/credit-disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bureau, dispute_type: disputeType, recipient_type: recipientType || undefined,
          item_disputed: itemDisputed, incorrect_information: incorrectInfo,
          correct_information: correctInfo,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Failed to generate letter.'); return }
      setDisputes(prev => [data.dispute, ...prev])
      setGeneratedLetter(data.dispute.generated_letter)
      setLegalBasis(data.legal_basis || [])
      setNewDisputeId(data.dispute.id)
      setStep(4)
    } catch {
      setFormError('Something went wrong. Please try again.')
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
            <h1 className="text-2xl font-bold text-gray-900">Credit Dispute Management</h1>
          </div>
          <p className="text-sm text-gray-500 max-w-xl">
            Generate FCRA-compliant dispute letters, track your disputes, and manage investigation deadlines from one place.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
        >
          <Plus size={16} /> New Dispute
        </button>
      </div>

      {/* Compliance notice */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-xs text-amber-700 leading-relaxed">
        <strong>Informational Tool:</strong> Dispute tools are provided to help consumers exercise their rights under the Fair Credit Reporting Act. SourcifyLending does not provide credit repair services.
      </div>

      {/* Deadline alerts */}
      {deadlineSoon.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 space-y-1">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Upcoming Deadlines</p>
          {deadlineSoon.map(d => (
            <p key={d.id} className="text-sm text-red-700">
              <strong>{d.bureau}</strong> dispute ({d.item_disputed}) —&nbsp;
              deadline in <strong>{daysUntil(d.investigation_deadline!)} day{daysUntil(d.investigation_deadline!) !== 1 ? 's' : ''}</strong>
            </p>
          ))}
        </div>
      )}

      {/* New Dispute Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {step === 4 ? 'Dispute Letter Generated' : step === 2.5 ? 'New Dispute — Step 2b of 3' : `New Dispute — Step ${step} of 3`}
            </h2>
            <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-600">
              <XCircle size={18} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {step === 1 && (
              <>
                <p className="text-sm font-semibold text-gray-700">Step 1: Where is this letter going?</p>
                <div className="grid grid-cols-2 gap-3">
                  {BUREAUS.map(b => (
                    <button key={b} onClick={() => setBureau(b)}
                      className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${bureau === b ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-green-300'}`}>
                      {b}
                    </button>
                  ))}
                </div>
                <button disabled={!bureau} onClick={() => setStep(2)}
                  className="w-full mt-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
                  Continue →
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-sm font-semibold text-gray-700">Step 2: Select Dispute Type</p>
                <div className="grid grid-cols-2 gap-3">
                  {DISPUTE_TYPES.map(t => (
                    <button key={t} onClick={() => setDisputeType(t)}
                      className={`p-3 rounded-xl border-2 text-sm font-semibold text-left transition-all ${disputeType === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-green-300'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                {disputeType && DISPUTE_TYPE_INFO[disputeType] && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Legal Basis</p>
                    <p className="text-xs text-blue-800 font-mono">{DISPUTE_TYPE_INFO[disputeType].laws}</p>
                    <p className="text-xs text-blue-600">{DISPUTE_TYPE_INFO[disputeType].tip}</p>
                  </div>
                )}
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setStep(1)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">← Back</button>
                  <button disabled={!disputeType} onClick={() => disputeType === 'Collection Account' ? setStep(2.5) : setStep(3)} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">Continue →</button>
                </div>
              </>
            )}

            {step === 2.5 && (
              <>
                <p className="text-sm font-semibold text-gray-700">Step 2b: Who is this letter directed to?</p>
                <p className="text-xs text-gray-500">Collection disputes use different laws depending on who receives the letter.</p>
                <div className="grid grid-cols-1 gap-3">
                  {COLLECTION_RECIPIENTS.map(r => (
                    <button key={r} onClick={() => setRecipientType(r)}
                      className={`p-3 rounded-xl border-2 text-sm font-semibold text-left transition-all ${recipientType === r ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-green-300'}`}>
                      <span>{r}</span>
                      <span className="block text-xs font-normal text-gray-400 mt-0.5">
                        {r === 'Credit Bureau' && 'FCRA §§ 611, 607, 623 — reinvestigation request'}
                        {r === 'Furnisher / Creditor' && 'FCRA § 623 — furnisher accuracy obligations'}
                        {r === 'Debt Collector' && 'FDCPA §§ 807, 808, 809 + FCRA — validation & accuracy'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setStep(2)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">← Back</button>
                  <button disabled={!recipientType} onClick={() => setStep(3)} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">Continue →</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-sm font-semibold text-gray-700">Step 3: Enter Dispute Details</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Item Being Disputed</label>
                  <input value={itemDisputed} onChange={e => setItemDisputed(e.target.value)} placeholder="e.g. Account #12345 — Capital One"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Incorrect Information on File</label>
                  <textarea value={incorrectInfo} onChange={e => setIncorrectInfo(e.target.value)} rows={3} placeholder="Describe what is incorrect on your credit report…"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Correct Information</label>
                  <textarea value={correctInfo} onChange={e => setCorrectInfo(e.target.value)} rows={3} placeholder="Describe what the correct information should be…"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none transition-all" />
                </div>
                {formError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <XCircle size={14} className="text-red-500" />
                    <p className="text-xs text-red-700">{formError}</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">← Back</button>
                  <button onClick={handleGenerate} disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {submitting ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : 'Generate Letter'}
                  </button>
                </div>
              </>
            )}

            {step === 4 && generatedLetter && (
              <>
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <p className="text-sm text-green-700 font-medium">Dispute letter generated and saved to your account.</p>
                </div>

                {legalBasis.length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Legal Basis Used</p>
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
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Your Dispute Letter</p>
                    <button onClick={() => copyLetter(generatedLetter)} className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 font-semibold">
                      <Copy size={13} /> {copied ? 'Copied!' : 'Copy Letter'}
                    </button>
                  </div>
                  <textarea readOnly value={generatedLetter} rows={14}
                    className="w-full px-4 py-3 text-xs font-mono border border-gray-200 rounded-xl bg-gray-50 resize-none" />
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
                  This draft is generated for informational purposes to help consumers exercise rights under applicable consumer protection laws. SourcifyLending does not provide legal advice or credit repair services. Individual results vary.
                </p>

                {newDisputeId && (
                  <button onClick={() => { markSent(newDisputeId); setShowForm(false); resetForm() }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                    <Send size={15} /> I&apos;ve Sent This Letter — Mark as Sent
                  </button>
                )}
                <button onClick={() => { setShowForm(false); resetForm() }} className="w-full border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  Save for Later
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dispute Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Active Disputes', value: activeDisputes.length, color: 'text-blue-600' },
          { label: 'Resolved', value: disputes.filter(d => d.status === 'Resolved').length, color: 'text-green-600' },
          { label: 'Escalated', value: disputes.filter(d => d.status === 'Escalated').length, color: 'text-red-600' },
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
          <h2 className="text-sm font-semibold text-gray-900">Dispute History</h2>
        </div>
        {disputes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <ShieldCheck size={28} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">No disputes yet</p>
            <p className="text-xs text-gray-400 mt-1">Click &quot;New Dispute&quot; to generate your first FCRA letter.</p>
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
                          <span className="text-sm font-semibold text-gray-900">{dispute.bureau}</span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-500">{dispute.dispute_type}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                            <StatusIcon size={10} /> {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{dispute.item_disputed}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400">Created {formatDate(dispute.created_at)}</span>
                          {dispute.date_sent && <span className="text-xs text-gray-400">Sent {formatDate(dispute.date_sent)}</span>}
                          {dispute.investigation_deadline && days !== null && (
                            <span className={`text-xs font-semibold ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                              {days < 0 ? 'Deadline passed' : `Deadline: ${days}d`}
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
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispute Letter</p>
                            <button onClick={() => copyLetter(dispute.generated_letter!)} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-semibold">
                              <Copy size={12} /> Copy
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
                            <Send size={12} /> Mark as Sent
                          </button>
                        )}
                        {dispute.status === 'Sent' && (
                          <button onClick={() => updateStatus(dispute.id, 'Under Investigation')} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            <Clock size={12} /> Mark Under Investigation
                          </button>
                        )}
                        {['Sent', 'Under Investigation'].includes(dispute.status) && (
                          <button onClick={() => updateStatus(dispute.id, 'Resolved')} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            <CheckCircle2 size={12} /> Mark Resolved
                          </button>
                        )}
                        {dispute.status !== 'Deleted' && dispute.status !== 'Resolved' && (
                          <button onClick={() => updateStatus(dispute.id, 'Deleted')} className="flex items-center gap-1.5 border border-gray-200 text-gray-500 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                            <XCircle size={12} /> Delete
                          </button>
                        )}
                      </div>

                      {/* Escalation options */}
                      {canEscalate && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                          <p className="text-xs font-bold text-red-700 mb-2">Deadline Approaching or Passed — Escalation Options</p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { type: 'followup', label: 'Follow-Up Dispute Letter' },
                              { type: 'method_of_verification', label: 'Method of Verification' },
                              { type: 'cfpb', label: 'CFPB Complaint Letter' },
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
                            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Escalation Letter</p>
                            <button onClick={() => copyLetter(escalationLetter.text)} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold">
                              <Copy size={12} /> Copy
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
