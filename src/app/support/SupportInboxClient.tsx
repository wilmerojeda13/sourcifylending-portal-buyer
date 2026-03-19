'use client'

import { useState, useRef } from 'react'
import { MessageSquare, Send, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, InboxIcon, Paperclip, Image, FileText as FileIcon } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface SupportMessage {
  id: string
  subject: string
  message: string
  status: 'open' | 'replied' | 'closed'
  admin_reply?: string | null
  attachment_url?: string | null
  created_at: string
  updated_at: string
}

interface Props {
  initialMessages: SupportMessage[]
  userEmail: string
}

const STATUS_CONFIG = {
  open:    { label: 'Open',    color: 'bg-blue-100 text-blue-700',   icon: Clock },
  replied: { label: 'Replied', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  closed:  { label: 'Closed',  color: 'bg-gray-100 text-gray-500',   icon: XCircle },
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
const ALLOWED_LABEL = 'JPG, PNG, GIF, WebP, or PDF — max 5 MB'

function AttachmentPreview({ url }: { url: string }) {
  const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)
  return isImage ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2">
      <img src={url} alt="Attachment" className="max-h-48 rounded-xl border border-gray-200 object-contain" />
    </a>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 mt-2 text-xs text-green-700 font-semibold bg-green-50 border border-green-100 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">
      <FileIcon size={13} /> View Attachment
    </a>
  )
}

export default function SupportInboxClient({ initialMessages, userEmail }: Props) {
  const [messages, setMessages] = useState<SupportMessage[]>(initialMessages)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const f = e.target.files?.[0] ?? null
    if (!f) { setFile(null); return }
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError(`Invalid file type. Allowed: ${ALLOWED_LABEL}`)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setFileError('File too large. Maximum size is 5 MB.')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setFile(f)
  }

  const removeFile = () => {
    setFile(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!subject.trim()) { setError('Please enter a subject.'); return }
    if (!message.trim()) { setError('Please enter a message.'); return }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('subject', subject.trim())
      formData.append('message', message.trim())
      if (file) formData.append('attachment', file)

      const res = await fetch('/api/support/messages', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to send message.'); return }

      setMessages(prev => [data.message, ...prev])
      setSubject('')
      setMessage('')
      removeFile()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 5000)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Inbox</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send us a message if you need help with your program, next steps, document questions, or portal access.
        </p>
      </div>

      {/* New Message Form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-green-600" />
            <h2 className="text-sm font-semibold text-gray-900">New Message</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Question about my next steps"
              maxLength={200}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe your question or issue in detail..."
              rows={5}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none transition-all"
              disabled={loading}
            />
          </div>

          {/* Attachment */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Attachment <span className="normal-case font-normal text-gray-400">(optional — screenshot or document)</span>
            </label>

            {file ? (
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                <Image size={15} className="text-green-600 shrink-0" />
                <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={removeFile} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                  <XCircle size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors"
                disabled={loading}
              >
                <Paperclip size={15} />
                Attach a screenshot or file
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
            />

            {fileError && (
              <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                <XCircle size={12} /> {fileError}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1.5">{ALLOWED_LABEL}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <XCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2.5 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <CheckCircle2 size={15} className="text-green-600 mt-0.5 shrink-0" />
              <p className="text-sm text-green-700 font-medium">Message sent! We&apos;ll get back to you as soon as possible.</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-400">Sending from: {userEmail}</p>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Sending…</>
              ) : (
                <><Send size={15} /> Send Message</>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Message History */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <InboxIcon size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Message History</h2>
          </div>
          {messages.length > 0 && (
            <span className="text-xs text-gray-400">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {messages.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <InboxIcon size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">Use the form above to send your first message.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {messages.map((msg) => {
              const cfg = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.open
              const StatusIcon = cfg.icon
              const isExpanded = expandedId === msg.id

              return (
                <div key={msg.id} className="px-6 py-4">
                  <button onClick={() => setExpandedId(isExpanded ? null : msg.id)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900 truncate">{msg.subject}</p>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                            <StatusIcon size={10} /> {cfg.label}
                          </span>
                          {msg.attachment_url && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                              <Paperclip size={10} /> attachment
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(msg.created_at)}</p>
                        {!isExpanded && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{msg.message}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-gray-400 mt-0.5">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-3">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Your Message</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        {msg.attachment_url && <AttachmentPreview url={msg.attachment_url} />}
                      </div>
                      {msg.admin_reply && (
                        <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">Response from SourcifyLending</p>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.admin_reply}</p>
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
