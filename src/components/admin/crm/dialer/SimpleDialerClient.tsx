'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  Phone, ChevronLeft, ChevronRight, Building2, Mail,
  ThumbsUp, ThumbsDown, Voicemail, PhoneMissed, CalendarPlus,
  Ban, Loader2, Users, CheckCircle2, Filter, X, Flame, Send, PhoneOff, Clock3,
  PhoneCall, Clock, Power, Volume2, VolumeX,
} from 'lucide-react'
import { checkDialerEligibility, applyDispositionEligibilityUpdates } from '@/lib/crm-dialer-eligibility'
import { normalizePhone } from '@/modules/voice-agent/utils/phone'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import CallAudioFeed from './CallAudioFeed'

// Types
type CallState = 'idle' | 'connecting' | 'dialing' | 'ringing' | 'connected' | 'ended' | 'disposition_pending'
type Stage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'demo_held' | 'follow_up' | 'closed_won' | 'closed_lost' | 'active_client'

interface CRMLead {
  id: string
  first_name: string
  last_name: string
  phone: string
  phone_e164?: string | null
  email: string | null
  business_name: string | null
  stage: Stage
  program_interest: string | null
  source: string
  notes: string | null
  follow_up_at: string | null
  callback_due_at?: string | null
  last_call_outcome?: string | null
  last_call_at?: string | null
  do_not_call?: boolean
  duplicate_phone_count?: number
  phone_invalid?: boolean
  lead_temperature?: 'cold' | 'warm' | 'hot'
  likely_timezone?: string | null
  timezone_confidence?: 'high' | 'medium' | 'low' | 'unknown'
  call_window_status?: 'callable_now' | 'blocked_by_timezone' | 'unknown_timezone'
  call_window_message?: string | null
  blocked_until_label?: string | null
  is_archived?: boolean
  // Add other fields as needed
}

interface DispositionOption {
  key: string
  label: string
  icon: React.ElementType
  color: string
  outcome: string
  newStage?: Stage
  temperature?: 'cold' | 'warm' | 'hot'
}

// DTMF frequencies for softphone keypad
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
}

// Disposition options
const DISPOSITION_OPTIONS: DispositionOption[] = [
  { key: 'interested', label: 'Interested', icon: ThumbsUp, color: 'bg-green-500 hover:bg-green-600 text-white', outcome: 'Interested', newStage: 'qualified' },
  { key: 'appointment_set', label: 'Appointment Set', icon: CalendarPlus, color: 'bg-purple-500 hover:bg-purple-600 text-white', outcome: 'Appointment Set', newStage: 'demo_scheduled' },
  { key: 'follow_up', label: 'Follow Up', icon: Clock3, color: 'bg-blue-500 hover:bg-blue-600 text-white', outcome: 'Follow Up', newStage: 'follow_up' },
  { key: 'call_back', label: 'Call Back', icon: Clock3, color: 'bg-cyan-500 hover:bg-cyan-600 text-white', outcome: 'Call Back', newStage: 'follow_up' },
  { key: 'voicemail', label: 'Voicemail', icon: Voicemail, color: 'bg-amber-500 hover:bg-amber-600 text-white', outcome: 'Voicemail', newStage: 'contacted' },
  { key: 'no_answer', label: 'No Answer', icon: PhoneMissed, color: 'bg-gray-400 hover:bg-gray-500 text-white', outcome: 'No Answer', newStage: 'contacted' },
  { key: 'busy', label: 'Busy', icon: PhoneOff, color: 'bg-gray-600 hover:bg-gray-700 text-white', outcome: 'Busy', newStage: 'contacted' },
  { key: 'bad_number', label: 'Bad Number', icon: X, color: 'bg-orange-700 hover:bg-orange-800 text-white', outcome: 'Bad Number', newStage: 'closed_lost' },
  { key: 'not_interested', label: 'Not Interested', icon: ThumbsDown, color: 'bg-red-400 hover:bg-red-500 text-white', outcome: 'Not Interested', newStage: 'closed_lost' },
  { key: 'dnc', label: 'DNC / Remove', icon: Ban, color: 'bg-red-700 hover:bg-red-800 text-white', outcome: 'Do Not Call' },
]

