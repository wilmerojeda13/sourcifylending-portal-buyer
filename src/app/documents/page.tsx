'use client'
import { useState, useEffect, useCallback } from 'react'
import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel, formatDateTime } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import {
  Upload, FileText, CheckCircle, Clock, XCircle, Bot,
  CheckCircle2, AlertCircle, Sparkles, TrendingUp, Building2,
  Eye, ShieldCheck, AlertTriangle, Brain,
} from 'lucide-react'
import type { Document, DocumentType, UserProfile, AIDocumentAnalysis } from '@/types'
import toast from 'react-hot-toast'
import { useDropzone } from 'react-dropzone'
import { useBusinessContext } from '@/lib/use-business-context'

// ─── All document types ───────────────────────────────────────────────────────
const ALL_DOC_TYPES: { value: DocumentType; label: string; programs?: string[] }[] = [
  { value: 'personal_credit_report',   label: 'Personal Credit Report',           programs: ['program_a', 'program_c'] },
  { value: 'credit_score_report',      label: 'Credit Score Report',              programs: ['program_a', 'program_c'] },
  { value: 'inquiry_summary',          label: 'Inquiry Summary',                  programs: ['program_a'] },
  { value: 'monitoring_report',        label: 'Credit Monitoring Report',         programs: ['program_c'] },
  { value: 'ein_letter',               label: 'EIN Letter (IRS Confirmation)',    programs: ['program_b'] },
  { value: 'articles_of_organization', label: 'Articles of Organization / Incorporation', programs: ['program_b'] },
  { value: 'business_formation',       label: 'Business Formation Docs',          programs: ['program_b'] },
  { value: 'business_license',         label: 'Business License / Permit',        programs: ['program_b'] },
  { value: 'duns_confirmation',        label: 'D-U-N-S Confirmation',             programs: ['program_b'] },
  { value: 'bank_statement',           label: 'Business Bank Statement',          programs: ['program_b'] },
  { value: 'utility_bill',             label: 'Utility Bill / Address Proof',     programs: ['program_b'] },
  { value: 'vendor_confirmation',      label: 'Vendor Confirmation / Net-30',     programs: ['program_b'] },
  { value: 'vendor_account_screenshot',label: 'Vendor Account Screenshot',        programs: ['program_b'] },
  { value: 'bureau_profile_screenshot',label: 'Business Bureau Profile Screenshot', programs: ['program_b'] },
  { value: 'voided_check',             label: 'Voided Check',                     programs: ['program_b'] },
  { value: 'driver_license',           label: 'Driver License / Government ID' },
  { value: 'other',                    label: 'Other Supporting Document' },
]

// Sort doc types: program-matching first, then others
function getSortedDocTypes(program: string | null | undefined) {
  if (!program) return ALL_DOC_TYPES
  const matching = ALL_DOC_TYPES.filter(d => d.programs?.includes(program))
  const rest = ALL_DOC_TYPES.filter(d => !d.programs?.includes(program))
  return [...matching, ...rest]
}

// Default selection per program
function getDefaultDocType(program: string | null | undefined): DocumentType {
  if (program === 'program_a') return 'personal_credit_report'
  if (program === 'program_b') return 'ein_letter'
  if (program === 'program_c') return 'monitoring_report'
  return 'other'
}

// ─── Program hint banners ─────────────────────────────────────────────────────
const PROGRAM_HINTS: Record<string, { title: string; bullets: string[] }> = {
  program_a: {
    title: 'Program A — Personal Credit Analysis',
    bullets: [
      'Upload your personal credit report to auto-update your credit optimization profile',
      'AI will identify utilization, inquiries, and negative accounts',
      'Specific optimization tasks will be generated based on your report',
    ],
  },
  program_b: {
    title: 'Program B — Business Document Verification',
    bullets: [
      'Upload your EIN letter, Articles, DUNS confirmation, and bank statement',
      'AI will verify your business identity and auto-complete matching checklist items',
      'Supported: formation docs, licenses, bank statements, vendor accounts, bureau profiles',
    ],
  },
  program_c: {
    title: 'Program C — Credit Monitoring',
    bullets: [
      'Upload your monitoring report to track score changes and new alerts',
      'AI will summarize changes, flag issues, and recommend next steps',
      'Your monitoring insights dashboard updates automatically after each upload',
    ],
  },
}

