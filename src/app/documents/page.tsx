'use client'
import { useState, useEffect, useCallback } from 'react'
import PortalLayout from '@/components/layout/PortalLayout'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel, formatDateTime } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { Upload, FileText, CheckCircle, Clock, XCircle, Bot, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'
import type { Document, DocumentType, UserProfile } from '@/types'
import toast from 'react-hot-toast'
import { useDropzone } from 'react-dropzone'

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'personal_credit_report', label: 'Personal Credit Report' },
  { value: 'business_formation', label: 'Business Formation Docs' },
  { value: 'ein_letter', label: 'EIN Letter' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'vendor_confirmation', label: 'Vendor Confirmation' },
  { value: 'articles_of_organization', label: 'Articles of Organization / Incorporation' },
  { value: 'driver_license', label: 'Driver License / Government ID' },
  { value: 'utility_bill', label: 'Utility Bill / Address Proof' },
  { value: 'voided_check', label: 'Voided Check' },
  { value: 'business_license', label: 'Business License / Permit' },
  { value: 'duns_confirmation', label: 'D-U-N-S Confirmation' },
  { value: 'other', label: 'Other Supporting Document' },
]

function AIAnalysisCard({ doc, isAnalyzing }: { doc: Document; isAnalyzing: boolean }) {
  const status = doc.ai_analysis_status

  if (isAnalyzing || status === 'analyzing') {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
        AI is reviewing this document…
      </div>
    )
  }

  if (status === 'skipped') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        <Bot size={12} />
        AI review not available (insufficient credits)
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
        <AlertCircle size={12} />
        AI analysis could not be completed
      </div>
    )
  }

  if (status !== 'completed' || !doc.ai_analysis) return null

  const a = doc.ai_analysis
  const isApproved = a.recommendation === 'approved'
  const isRejected = a.recommendation === 'rejected'

  return (
    <div className={`mt-2 rounded-xl border text-xs overflow-hidden ${
      isApproved ? 'border-green-200 bg-green-50' :
      isRejected ? 'border-red-200 bg-red-50' :
      'border-amber-200 bg-amber-50'
    }`}>
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

      <div className="px-3 py-2 space-y-1.5">
        <p className={isApproved ? 'text-green-700' : isRejected ? 'text-red-600' : 'text-amber-700'}>
          {a.validation_summary}
        </p>

        {a.rejection_reason && (
          <p className="text-red-600 font-medium">⚠ {a.rejection_reason}</p>
        )}

        {Object.keys(a.extracted_fields ?? {}).length > 0 && (
          <div className="pt-1 border-t border-opacity-50 space-y-0.5" style={{ borderColor: isApproved ? '#bbf7d0' : '#fde68a' }}>
            {Object.entries(a.extracted_fields).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-gray-400 capitalize shrink-0">{k.replace(/_/g, ' ')}:</span>
                <span className="font-semibold text-gray-700">{v}</span>
              </div>
            ))}
          </div>
        )}

        {a.tasks_to_complete?.length > 0 && (
          <div className="flex items-center gap-1.5 text-green-700 pt-0.5">
            <CheckCircle2 size={11} />
            <span className="font-semibold">Auto-completed: {a.tasks_to_complete.map(t => t.replace(/_/g, ' ')).join(', ')}</span>
          </div>
        )}

        {a.next_step_guidance && (
          <p className="text-gray-500 pt-0.5 italic">{a.next_step_guidance}</p>
        )}
      </div>
    </div>
  )
}

