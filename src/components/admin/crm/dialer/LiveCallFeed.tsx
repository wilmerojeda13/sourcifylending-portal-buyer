'use client'

import { useState, useEffect } from 'react'
import { Phone, Loader2, CheckCircle2, X, PhoneOff, Clock, User, Voicemail, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LiveCallFeedProps {
  attempts: Array<{
    id: string
    lead_id: string
    attempt_status: string
    queue_slot: number
    is_winner: boolean
    resolved_at?: string | null
    last_twilio_status?: string | null
    answered_by?: string | null
    amd_status?: string | null
    crm_call?: {
      lead?: {
        first_name: string
        last_name: string
        phone: string
        business_name?: string | null
      }
      call_started_at?: string | null
      twilio_status?: string | null
      duration_seconds?: number | null
    }
  }>
  targetParallelLines: number
  activeCallId: string | null
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

const statusConfig = {
  idle: { icon: PhoneOff, color: 'text-gray-500', label: 'Idle' },
  queued: { icon: Clock, color: 'text-blue-500', label: 'Queued' },
  dialing: { icon: Phone, color: 'text-yellow-500', label: 'Dialing' },
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

function getAttemptStatus(status: string, amdStatus?: string | null, twilioStatus?: string | null): keyof typeof statusConfig {
  // Map various status combinations to our unified status
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

export default function LiveCallFeed({ attempts, targetParallelLines, activeCallId }: LiveCallFeedProps) {
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([])
  const [lineStatuses, setLineStatuses] = useState<Map<number, any>>(new Map())

  // Track attempt changes and generate feed events
  useEffect(() => {
    const newEvents: FeedEvent[] = []
    const newLineStatuses = new Map<number, any>()

    // Process each attempt
    attempts.forEach((attempt) => {
      const slot = attempt.queue_slot
      const lead = attempt.crm_call?.lead
      const status = getAttemptStatus(attempt.attempt_status, attempt.amd_status, attempt.last_twilio_status)
      const config = statusConfig[status]

      // Update line status
      newLineStatuses.set(slot, {
        attempt,
        lead,
        status,
        config,
        startTime: attempt.crm_call?.call_started_at,
        elapsedTime: formatElapsedTime(attempt.crm_call?.call_started_at),
        duration: attempt.crm_call?.duration_seconds,
      })

      // Generate events for status changes (simplified - in production, track previous state)
      if (status === 'dialing' && attempt.crm_call?.call_started_at) {
        newEvents.push({
          id: `${attempt.id}-dialing`,
          timestamp: attempt.crm_call.call_started_at,
          type: 'dialing',
          message: `Line ${slot} started dialing ${lead?.first_name} ${lead?.last_name}`,
          leadName: `${lead?.first_name} ${lead?.last_name}`,
          lineNumber: slot,
        })
      }

      if (status === 'answered_human' && attempt.is_winner) {
        newEvents.push({
          id: `${attempt.id}-winner`,
          timestamp: new Date().toISOString(),
          type: 'winner',
          message: `🎉 WINNER! Line ${slot} connected with ${lead?.first_name} ${lead?.last_name}`,
          leadName: `${lead?.first_name} ${lead?.last_name}`,
          lineNumber: slot,
          isWinner: true,
        })

        // Cancel other active attempts
        attempts.forEach((otherAttempt) => {
          if (otherAttempt.id !== attempt.id && otherAttempt.attempt_status === 'dialing') {
            newEvents.push({
              id: `${otherAttempt.id}-canceled`,
              timestamp: new Date().toISOString(),
              type: 'canceled',
              message: `Line ${otherAttempt.queue_slot} canceled (winner found)`,
              lineNumber: otherAttempt.queue_slot,
            })
          }
        })
      }

      if (status === 'answered_machine') {
        newEvents.push({
          id: `${attempt.id}-voicemail`,
          timestamp: new Date().toISOString(),
          type: 'voicemail',
          message: `Line ${slot} detected voicemail for ${lead?.first_name} ${lead?.last_name}`,
          leadName: `${lead?.first_name} ${lead?.last_name}`,
          lineNumber: slot,
        })
      }

      if (status === 'no_answer') {
        newEvents.push({
          id: `${attempt.id}-no-answer`,
          timestamp: new Date().toISOString(),
          type: 'no_answer',
          message: `Line ${slot} no answer for ${lead?.first_name} ${lead?.last_name}`,
          leadName: `${lead?.first_name} ${lead?.last_name}`,
          lineNumber: slot,
        })
      }

      if (status === 'busy') {
        newEvents.push({
          id: `${attempt.id}-busy`,
          timestamp: new Date().toISOString(),
          type: 'busy',
          message: `Line ${slot} busy for ${lead?.first_name} ${lead?.last_name}`,
          leadName: `${lead?.first_name} ${lead?.last_name}`,
          lineNumber: slot,
        })
      }
    })

    // Update state
    setLineStatuses(newLineStatuses)
    if (newEvents.length > 0) {
      setFeedEvents(prev => [...newEvents, ...prev].slice(0, 50)) // Keep last 50 events
    }
  }, [attempts])

  // Update elapsed times every second
  useEffect(() => {
    const timer = setInterval(() => {
      setLineStatuses(prev => {
        const updated = new Map(prev)
        updated.forEach((status, slot) => {
          if (status.startTime) {
            status.elapsedTime = formatElapsedTime(status.startTime)
          }
        })
        return updated
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

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

            return (
              <div
                key={lineNumber}
                className={cn(
                  "rounded-lg border p-3 transition-all duration-200",
                  lineStatus?.attempt?.is_winner 
                    ? "border-green-500 bg-green-500/10 shadow-lg shadow-green-500/20" 
                    : "border-gray-700 bg-gray-800/50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400">Line {lineNumber}</span>
                  {lineStatus?.attempt?.is_winner && (
                    <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full">WINNER</span>
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

                {lineStatus && (
                  <div className="mt-1 text-xs text-gray-500">
                    Last update: {new Date().toLocaleTimeString()}
                  </div>
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