export default function SimpleDialerClient() {
  // Core state
  const [leads, setLeads] = useState<CRMLead[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [callState, setCallState] = useState<CallState>('idle')
  const [currentLead, setCurrentLead] = useState<CRMLead | null>(null)
  
  // Audio state
  const [audioDevice, setAudioDevice] = useState<MediaStream | null>(null)
  const [ringingAudio, setRingingAudio] = useState<HTMLAudioElement | null>(null)
  const [callAudio, setCallAudio] = useState<HTMLAudioElement | null>(null)
  
  // Disposition state
  const [note, setNote] = useState('')
  const [temperature, setTemperature] = useState<'cold' | 'warm' | 'hot'>('cold')
  const [nextFollowUpAt, setNextFollowUpAt] = useState('')
  const [dispositionSaving, setDispositionSaving] = useState(false)
  
  // Session state
  const [sessionActive, setSessionActive] = useState(false)
  const [callStartTime, setCallStartTime] = useState<string | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [callProviderStatus, setCallProviderStatus] = useState<string | null>(null)
  const [callProviderMessage, setCallProviderMessage] = useState<string | null>(null)
  
  // Refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  const supabaseRef = useRef<any>(null)

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Load leads with eligibility filtering
  const loadLeads = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = await createSupabaseBrowserClient()
      supabaseRef.current = supabase
      
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('do_not_call', false)
        .eq('is_archived', false)
        .order('follow_up_at', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      
      // Filter leads by dialer eligibility
      const eligibleLeads = (data || []).filter(lead => {
        const eligibility = checkDialerEligibility(lead)
        if (!eligibility.is_eligible) {
          console.log(`Lead ${lead.id} excluded: ${eligibility.exclusion_reason}`)
        }
        return eligibility.is_eligible
      })
      
      setLeads(eligibleLeads)
      if (eligibleLeads.length > 0) {
        setCurrentLead(eligibleLeads[0])
        setIndex(0)
      }
      
      // Show notification if any leads were excluded
      const excludedCount = (data || []).length - eligibleLeads.length
      if (excludedCount > 0) {
        toast(`${excludedCount} leads excluded due to terminal outcomes or scheduling`, {
          icon: '⚠️',
          duration: 4000,
        })
      }
      
    } catch (error) {
      console.error('Failed to load leads:', error)
      toast.error('Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initialize browser audio
  const initializeAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      })
      setAudioDevice(stream)
      setSessionActive(true)
      toast.success('Browser audio connected')
    } catch (error) {
      console.error('Failed to initialize audio:', error)
      toast.error('Failed to connect browser audio')
    }
  }

  // Play ringing tone
  const playRingingTone = useCallback(() => {
    if (!audioContextRef.current) return

    // Create oscillators for ringback tone (440Hz + 480Hz)
    const ctx = audioContextRef.current
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gainNode = ctx.createGain()
    
    osc1.frequency.setValueAtTime(440, ctx.currentTime)
    osc2.frequency.setValueAtTime(480, ctx.currentTime)
    
    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime)
    
    // Create on/off pattern for ringing
    const now = ctx.currentTime
    for (let i = 0; i < 10; i++) {
      gainNode.gain.setValueAtTime(0.1, now + i * 2)
      gainNode.gain.setValueAtTime(0, now + i * 2 + 1)
    }
    
    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 20)
    osc2.stop(now + 20)
  }, [])

  // Stop ringing tone
  const stopRingingTone = useCallback(() => {
    if (ringingAudio) {
      ringingAudio.pause()
      setRingingAudio(null)
    }
  }, [ringingAudio])

  // Play DTMF tone for softphone keypad
  const playDTMFTone = useCallback((digit: string) => {
    if (!audioContextRef.current || !digit || !DTMF_FREQUENCIES[digit]) return

    const ctx = audioContextRef.current
    const [lowFreq, highFreq] = DTMF_FREQUENCIES[digit]
    
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gainNode = ctx.createGain()
    
    osc1.frequency.setValueAtTime(lowFreq, ctx.currentTime)
    osc2.frequency.setValueAtTime(highFreq, ctx.currentTime)
    
    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)
    
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
    
    osc1.start(ctx.currentTime)
    osc2.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.2)
    osc2.stop(ctx.currentTime + 0.2)
  }, [])

  // Start call
  const dialLead = useCallback(async (lead: CRMLead) => {
    if (!sessionActive || !lead) return

    try {
      setCallState('dialing')
      setCurrentLead(lead)
      setCallProviderMessage('Initiating call...')
      
      // Initiate call via API
      const response = await fetch('/api/admin/crm/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          lead_name: `${lead.first_name} ${lead.last_name}`.trim(),
          company_name: lead.business_name,
          phone_number: lead.phone,
          call_started_at: new Date().toISOString(),
          single_line_mode: true, // Flag for simplified mode
          session_mode: 'single_line', // Override session mode
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to initiate call')
      }

      const callData = await response.json()
      setActiveCallId(callData.call?.id || null)
      setCallProviderMessage('Call initiated, waiting for connection...')
      
      // Start polling for call status updates
      startCallStatusPolling(callData.call?.id || null)

    } catch (error) {
      console.error('Failed to dial lead:', error)
      toast.error(`Failed to initiate call: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setCallState('idle')
      setCallProviderMessage(null)
    }
  }, [sessionActive])

  // Start call timer
  const startCallTimer = useCallback(() => {
    const startTime = Date.now()
    callTimerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
  }, [])

  // Poll call status for real-time updates
  const startCallStatusPolling = useCallback((callId: string | null) => {
    if (!callId) return

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/crm/calls/${callId}`)
        if (!response.ok) {
          clearInterval(pollInterval)
          return
        }

        const { call } = await response.json()
        if (!call) {
          clearInterval(pollInterval)
          return
        }

        setCallProviderStatus(call.twilio_status)

        // Update call state based on Twilio status
        switch (call.twilio_status) {
          case 'ringing':
            if (callState !== 'ringing') {
              setCallState('ringing')
              setCallProviderMessage(`${currentLead?.first_name} ${currentLead?.last_name} - Ringing...`)
            }
            break
          case 'in-progress':
          case 'answered':
            if (callState !== 'connected') {
              setCallState('connected')
              setCallStartTime(call.call_started_at || new Date().toISOString())
              startCallTimer()
              setCallProviderMessage(`🎯 Connected with ${currentLead?.first_name} ${currentLead?.last_name}!`)
            }
            break
          case 'completed':
          case 'busy':
          case 'no-answer':
          case 'failed':
          case 'canceled':
            // Call ended - move to disposition
            clearInterval(pollInterval)
            setCallState('ended')
            setCallDuration(call.duration_seconds || 0)
            if (callTimerRef.current) {
              clearInterval(callTimerRef.current)
              callTimerRef.current = null
            }
            
            // Auto-detect outcome if available
            if (call.call_outcome && call.call_outcome !== 'Interested') {
              setCallProviderMessage(`Call ended: ${call.call_outcome}`)
            } else {
              setCallProviderMessage('Call ended - please disposition')
            }
            
            setTimeout(() => {
              setCallState('disposition_pending')
            }, 500)
            break
        }
      } catch (error) {
        console.error('Error polling call status:', error)
      }
    }, 2000) // Poll every 2 seconds

    // Clean up polling after 5 minutes max
    setTimeout(() => {
      clearInterval(pollInterval)
    }, 5 * 60 * 1000)
  }, [callState, currentLead])

  // End call
  const endCall = useCallback(async () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }

    setCallState('ended')
    
    // Try to end the active call via API
    if (activeCallId) {
      try {
        await fetch(`/api/admin/crm/calls/${activeCallId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_ended_at: new Date().toISOString(),
            duration_seconds: callDuration,
          }),
        })
      } catch (error) {
        console.error('Failed to end call:', error)
      }
    }

    // Show disposition panel
    setTimeout(() => {
      setCallState('disposition_pending')
    }, 500)
  }, [activeCallId, callDuration])

  // Move to next lead
  const moveToNextLead = useCallback(() => {
    const nextIndex = index + 1
    if (nextIndex < leads.length) {
      setIndex(nextIndex)
      setCurrentLead(leads[nextIndex])
    } else {
      // No more leads
      setCurrentLead(null)
      toast.success('All leads completed!')
    }

    // Reset call state
    resetCallState()
  }, [index, leads, resetCallState])

  // Reset call state
  const resetCallState = useCallback(() => {
    setCallState('idle')
    setCallDuration(0)
    setCallStartTime(null)
    setActiveCallId(null)
    setCallProviderStatus(null)
    setCallProviderMessage(null)
    setNote('')
    setNextFollowUpAt('')
    setTemperature('cold')
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
  }, [])

  // Save disposition with error handling
  const saveDisposition = useCallback(async (disposition: DispositionOption) => {
    if (!currentLead) return

    setDispositionSaving(true)

    try {
      // Save call with disposition
      const response = await fetch('/api/admin/crm/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: currentLead.id,
          call_outcome: disposition.outcome,
          notes: note.trim() || null,
          next_follow_up_at: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
          lead_temperature: temperature,
          call_ended_at: new Date().toISOString(),
          call_started_at: callStartTime || new Date().toISOString(),
          duration_seconds: callDuration,
          single_line_mode: true, // Flag for simplified mode
          session_mode: 'single_line', // Override session mode
          call_id: activeCallId, // Update existing call if available
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save disposition')
      }

      const result = await response.json()
      
      // Verify disposition was saved successfully
      if (!result.degraded && !result.call) {
        throw new Error('Disposition save verification failed')
      }

      toast.success('Disposition saved successfully')
      
      // Check if this was a terminal outcome and show appropriate message
      if (disposition.key === 'dnc' || disposition.key === 'not_interested' || disposition.outcome.includes('Bad Number') || disposition.outcome.includes('Wrong Number')) {
        toast(`${currentLead.first_name} removed from active dialing`, {
          icon: '??',
          duration: 5000,
        })
      }
      
      // Apply eligibility updates for terminal outcomes
      if (result.call && supabaseRef.current) {
        await applyDispositionEligibilityUpdates(supabaseRef.current, result.call.id, disposition.outcome)
      }
      
      // Move to next lead only after successful save
      moveToNextLead()
      
    } catch (error) {
      console.error('Failed to save disposition:', error)
      toast.error(`Failed to save disposition: ${error instanceof Error ? error.message : 'Unknown error'}`)
      
      // Do NOT move to next lead on failure - user must retry
      return
    } finally {
      setDispositionSaving(false)
    }
  }, [currentLead, note, nextFollowUpAt, temperature, callStartTime, callDuration, activeCallId, moveToNextLead])

  // Skip current lead
  const skipLead = useCallback(() => {
    moveToNextLead()
  }, [moveToNextLead])

  // Initialize
  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get call state display
  const getCallStateDisplay = () => {
    switch (callState) {
      case 'connecting':
        return { label: 'Connecting...', color: 'text-blue-500', icon: Loader2 }
      case 'dialing':
        return { label: 'Dialing...', color: 'text-yellow-500', icon: Phone }
      case 'ringing':
        return { label: 'Ringing...', color: 'text-yellow-500', icon: Phone, animate: true }
      case 'connected':
        return { label: `Connected (${formatDuration(callDuration)})`, color: 'text-green-500', icon: CheckCircle2 }
      case 'ended':
        return { label: 'Call Ended', color: 'text-gray-500', icon: PhoneOff }
      case 'disposition_pending':
        return { label: 'Save Disposition', color: 'text-amber-500', icon: Clock3 }
      default:
        return { label: 'Ready', color: 'text-gray-400', icon: Phone }
    }
  }

  const callStateDisplay = getCallStateDisplay()
  const Icon = callStateDisplay.icon

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-6xl text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Power Dialer</h1>
          <div className="flex items-center gap-4">
            {!sessionActive ? (
              <button
                onClick={initializeAudio}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
              >
                <Volume2 size={20} />
                Connect Audio
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-600 rounded-lg">
                <Volume2 size={20} className="text-green-400" />
                <span className="text-green-400">Audio Connected</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lead Card */}
          <div className="lg:col-span-2">
            {currentLead ? (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">
                    {currentLead.first_name} {currentLead.last_name}
                  </h2>
                  <span className="text-sm text-gray-400">
                    {index + 1} / {leads.length}
                  </span>
                </div>

                {currentLead.business_name && (
                  <div className="flex items-center gap-2 mb-4 text-gray-300">
                    <Building2 size={16} />
                    <span>{currentLead.business_name}</span>
                  </div>
                )}

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-gray-400" />
                    <span>{currentLead.phone}</span>
                  </div>
                  {currentLead.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={16} className="text-gray-400" />
                      <span>{currentLead.email}</span>
                    </div>
                  )}
                  {currentLead.lead_temperature && (
                    <div className="flex items-center gap-2">
                      <Flame size={16} className={cn(
                        currentLead.lead_temperature === 'hot' ? 'text-red-400' :
                        currentLead.lead_temperature === 'warm' ? 'text-orange-400' :
                        'text-blue-400'
                      )} />
                      <span className="capitalize">{currentLead.lead_temperature} Lead</span>
                    </div>
                  )}
                  {currentLead.call_window_status && (
                    <div className="flex items-center gap-2">
                      <Clock size={16} className={cn(
                        currentLead.call_window_status === 'callable_now' ? 'text-green-400' :
                        'text-amber-400'
                      )} />
                      <span className="text-xs">
                        {currentLead.call_window_status === 'callable_now' ? 'Callable Now' :
                         currentLead.blocked_until_label || 'Check Calling Window'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Call Controls */}
                <div className="mt-6 space-y-4">
                  {!sessionActive ? (
                    <div className="text-center py-8 text-gray-400">
                      <VolumeX size={48} className="mx-auto mb-4" />
                      <p>Connect browser audio to start dialing</p>
                    </div>
                  ) : callState === 'idle' ? (
                    <button
                      onClick={() => dialLead(currentLead)}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg flex items-center justify-center gap-2"
                    >
                      <Phone size={24} />
                      Dial Now
                    </button>
                  ) : callState === 'connected' ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-2 text-green-400">
                        <Icon size={24} className={callStateDisplay.animate ? 'animate-pulse' : ''} />
                        <span className="font-medium">{callStateDisplay.label}</span>
                      </div>
                      
                      {/* Softphone Keypad */}
                      <div className="grid grid-cols-3 gap-2">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(digit => (
                          <button
                            key={digit}
                            onClick={() => playDTMFTone(digit)}
                            className="py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-mono text-lg"
                          >
                            {digit}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={endCall}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold flex items-center justify-center gap-2"
                      >
                        <PhoneOff size={20} />
                        End Call
                      </button>
                    </div>
                  ) : callState === 'disposition_pending' ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <Icon size={32} className={callStateDisplay.color + ' mx-auto mb-2'} />
                        <p className={callStateDisplay.color}>{callStateDisplay.label}</p>
                      </div>

                      {/* Disposition Options */}
                      <div className="grid grid-cols-2 gap-2">
                        {DISPOSITION_OPTIONS.map(disposition => (
                          <button
                            key={disposition.key}
                            onClick={() => saveDisposition(disposition)}
                            disabled={dispositionSaving}
                            className={cn(
                              'p-2 rounded-lg font-medium flex items-center justify-center gap-1 text-sm',
                              disposition.color,
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                          >
                            <disposition.icon size={14} />
                            {disposition.label}
                          </button>
                        ))}
                      </div>

                      {/* Call Notes */}
                      <div>
                        <label className="block text-sm font-medium mb-2">Call Notes</label>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Add notes about this call..."
                          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg resize-none h-20"
                        />
                      </div>

                      {/* Follow-up */}
                      <div>
                        <label className="block text-sm font-medium mb-2">Follow-up (optional)</label>
                        <input
                          type="datetime-local"
                          value={nextFollowUpAt}
                          onChange={(e) => setNextFollowUpAt(e.target.value)}
                          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg"
                        />
                      </div>

                      {/* Temperature */}
                      <div>
                        <label className="block text-sm font-medium mb-2">Lead Temperature</label>
                        <div className="flex gap-2">
                          {(['cold', 'warm', 'hot'] as const).map(temp => (
                            <button
                              key={temp}
                              onClick={() => setTemperature(temp)}
                              className={cn(
                                'flex-1 py-2 rounded-lg border capitalize',
                                temperature === temp
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-gray-800 border-gray-700 text-gray-300'
                              )}
                            >
                              {temp}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Icon size={32} className={cn(callStateDisplay.color, 'mx-auto mb-2', callStateDisplay.animate && 'animate-pulse')} />
                      <p className={callStateDisplay.color}>{callStateDisplay.label}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
                <CheckCircle2 size={48} className="text-green-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">All Leads Completed!</h3>
                <p className="text-gray-400">You've reached the end of your lead list.</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Call Status */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold mb-3">Call Status</h3>
              <div className="flex items-center gap-2">
                <Icon size={20} className={callStateDisplay.color} />
                <span className={callStateDisplay.color}>{callStateDisplay.label}</span>
              </div>
              {callProviderMessage && (
                <div className="mt-2 text-sm text-gray-400">
                  {callProviderMessage}
                </div>
              )}
            </div>

            {/* Audio Feed */}
            <CallAudioFeed 
              callState={callState}
              onConnect={() => setCallProviderMessage('Audio connected')}
              onDisconnect={() => setCallProviderMessage('Audio disconnected')}
            />

            {/* Progress */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold mb-3">Progress</h3>
              <div className="text-sm text-gray-400">
                <div>Lead {index + 1} of {leads.length}</div>
                <div className="mt-2">
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{ width: `${((index + 1) / leads.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={skipLead}
                  disabled={callState !== 'idle' || !currentLead}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Skip Lead
                </button>
                <button
                  onClick={loadLeads}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
                >
                  Reload Leads
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
