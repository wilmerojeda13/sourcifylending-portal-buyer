'use client'

import { useState, useEffect, useRef } from 'react'
import { PhoneCall, PhoneOff, Loader2, CheckCircle, XCircle, AlertCircle, FlaskConical } from 'lucide-react'

interface Template { id: string; name: string }

type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'completed' | 'failed'

const STATUS_LABELS: Record<CallStatus, string> = {
  idle:      'Ready',
  calling:   'Initiating call…',
  ringing:   'Ringing…',
  connected: 'Connected — live call in progress',
  completed: 'Call completed',
  failed:    'Call failed',
}

const STATUS_COLOR: Record<CallStatus, string> = {
  idle:      'text-gray-500',
  calling:   'text-amber-600',
  ringing:   'text-blue-600',
  connected: 'text-green-600',
  completed: 'text-gray-500',
  failed:    'text-red-600',
}

export default function TestCallWidget() {
  const [phone, setPhone]           = useState('')
  const [name, setName]             = useState('')
  const [templateId, setTemplateId] = useState('')
  const [templates, setTemplates]   = useState<Template[]>([])
  const [callStatus, setCallStatus] = useState<CallStatus>('idle')
  const [callId, setCallId]         = useState<string | null>(null)
  const [twilioSid, setTwilioSid]   = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [duration, setDuration]     = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const pollRef  = useRef<NodeJS.Timeout | null>(null)

  // Load templates on mount
  useEffect(() => {
    fetch('/api/voice/templates')
      .then(r => r.json())
      .then(d => {
        const tpls: Template[] = (d.templates ?? []).map((t: Record<string, string>) => ({ id: t.id, name: t.name }))
        setTemplates(tpls)
        if (tpls.length) setTemplateId(tpls[0].id)
      })
      .catch(() => {})
  }, [])

  // Duration timer while connected
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [callStatus])

  // Poll call status while in-flight
  const startPolling = (id: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/voice/calls/${id}`)
        const data = await res.json()
        const s    = data.call?.status as string | undefined
        if (s === 'in-progress') setCallStatus('connected')
        else if (s === 'ringing') setCallStatus('ringing')
        else if (s === 'completed' || s === 'busy' || s === 'no-answer' || s === 'canceled') {
          setCallStatus('completed')
          stopPolling()
        } else if (s === 'failed') {
          setCallStatus('failed')
          stopPolling()
        }
      } catch {}
    }, 2000)
  }

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  async function startCall() {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length < 10) { setError('Enter a valid 10-digit phone number'); return }

    setError(null)
    setCallStatus('calling')
    setCallId(null)
    setTwilioSid(null)
    setDuration(0)

    try {
      const res  = await fetch('/api/voice/test-call', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone, contact_name: name, template_id: templateId || undefined }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to start call')

      setCallId(data.call_id)
      setTwilioSid(data.twilio_sid)
      setCallStatus('ringing')
      startPolling(data.call_id)
    } catch (e: unknown) {
      setCallStatus('failed')
      setError(e instanceof Error ? e.message : 'Call failed')
    }
  }

  const reset = () => {
    stopPolling()
    setCallStatus('idle')
    setCallId(null)
    setTwilioSid(null)
    setError(null)
    setDuration(0)
  }

  const isActive   = ['calling', 'ringing', 'connected'].includes(callStatus)
  const isFinished = ['completed', 'failed'].includes(callStatus)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
          <FlaskConical size={16} className="text-violet-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-sm">Test Call</h2>
          <p className="text-xs text-gray-400">Call any number instantly — no CSV needed</p>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number *</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(555) 867-5309"
              disabled={isActive}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Abel Test"
              disabled={isActive}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:bg-gray-50"
            />
          </div>
        </div>

        {templates.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Script / Template</label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              disabled={isActive}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:bg-gray-50"
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-sm">
            <AlertCircle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Status bar */}
        {callStatus !== 'idle' && (
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium
            ${callStatus === 'connected' ? 'bg-green-50 border-green-200' :
              callStatus === 'failed'    ? 'bg-red-50 border-red-200'     :
              callStatus === 'completed' ? 'bg-gray-50 border-gray-200'   :
                                          'bg-blue-50 border-blue-200'}`}>
            {callStatus === 'calling' && <Loader2 size={16} className="animate-spin text-amber-500" />}
            {callStatus === 'ringing' && <Loader2 size={16} className="animate-spin text-blue-500" />}
            {callStatus === 'connected' && (
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            )}
            {callStatus === 'completed' && <CheckCircle size={16} className="text-gray-400" />}
            {callStatus === 'failed'    && <XCircle    size={16} className="text-red-500" />}
            <span className={STATUS_COLOR[callStatus]}>{STATUS_LABELS[callStatus]}</span>
            {callStatus === 'connected' && (
              <span className="ml-auto text-xs font-mono text-green-600">{fmtDuration(duration)}</span>
            )}
            {twilioSid && (
              <span className="ml-auto text-[10px] font-mono text-gray-400 hidden sm:block truncate max-w-[160px]">
                {twilioSid}
              </span>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          {!isFinished && (
            <button
              onClick={startCall}
              disabled={isActive || !phone.trim()}
              className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              {isActive
                ? <><Loader2 size={15} className="animate-spin" /> Calling…</>
                : <><PhoneCall size={15} /> Start Test Call</>}
            </button>
          )}

          {isFinished && (
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              <PhoneOff size={15} /> New Test Call
            </button>
          )}

          {callId && (
            <a
              href={`/admin/voice/logs?callId=${callId}`}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors font-medium"
            >
              View Log
            </a>
          )}
        </div>

        <p className="text-[11px] text-gray-400">
          Test calls create a temporary lead record marked <code className="bg-gray-100 px-1 rounded">status: test</code> — visible in call logs.
        </p>
      </div>
    </div>
  )
}