// ─── Enhanced AIAnalysisCard ──────────────────────────────────────────────────
function AIAnalysisCard({ doc, isAnalyzing }: { doc: Document; isAnalyzing: boolean }) {
  const status = doc.ai_analysis_status

  if (isAnalyzing || status === 'analyzing') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-xl px-3 py-2.5">
        <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
        <span>AI is reviewing this document and updating your profile…</span>
      </div>
    )
  }

  if (status === 'skipped') {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
        <Bot size={12} />
        AI review not available (insufficient credits)
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800 rounded-xl px-3 py-2">
        <AlertCircle size={12} />
        AI analysis could not be completed — try re-uploading this document
      </div>
    )
  }

  if (status !== 'completed' || !doc.ai_analysis) return null

  const a: AIDocumentAnalysis = doc.ai_analysis
  const isApproved = a.recommendation === 'approved'
  const isRejected = a.recommendation === 'rejected'
  const program = doc.program

  return (
    <div className={`mt-3 rounded-xl border text-xs overflow-hidden ${
      isApproved ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' :
      isRejected ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' :
      'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
    }`}>

      {/* Header row */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${
        isApproved ? 'border-green-100' : isRejected ? 'border-red-100' : 'border-amber-100'
      }`}>
        <Bot size={12} className={isApproved ? 'text-green-600' : isRejected ? 'text-red-500' : 'text-amber-600'} />
        <span className={`font-bold uppercase tracking-wide text-[10px] ${
          isApproved ? 'text-green-700' : isRejected ? 'text-red-600' : 'text-amber-700'
        }`}>
          AI Review — {isApproved ? 'Accepted' : isRejected ? 'Rejected' : 'Needs Review'}
        </span>
        <span className="ml-auto text-[10px] opacity-60 capitalize">{a.confidence} confidence</span>
      </div>

      <div className="px-3 py-2.5 space-y-2">

        {/* Validation summary */}
        <p className={isApproved ? 'text-green-700' : isRejected ? 'text-red-600' : 'text-amber-700'}>
          {a.validation_summary}
        </p>

        {a.rejection_reason && (
          <p className="text-red-600 font-medium flex items-center gap-1">
            <AlertTriangle size={11} className="shrink-0" /> {a.rejection_reason}
          </p>
        )}

        {/* Extracted fields */}
        {Object.keys(a.extracted_fields ?? {}).length > 0 && (
          <div className="pt-1.5 border-t border-opacity-30 space-y-0.5"
            style={{ borderColor: isApproved ? '#bbf7d0' : isRejected ? '#fca5a5' : '#fde68a' }}>
            {Object.entries(a.extracted_fields).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-gray-400 dark:text-gray-500 capitalize shrink-0">{k.replace(/_/g, ' ')}:</span>
                <span className="font-semibold text-gray-700 dark:text-gray-200">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Program A: Credit Optimization Insights ── */}
        {program === 'program_a' && a.credit_insights && (
          <div className="pt-1.5 border-t border-green-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-700 uppercase tracking-wide">
              <TrendingUp size={10} /> Credit Optimization Insights
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {a.credit_insights.estimated_score_range && (
                <div className="flex gap-1.5">
                  <span className="text-gray-400 dark:text-gray-500">Score range:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.credit_insights.estimated_score_range}</span>
                </div>
              )}
              {a.credit_insights.utilization_pct && (
                <div className="flex gap-1.5">
                  <span className="text-gray-400 dark:text-gray-500">Utilization:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.credit_insights.utilization_pct}</span>
                </div>
              )}
              {a.credit_insights.inquiry_count != null && (
                <div className="flex gap-1.5">
                  <span className="text-gray-400 dark:text-gray-500">Inquiries:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.credit_insights.inquiry_count}</span>
                </div>
              )}
              {a.credit_insights.negative_accounts != null && (
                <div className="flex gap-1.5">
                  <span className="text-gray-400 dark:text-gray-500">Negative accts:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.credit_insights.negative_accounts}</span>
                </div>
              )}
            </div>
            {a.credit_insights.recommendations && a.credit_insights.recommendations.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Recommendations</p>
                {a.credit_insights.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-blue-800">
                    <span className="text-blue-400 font-bold mt-0.5 shrink-0">→</span>
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Program B: Business Identity Confirmed ── */}
        {program === 'program_b' && a.business_identity && Object.values(a.business_identity).some(Boolean) && (
          <div className="pt-1.5 border-t border-green-100 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-700 uppercase tracking-wide">
              <Building2 size={10} /> Business Identity Verified
            </div>
            <div className="space-y-0.5">
              {a.business_identity.business_name && (
                <div className="flex gap-2">
                  <span className="text-gray-400 dark:text-gray-500 shrink-0">Business:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.business_identity.business_name}</span>
                </div>
              )}
              {a.business_identity.ein && (
                <div className="flex gap-2">
                  <span className="text-gray-400 dark:text-gray-500 shrink-0">EIN:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.business_identity.ein}</span>
                </div>
              )}
              {a.business_identity.entity_type && (
                <div className="flex gap-2">
                  <span className="text-gray-400 dark:text-gray-500 shrink-0">Entity:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.business_identity.entity_type}</span>
                </div>
              )}
              {a.business_identity.state && (
                <div className="flex gap-2">
                  <span className="text-gray-400 dark:text-gray-500 shrink-0">State:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.business_identity.state}</span>
                </div>
              )}
              {a.business_identity.duns_number && (
                <div className="flex gap-2">
                  <span className="text-gray-400 dark:text-gray-500 shrink-0">DUNS:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.business_identity.duns_number}</span>
                </div>
              )}
              {a.business_identity.address && (
                <div className="flex gap-2">
                  <span className="text-gray-400 dark:text-gray-500 shrink-0">Address:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{a.business_identity.address}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Program C: Monitoring Summary ── */}
        {program === 'program_c' && a.monitoring_summary && (
          <div className="pt-1.5 border-t border-green-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
              <Eye size={10} /> Monitoring Summary
            </div>
            {a.score_change && (
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                a.score_change.startsWith('+') ? 'bg-green-100 text-green-700' :
                a.score_change.startsWith('-') ? 'bg-red-100 text-red-600' :
                'bg-gray-100 text-gray-600'
              }`}>
                Score change: {a.score_change}
              </div>
            )}
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{a.monitoring_summary}</p>
            {a.alerts && a.alerts.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Alerts</p>
                {a.alerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-amber-700">
                    <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                    {alert}
                  </div>
                ))}
              </div>
            )}
            {a.recommended_actions && a.recommended_actions.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Recommended Actions</p>
                {a.recommended_actions.map((action, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-gray-700 dark:text-gray-300">
                    <span className="text-green-500 font-bold mt-0.5 shrink-0">→</span>
                    {action}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Auto-completed checklist items */}
        {(a.tasks_to_complete?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 text-green-700 pt-0.5">
            <CheckCircle2 size={11} />
            <span className="font-semibold">
              Auto-completed: {a.tasks_to_complete!.map(t => t.replace(/_/g, ' ')).join(', ')}
            </span>
          </div>
        )}

        {/* Next step guidance */}
        {a.next_step_guidance && (
          <p className="text-gray-500 pt-0.5 italic border-t border-opacity-30"
            style={{ borderColor: isApproved ? '#bbf7d0' : '#fde68a' }}>
            → {a.next_step_guidance}
          </p>
        )}

        {/* Updates summary badge */}
        {a.program_updates_summary && (
          <div className="flex items-center gap-1.5 bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-medium">
            <ShieldCheck size={10} className="text-green-500 shrink-0" />
            {a.program_updates_summary}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const { activeBusinessId } = useBusinessContext()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedType, setSelectedType] = useState<DocumentType>('other')
  const [isActive, setIsActive] = useState(false)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [docTypesForProgram, setDocTypesForProgram] = useState(ALL_DOC_TYPES)
  const [activePrograms, setActivePrograms] = useState<string[]>([])

  useEffect(() => {
    const init = async () => {
      if (!activeBusinessId) return
      const res = await fetch('/api/portal/documents', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to load documents')
        setLoading(false)
        return
      }

      const p = data.profile as UserProfile | null
      const docs = data.documents as Document[]
      setProfile(p)
      setDocuments(docs || [])
      setIsActive(Boolean(data.is_active))
      setActivePrograms(data.active_programs ?? [])

      const sorted = getSortedDocTypes(p?.assigned_program)
      setDocTypesForProgram(sorted)
      setSelectedType(getDefaultDocType(p?.assigned_program))
      setLoading(false)
    }
    init()
  }, [activeBusinessId]) // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFile = async (file: File) => {
    if (!isActive) { toast.error('Reactivate subscription to upload documents'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('File must be under 10MB'); return }

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('document_type', selectedType)

    const uploadRes = await fetch('/api/portal/documents', {
      method: 'POST',
      body: formData,
    })
    const uploadData = await uploadRes.json()

    if (!uploadRes.ok) {
      toast.error('Upload failed: ' + (uploadData.error || 'Unknown error'))
      setUploading(false)
      return
    }
    const inserted = uploadData.document as Document | undefined
    setDocuments(uploadData.documents || [])

    // Refresh list immediately so the user sees the new doc
    setUploading(false)

    const docId = inserted?.document_id
    if (docId) {
      setAnalyzingId(docId)
      toast.success('Document uploaded! AI is analyzing it now…', { icon: '🤖' })

      try {
        const res = await fetch('/api/documents/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: docId }),
        })
        const data = await res.json()

        if (data.updates_summary) {
          toast.success(`✓ ${data.updates_summary}`, { duration: 6000 })
        } else if (data.tasks_completed?.length > 0) {
          toast.success(`✓ ${data.tasks_completed.length} task(s) automatically completed!`, { duration: 5000 })
        }

        // Fire Document Agent (fire-and-forget)
        fetch('/api/agents/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent: 'document', documentId: docId }),
        }).catch(() => {})
      } catch {
        // silent — analysis is non-blocking
      } finally {
        setAnalyzingId(null)
        const refreshRes = await fetch('/api/portal/documents', { cache: 'no-store' })
        const refreshData = await refreshRes.json()
        if (refreshRes.ok) {
          setDocuments(refreshData.documents || [])
        }
      }
    }
  }

  const onDrop = useCallback((files: File[]) => {
    if (files.length > 0) uploadFile(files[0])
  }, [selectedType, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: !isActive || uploading,
  })

  const statusIcon = {
    pending:  <Clock size={16} className="text-yellow-500" />,
    reviewed: <CheckCircle size={16} className="text-blue-500" />,
    approved: <CheckCircle size={16} className="text-green-500" />,
    rejected: <XCircle size={16} className="text-red-500" />,
  }

  const docTypeLabel = (type: string) =>
    ALL_DOC_TYPES.find((d) => d.value === type)?.label || type

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (loading) {
    return (
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </PortalLayout>
    )
  }

  const pendingCount  = documents.filter(d => d.review_status === 'pending').length
  const approvedCount = documents.filter(d => d.review_status === 'approved').length
  const aiCount       = documents.filter(d => d.ai_analysis_status === 'completed').length

  const assignedProgram = profile?.assigned_program
  const programHint     = assignedProgram ? PROGRAM_HINTS[assignedProgram] : null

  // Mark doc types that are primary for this program
  const isPrimaryForProgram = (value: DocumentType) =>
    !!assignedProgram && ALL_DOC_TYPES.find(d => d.value === value)?.programs?.includes(assignedProgram)

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program ?? null)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      allPrograms={activePrograms}
    >
      <div className="mb-5 sm:mb-6">
        <h1 className="page-title text-[1.85rem] leading-[1.05] sm:text-2xl sm:leading-tight">Documents</h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-gray-500 dark:text-gray-400 sm:mt-1 sm:text-sm sm:leading-6">
          Upload documents — AI analyzes each one and updates your program automatically
        </p>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 sm:grid-cols-4">
        {[
          { label: 'Total',          value: documents.length, color: 'text-gray-900 dark:text-white' },
          { label: 'Pending Review', value: pendingCount,     color: 'text-yellow-600' },
          { label: 'AI Analyzed',    value: aiCount,          color: 'text-blue-600' },
          { label: 'Approved',       value: approvedCount,    color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card px-4 py-4 text-center sm:px-5 sm:py-5">
            <p className={`text-[1.55rem] font-bold leading-none sm:text-2xl ${color}`}>{value}</p>
            <p className="mt-1.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500 sm:mt-0.5 sm:text-xs">
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Program-specific hint banner */}
      {programHint && (
        <div className="mb-4 rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 px-4 py-4 dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/20 sm:mb-5 sm:p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <Brain size={16} className="mt-0.5 shrink-0 text-green-600" />
            <p className="text-[13px] font-bold leading-5 text-green-900 dark:text-green-300 sm:text-sm">{programHint.title}</p>
          </div>
          <ul className="space-y-1.5">
            {programHint.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-5 text-green-800 dark:text-green-300 sm:text-xs sm:leading-5">
                <span className="text-green-500 font-bold mt-0.5 shrink-0">•</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload Area */}
      <div className="card mb-5 px-4 py-5 sm:mb-6 sm:px-5 sm:py-5">
        <h2 className="section-title mb-3 flex items-center gap-2 text-[1.05rem] leading-tight sm:mb-4 sm:text-lg sm:leading-tight">
          <Upload size={18} className="text-green-500" />
          Upload Document
        </h2>

        <div className="mb-4">
          <label className="label mb-1.5 block text-[11px] uppercase tracking-[0.14em] sm:mb-0 sm:text-xs sm:tracking-wide">Document Type</label>
          <select
            className="input-field"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as DocumentType)}
            disabled={!isActive}
          >
            {/* Primary for this program */}
            {assignedProgram && (
              <optgroup label="— Recommended for your program —">
                {docTypesForProgram
                  .filter(dt => dt.programs?.includes(assignedProgram))
                  .map(dt => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
              </optgroup>
            )}
            {/* All others */}
            <optgroup label="— Other document types —">
              {docTypesForProgram
                .filter(dt => !assignedProgram || !dt.programs?.includes(assignedProgram))
                .map(dt => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
            </optgroup>
          </select>

          {/* Show what this doc type will trigger */}
          {isPrimaryForProgram(selectedType) && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] leading-4 text-green-600">
              <Sparkles size={10} /> AI will analyze this document and update your program automatically
            </p>
          )}
        </div>

        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all sm:p-8 ${
            !isActive
              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-not-allowed opacity-60'
              : isDragActive
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-green-400 hover:bg-green-50/50 dark:hover:bg-green-900/10'
          }`}
        >
          <input {...getInputProps()} />
          <Upload size={24} className={`mx-auto mb-3 sm:h-7 sm:w-7 ${isDragActive ? 'text-green-600' : 'text-gray-300'}`} />
          {uploading ? (
            <div>
              <p className="text-[13px] font-medium leading-5 text-green-600 sm:text-sm">Uploading…</p>
              <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mt-3" />
            </div>
          ) : (
            <>
              <p className="text-[13px] font-semibold leading-5 text-gray-700 dark:text-gray-200 sm:text-sm">
                {isDragActive ? 'Drop file here' : 'Drag & drop or click to upload'}
              </p>
              <p className="mt-1.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500 sm:mt-1 sm:text-xs">PDF, PNG, JPG, DOCX — max 10MB</p>
              <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] leading-4 text-blue-400 sm:text-xs">
                <Sparkles size={11} />
                AI document review included — your profile updates automatically
              </p>
            </>
          )}
        </div>

        {!isActive && (
          <p className="mt-2 text-center text-[11px] leading-4 text-amber-600 sm:text-xs">
            Subscribe to upload documents — <a href="/billing" className="underline font-semibold">activate here</a>
          </p>
        )}
      </div>

      {/* Documents List */}
      <div>
        <h2 className="section-title mb-4">Your Documents ({documents.length})</h2>
        {documents.length === 0 ? (
          <div className="card text-center py-10">
            <FileText size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 dark:text-gray-500 text-sm">No documents uploaded yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
              {programHint
                ? `Start by uploading a ${docTypesForProgram[0]?.label ?? 'document'}`
                : 'Upload your first document above'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.document_id} className="card flex items-start gap-3">
                <div className="w-9 h-9 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{doc.file_name}</p>
                    {doc.program && (
                      <span className="text-[9px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                        {doc.program.replace('program_', 'Prog ')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-green-500 font-medium">{docTypeLabel(doc.document_type)}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1">
                      {statusIcon[doc.review_status]}
                      <StatusBadge status={doc.review_status} />
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatFileSize(doc.file_size)}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatDateTime(doc.uploaded_at)}</span>
                  </div>
                  {doc.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 bg-gray-50 dark:bg-gray-700 px-2.5 py-1.5 rounded-lg">{doc.notes}</p>
                  )}
                  <AIAnalysisCard doc={doc} isAnalyzing={analyzingId === doc.document_id} />
                </div>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-green-600 font-medium hover:text-green-700 px-2 py-1"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
