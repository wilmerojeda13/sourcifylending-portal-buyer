'use client'

import NextImage from 'next/image'
import { useState, useRef } from 'react'
import { MessageSquare, Send, Clock, CheckCircle2, XCircle, Paperclip, Image as AttachmentIcon, FileText as FileIcon } from 'lucide-react'
import { useLanguage } from '@/components/i18n/LanguageProvider'

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

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

function AttachmentPreview({ url, locale }: { url: string; locale: 'en' | 'es' }) {
  const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)
  return isImage ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2">
      <NextImage
        src={url}
        alt={locale === 'es' ? 'Vista previa del archivo adjunto' : 'Attachment preview'}
        width={768}
        height={512}
        unoptimized
        className="max-h-48 w-auto rounded-xl border border-gray-200 object-contain dark:border-gray-600"
      />
    </a>
  ) : (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 mt-2 text-xs text-green-700 font-semibold bg-green-50 border border-green-100 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
    >
      <FileIcon size={13} /> {locale === 'es' ? 'Ver adjunto' : 'View Attachment'}
    </a>
  )
}

export default function SupportInboxClient({ initialMessages, userEmail }: Props) {
  const { locale } = useLanguage()
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

  const ALLOWED_LABEL = locale === 'es' ? 'JPG, PNG, GIF, WebP o PDF — máximo 5 MB' : 'JPG, PNG, GIF, WebP, or PDF — max 5 MB'

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const f = e.target.files?.[0] ?? null
    if (!f) { setFile(null); return }
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError(locale === 'es' ? 'Tipo de archivo no válido. Permitido: JPG, PNG, GIF, WebP o PDF.' : 'Invalid file type. Allowed: JPG, PNG, GIF, WebP, or PDF.')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setFileError(locale === 'es' ? 'Archivo demasiado grande. El tamaño máximo es 5 MB.' : 'File too large. Maximum size is 5 MB.')
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
    if (!subject.trim()) { setError(locale === 'es' ? 'Por favor ingresa un asunto.' : 'Please enter a subject.'); return }
    if (!message.trim()) { setError(locale === 'es' ? 'Por favor ingresa un mensaje.' : 'Please enter a message.'); return }

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
      if (!res.ok) { setError(data.error || (locale === 'es' ? 'No se pudo enviar el mensaje.' : 'Failed to send message.')); return }

      setMessages(prev => [data.message, ...prev])
      setSubject('')
      setMessage('')
      removeFile()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 5000)
    } catch {
      setError(locale === 'es' ? 'Algo salió mal. Inténtalo de nuevo.' : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{locale === 'es' ? 'Bandeja de soporte' : 'Support Inbox'}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {locale === 'es'
            ? 'Envíanos un mensaje si necesitas ayuda con tu programa, próximos pasos, preguntas sobre documentos o acceso al portal.'
            : 'Send us a message if you need help with your program, next steps, document questions, or portal access.'}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-green-600" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{locale === 'es' ? 'Nuevo mensaje' : 'New Message'}</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">{locale === 'es' ? 'Asunto' : 'Subject'}</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={locale === 'es' ? 'Ej. Pregunta sobre mis próximos pasos' : 'e.g. Question about my next steps'}
              maxLength={200}
              className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">{locale === 'es' ? 'Mensaje' : 'Message'}</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={locale === 'es' ? 'Describe tu pregunta o problema con detalle...' : 'Describe your question or issue in detail...'}
              rows={5}
              className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none transition-all"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              {locale === 'es' ? 'Adjunto' : 'Attachment'} <span className="normal-case font-normal text-gray-400 dark:text-gray-500">{locale === 'es' ? '(opcional — captura o documento)' : '(optional — screenshot or document)'}</span>
            </label>

            {file ? (
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5">
                <AttachmentIcon size={15} className="text-green-600 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-200 truncate flex-1">{file.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={removeFile} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                  <XCircle size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-green-400 dark:hover:border-green-600 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                disabled={loading}
              >
                <Paperclip size={15} />
                {locale === 'es' ? 'Adjunta una captura o archivo' : 'Attach a screenshot or file'}
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
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{ALLOWED_LABEL}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-xl px-4 py-3">
              <XCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2.5 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl px-4 py-3">
              <CheckCircle2 size={15} className="text-green-600 mt-0.5 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-400">{locale === 'es' ? 'Mensaje enviado correctamente.' : 'Message sent successfully.'}</p>
            </div>
          )}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {locale === 'es' ? 'Enviando…' : 'Sending…'}
                </>
              ) : (
                <>
                  <Send size={15} />
                  {locale === 'es' ? 'Enviar' : 'Send'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{locale === 'es' ? 'Mensajes anteriores' : 'Previous Messages'}</h2>
        {(messages ?? []).length === 0 ? (
          <div className="card text-center py-10">
            <Clock className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">{locale === 'es' ? 'Todavía no has enviado mensajes.' : 'You have not sent any messages yet.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{m.subject}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(m.created_at).toLocaleString(locale === 'es' ? 'es-ES' : 'en-US')}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {m.status === 'open' ? (locale === 'es' ? 'Abierto' : 'Open') : m.status === 'replied' ? (locale === 'es' ? 'Respondido' : 'Replied') : (locale === 'es' ? 'Cerrado' : 'Closed')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  className="mt-3 text-xs text-green-700 font-semibold"
                >
                  {expandedId === m.id ? (locale === 'es' ? 'Ocultar' : 'Hide') : (locale === 'es' ? 'Ver detalles' : 'View details')}
                </button>
                {expandedId === m.id && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-gray-600 dark:text-gray-300">{m.message}</p>
                    {m.attachment_url && <AttachmentPreview url={m.attachment_url} locale={locale} />}
                    {m.admin_reply && (
                      <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-3">
                        <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">{locale === 'es' ? 'Respuesta del administrador' : 'Admin Reply'}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-200">{m.admin_reply}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