export default function DocumentsPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedType, setSelectedType] = useState<DocumentType>('other')
  const [userId, setUserId] = useState<string>('')
  const [isActive, setIsActive] = useState(false)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const [{ data: p }, { data: docs }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('documents').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false }),
      ])
      setProfile(p)
      setDocuments(docs || [])
      setIsActive(p?.subscription_status === 'active' || p?.subscription_status === 'trialing')
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFile = async (file: File) => {
    if (!isActive) { toast.error('Reactivate subscription to upload documents'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('File must be under 10MB'); return }

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${userId}/${selectedType}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: false })

    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)

    const { data: inserted, error: dbError } = await supabase.from('documents').insert({
      user_id: userId,
      document_type: selectedType,
      file_url: publicUrl,
      file_name: file.name,
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
      review_status: 'pending',
    }).select('document_id').single()

    if (dbError) { toast.error('Failed to save document record'); setUploading(false); return }

    const { data: refreshed } = await supabase.from('documents').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false })
    setDocuments(refreshed || [])
    setUploading(false)

    // Trigger AI analysis (fire and update in background)
    const docId = inserted?.document_id
    if (docId) {
      setAnalyzingId(docId)
      toast.success('Document uploaded! AI is analyzing it now...')
      try {
        const analysisRes = await fetch('/api/documents/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: docId }),
        })
        const analysisData = await analysisRes.json()
        if (analysisData.tasks_completed?.length > 0) {
          toast.success(`✓ ${analysisData.tasks_completed.length} task(s) automatically completed!`, { duration: 5000 })
        } else if (analysisData.skipped) {
          // silent
        }
      } catch {
        // silent — analysis is non-blocking
      } finally {
        setAnalyzingId(null)
        // Refresh documents to get analysis result
        const { data: refreshed2 } = await supabase.from('documents').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false })
        setDocuments(refreshed2 || [])
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
    pending: <Clock size={16} className="text-yellow-500" />,
    reviewed: <CheckCircle size={16} className="text-blue-500" />,
    approved: <CheckCircle size={16} className="text-green-500" />,
    rejected: <XCircle size={16} className="text-red-500" />,
  }

  const docTypeLabel = (type: string) => DOC_TYPES.find((d) => d.value === type)?.label || type

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (loading) {
    return (
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-40 bg-gray-200 rounded-2xl" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </PortalLayout>
    )
  }

  const pendingCount = documents.filter((d) => d.review_status === 'pending').length
  const approvedCount = documents.filter((d) => d.review_status === 'approved').length
  const aiAnalyzedCount = documents.filter((d) => d.ai_analysis_status === 'completed').length

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
    >
      <div className="mb-6">
        <h1 className="page-title">Documents</h1>
        <p className="text-gray-500 text-sm mt-1">Upload and manage your fulfillment documents</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', value: documents.length, color: 'text-gray-900' },
          { label: 'Pending Review', value: pendingCount, color: 'text-yellow-600' },
          { label: 'AI Analyzed', value: aiAnalyzedCount, color: 'text-blue-600' },
          { label: 'Approved', value: approvedCount, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Upload Area */}
      <div className="card mb-6">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Upload size={18} className="text-green-500" />
          Upload Document
        </h2>

        <div className="mb-4">
          <label className="label">Document Type</label>
          <select
            className="input-field"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as DocumentType)}
            disabled={!isActive}
          >
            {DOC_TYPES.map((dt) => (
              <option key={dt.value} value={dt.value}>{dt.label}</option>
            ))}
          </select>
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            !isActive
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
              : isDragActive
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-green-400 hover:bg-green-50/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload size={28} className={`mx-auto mb-3 ${isDragActive ? 'text-green-600' : 'text-gray-300'}`} />
          {uploading ? (
            <div>
              <p className="text-sm font-medium text-green-600">Uploading…</p>
              <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mt-3" />
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700">
                {isDragActive ? 'Drop file here' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-xs text-gray-400 mt-1">PDF, PNG, JPG, DOCX — max 10MB</p>
              <p className="text-xs text-blue-400 mt-1 flex items-center justify-center gap-1">
                <Sparkles size={11} />
                AI document review included
              </p>
            </>
          )}
        </div>
        {!isActive && (
          <p className="text-xs text-amber-600 mt-2 text-center">
            Subscribe to upload documents — <a href="/billing" className="underline font-semibold">activate here</a>
          </p>
        )}
      </div>

      {/* Documents List */}
      <div>
        <h2 className="section-title mb-4">Your Documents ({documents.length})</h2>
        {documents.length === 0 ? (
          <div className="card text-center py-10">
            <FileText size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No documents uploaded yet</p>
            <p className="text-xs text-gray-300 mt-1">Upload your first document above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.document_id} className="card flex items-start gap-3">
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{doc.file_name}</p>
                  <p className="text-xs text-green-500 font-medium">{docTypeLabel(doc.document_type)}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1">
                      {statusIcon[doc.review_status]}
                      <StatusBadge status={doc.review_status} />
                    </div>
                    <span className="text-xs text-gray-400">{formatFileSize(doc.file_size)}</span>
                    <span className="text-xs text-gray-400">{formatDateTime(doc.uploaded_at)}</span>
                  </div>
                  {doc.notes && (
                    <p className="text-xs text-gray-500 mt-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg">{doc.notes}</p>
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
