'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Phone, Loader2, CheckCircle2, X, PhoneOff, Clock, User, Voicemail, AlertCircle, PhoneCall } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LeadSummary {
  id: string
  first_name: string
  last_name: string
  phone: string
  business_name?: string | null
}

interface LiveCallFeedProps {
  attempts: Array<{
    id: string
    lead_id: string
    crm_call_id?: string | null
    attempt_status: string
    queue_slot: number
    is_winner: boolean
    resolved_at?: string | null
    last_twilio_status?: string | null
    answered_by?: string | null
    amd_status?: string | null
    crm_call?: {
      id?: string | null
      lead?: LeadSummary
      call_started_at?: string | null
      twilio_status?: string | null
      duration_seconds?: number | null
    }
  }>
  targetParallelLines: number
  activeCallId: string | null
  leads?: LeadSummary[]
  onHangUp?: (callId: string) => Promise<unknown>
}

interface FeedEvent {
  id: string
  timestamp: string
  type: 'dialing' | 'ringing' | 'connected' | 'voicemail' | 'no_answer' | 'busy' | 'canceled' | 'disposition' | 'winner'
  message: string
  leadName?: string
  lineNumber?: number
  isWinner?: boolean
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string; animate?: boolean }> = {
  idle: { icon: PhoneOff, color: 'text-gray-500', label: 'Idle' },
  queued: { icon: Clock, color: 'text-blue-500', label: 'Queued', animate: true },
  dialing: { icon: Phone, color: 'text-yellow-500', label: 'Dialing', animate: true },
  ringing: { icon: Phone, color: 'text-yellow-500', label: 'Ringing', animate: true },
  answered_human: { icon: User, color: 'text-green-500', label: 'Human Detected' },
  answered_machine: { icon: Voicemail, color: 'text-orange-500', label: 'Voicemail' },
  bridged: { icon: CheckCircle2, color: 'text-green-500', label: 'Connected' },
  no_answer: { icon: X, color: 'text-gray-500', label: 'No Answer' },
  busy: { icon: X, color: 'text-red-500', label: 'Busy' },
  failed: { icon: AlertCircle, color: 'text-red-500', label: 'Failed' },
  canceled: { icon: PhoneOff, color: 'text-gray-500', label: 'Canceled' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
}

const ACTIVE_STATUSES = new Set(['queued', 'dialing', 'ringing', 'answered_human', 'answered_machine', 'bridged'])

function getAttemptStatus(status: string, amdStatus?: string | null, twilioStatus?: string | null): keyof typeof statusConfig {
  if (status === 'answered_human' || (amdStatus === 'human' && status === 'answered')) return 'answered_human'
  if (status === 'answered_machine' || (amdStatus === 'machine' && status === 'answered')) return 'answered_machine'
  if (status === 'bridged') return 'bridged'
  if (status === 'no-answer') return 'no_answer'
  if (status === 'busy') return 'busy'
  if (status === 'failed') return 'failed'
  if (status === 'canceled') return 'canceled'
  if (status === 'completed') return 'completed'
  if (status === 'dialing') return 'dialing'
  if (status === 'ringing' || twilioStatus === 'ringing') return 'ringing'
  if (status === 'queued') return 'queued'
  return 'idle'
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatElapsedTime(startTime: string | null | undefined): string {
  if (!startTime) return '0:00'
  const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  return formatDuration(elapsed)
}

function playAnswerTone() {
  try {
    const ctx = new AudioContext()
    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }
    const now = ctx.currentTime
    playNote(880, now, 0.15)        // A5
    playNote(1100, now + 0.15, 0.2) // C#6 — ascending ding-ding
  } catch {
    // AudioContext not available — ignore
  }
}

export default function LiveCallFeed({ attempts, targetParallelLines, activeCallId, leads = [], onHangUp }: LiveCallFeedProps) {
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([])
  const [lineStatuses, setLineStatuses] = useState<Map<number, any>>(new Map())
  const [hangingUp, setHangingUp] = useState<Set<string>>(new Set())
  const humanDetectedRef = useRef<Set<string>>(new Set())

  // Track attempt changes, generate feed events, play tone on human answer
  useEffect(() => {
    const newEvents: FeedEvent[] = []
    const newLineStatuses = new Map<number, any>()

    // attempts arrive newest-first; first occurrence per slot wins so the
    // most-recent (active) attempt is always shown, never overwritten by
    // old completed attempts from earlier in the same session.
    attempts.forEach((attempt) => {
      const slot = attempt.queue_slot
      if (newLineStatuses.has(slot)) return          // newest already set
      if (attempt.resolved_at && !ACTIVE_STATUSES.has(
        getAttemptStatus(attempt.attempt_status, attempt.amd_status, attempt.last_twilio_status)
      )) return   // skip old resolved attempts — show idle instead

      const lead = attempt.crm_call?.lead ?? leads.find((l) => l.id === attempt.lead_id)
      const status = getAttemptStatus(attempt.attempt_status, attempt.amd_status, attempt.last_twilio_status)
      const config = statusConfig[status]

      newLineStatuses.set(slot, {
        attempt,
        lead,
        status,
        config,
        startTime: attempt.crm_call?.call_started_at,
        elapsedTime: formatElapsedTime(attempt.crm_call?.call_started_at),
        duration: attempt.crm_call?.duration_seconds,
      })

      // Play ding and generate winner event first time human detected
      if (status === 'answered_human' && !humanDetectedRef.current.has(attempt.id)) {
        humanDetectedRef.current.add(attempt.id)
        playAnswerTone()
        newEvents.push({
          id: `${attempt.id}-winner`,
          timestamp: new Date().toISOString(),
          type: 'winner',
          message: `Line ${slot} — human answered: ${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`.trim(),
          leadName: `${lead?.first_name} ${lead?.last_name}`,
          lineNumber: slot,
          isWinner: true,
        })
      }

      if (status === 'dialing' && attempt.crm_call?.call_started_at) {
        newEvents.push({
          id: `${attempt.id}-dialing`,
          timestamp: attempt.crm_call.call_started_at,
          type: 'dialing',
          message: `Line ${slot} dialing ${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`,
          leadName: `${lead?.first_name} ${lead?.last_name}`,
          lineNumber: slot,
        })
      }

      if (status === 'answered_machine') {
        newEvents.push({
          id: `${attempt.id}-voicemail`,
          timestamp: new Date().toISOString(),
          type: 'voicemail',
          message: `Line ${slot} — voicemail: ${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`,
          leadName: `${lead?.first_name} ${lead?.last_name}`,
          lineNumber: slot,
        })
      }

      if (status === 'no_answer') {
        newEvents.push({
          id: `${attempt.id}-no-answer`,
          timestamp: new Date().toISOString(),
          type: 'no_answer',
          message: `Line ${slot} — no answer: ${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`,
          lineNumber: slot,
        })
      }

      if (status === 'busy') {
        newEvents.push({
          id: `${attempt.id}-busy`,
          timestamp: new Date().toISOString(),
          type: 'busy',
          message: `Line ${slot} — busy: ${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`,
          lineNumber: slot,
        })
      }
    })

    setLineStatuses(newLineStatuses)
    if (newEvents.length > 0) {
      setFeedEvents(prev => [...newEvents, ...prev].slice(0, 50))
    }
  }, [attempts, leads])

  // Update elapsed times every second
  useEffect(() => {
    const timer = setInterval(() => {
      setLineStatuses(prev => {
        const updated = new Map(prev)
        updated.forEach((status) => {
          if (status.startTime) {
            status.elapsedTime = formatElapsedTime(status.startTime)
          }
        })
        return updated
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  async function handleHangUp(attempt: LiveCallFeedProps['attempts'][0]) {
    const callId = attempt.crm_call_id ?? attempt.crm_call?.id
    if (!callId || !onHangUp) return
    setHangingUp(prev => new Set(prev).add(attempt.id))
    try {
      await onHangUp(callId)
    } finally {
      setHangingUp(prev => { const s = new Set(prev); s.delete(attempt.id); return s })
    }
  }

  return (
    <div className="space-y-4">
      {/* Live Line Status Panel */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Live Line Status ({targetParallelLines} Lines)
        </h3>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(targetParallelLines, 3)}, 1fr)` }}>
          {Array.from({ length: targetParallelLines }, (_, index) => {
            const lineNumber = index + 1
            const lineStatus = lineStatuses.get(lineNumber)
            const status = lineStatus?.status || 'idle'
            const config = statusConfig[status as keyof typeof statusConfig]
            const Icon = config.icon
            const isActive = ACTIVE_STATUSES.has(status)
            const attempt = lineStatus?.attempt
            const isHangingUp = attempt && hangingUp.has(attempt.id)

            return (
              <div
                key={lineNumber}
                className={cn(
                  "rounded-lg border p-3 transition-all duration-200",
                  attempt?.is_winner
                    ? "border-green-500 bg-green-500/10 shadow-lg shadow-green-500/20"
                    : "border-gray-700 bg-gray-800/50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400">Line {lineNumber}</span>
                  {attempt?.is_winner && (
                    <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full">LIVE</span>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn("w-4 h-4", config.color, config.animate && "animate-pulse")} />
                  <span className={cn("text-xs font-medium", config.color)}>
                    {config.label}
                  </span>
                </div>

                {lineStatus?.lead && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-300 truncate">
                      {lineStatus.lead.first_name} {lineStatus.lead.last_name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {lineStatus.lead.phone}
                    </div>
                    {lineStatus.lead.business_name && (
                      <div className="text-xs text-gray-600 truncate">
                        {lineStatus.lead.business_name}
                      </div>
                    )}
                  </div>
                )}

                {(lineStatus?.elapsedTime || lineStatus?.duration) && (
                  <div className="mt-2 text-xs text-gray-400">
                    {lineStatus.duration ? `Duration: ${formatDuration(lineStatus.duration)}` : `Elapsed: ${lineStatus.elapsedTime}`}
                  </div>
                )}

                {/* Hang Up button — visible on any active line */}
                {isActive && onHangUp && attempt && (
                  <button
                    onClick={() => handleHangUp(attempt)}
                    disabled={isHangingUp}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600/40 hover:text-red-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isHangingUp
                      ? <Loader2 size={10} className="animate-spin" />
                      : <PhoneCall size={10} className="rotate-135" />
                    }
                    {isHangingUp ? 'Hanging up…' : 'Hang Up'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Activity Feed</h3>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {feedEvents.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">
              No activity yet. Start dialing to see live updates.
            </div>
          ) : (
            feedEvents.map((event) => (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-lg text-xs",
                  event.isWinner && "bg-green-500/10 border border-green-500/30"
                )}
              >
                <div className="flex-shrink-0 w-1.5 h-1.5 bg-gray-500 rounded-full mt-1.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    {event.lineNumber && (
                      <span className="text-gray-600">Line {event.lineNumber}</span>
                    )}
                  </div>
                  <div className={cn(
                    "text-gray-300 break-words",
                    event.isWinner && "text-green-400 font-medium"
                  )}>
                    {event.message}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
