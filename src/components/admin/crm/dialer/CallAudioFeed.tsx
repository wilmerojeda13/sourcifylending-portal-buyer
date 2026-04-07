'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Volume2, VolumeX, Phone, PhoneOff, Headphones } from 'lucide-react'
import { cn } from '@/lib/utils'

type CallAudioState = 'idle' | 'connecting' | 'dialing' | 'ringing' | 'connected' | 'ended' | 'disposition_pending'

interface CallAudioFeedProps {
  callState: CallAudioState
  onConnect?: () => void
  onDisconnect?: () => void
  onDTMFSent?: (digit: string) => void
}

export default function CallAudioFeed({ callState, onConnect, onDisconnect, onDTMFSent }: CallAudioFeedProps) {
  const [audioDevice, setAudioDevice] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const [isRinging, setIsRinging] = useState(false)
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const ringingOscillatorsRef = useRef<OscillatorNode[]>([])
  const gainNodeRef = useRef<GainNode | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const ringingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize audio context
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      gainNodeRef.current = audioContextRef.current.createGain()
      gainNodeRef.current.connect(audioContextRef.current.destination)
      gainNodeRef.current.gain.setValueAtTime(volume, audioContextRef.current.currentTime)
    }

    return () => {
      stopAllAudio()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (ringingIntervalRef.current) {
        clearInterval(ringingIntervalRef.current)
      }
    }
  }, [])

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume, audioContextRef.current.currentTime)
    }
  }, [volume])

  // Initialize browser audio
  const initializeAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      })
      setAudioDevice(stream)
      onConnect?.()
      return stream
    } catch (error) {
      console.error('Failed to initialize audio:', error)
      throw error
    }
  }, [onConnect])

  // Play ringing tone (US ringback tone: 440Hz + 480Hz, 2 seconds on, 4 seconds off)
  const playRingingTone = useCallback(() => {
    if (!audioContextRef.current || !gainNodeRef.current) return

    stopAllAudio()
    setIsRinging(true)

    const ctx = audioContextRef.current
    const gain = gainNodeRef.current

    // Create two oscillators for ringback tone
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    
    osc1.frequency.setValueAtTime(440, ctx.currentTime) // Low frequency
    osc2.frequency.setValueAtTime(480, ctx.currentTime) // High frequency
    
    osc1.connect(gain)
    osc2.connect(gain)
    
    // Ringing pattern: 2 seconds on, 4 seconds off, repeat indefinitely
    const startRingingPattern = () => {
      const now = ctx.currentTime
      
      // Create on/off pattern
      for (let i = 0; i < 20; i++) { // 20 cycles = 2 minutes of ringing
        const onTime = now + (i * 6)
        const offTime = onTime + 2
        
        gain.gain.setValueAtTime(volume * 0.3, onTime)
        gain.gain.setValueAtTime(0, offTime)
      }
    }
    
    startRingingPattern()
    
    // Restart pattern every 2 minutes to prevent audio context issues
    ringingIntervalRef.current = setInterval(() => {
      startRingingPattern()
    }, 120000)
    
    osc1.start(ctx.currentTime)
    osc2.start(ctx.currentTime)
    
    ringingOscillatorsRef.current = [osc1, osc2]
  }, [volume])

  // Stop all audio
  const stopAllAudio = useCallback(() => {
    setIsRinging(false)
    
    // Clear ringing interval
    if (ringingIntervalRef.current) {
      clearInterval(ringingIntervalRef.current)
      ringingIntervalRef.current = null
    }
    
    // Stop ringing oscillators
    ringingOscillatorsRef.current.forEach(osc => {
      try {
        osc.stop()
        osc.disconnect()
      } catch (e) {
        // Oscillator might already be stopped
      }
    })
    ringingOscillatorsRef.current = []

    // Stop any audio elements
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.currentTime = 0
    }
  }, [])

  // Play DTMF tone for softphone keypad
  const playDTMFTone = useCallback((digit: string) => {
    if (!audioContextRef.current || !digit) return

    const ctx = audioContextRef.current
    const dtmfFrequencies: Record<string, [number, number]> = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
    }
    
    const frequencies = dtmfFrequencies[digit]
    if (!frequencies) return
    
    const [lowFreq, highFreq] = frequencies
    
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gainNode = ctx.createGain()
    
    osc1.frequency.setValueAtTime(lowFreq, ctx.currentTime)
    osc2.frequency.setValueAtTime(highFreq, ctx.currentTime)
    
    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)
    
    gainNode.gain.setValueAtTime(volume * 0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
    
    osc1.start(ctx.currentTime)
    osc2.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.15)
    
    // Notify parent component
    onDTMFSent?.(digit)
  }, [volume, onDTMFSent])
  // Handle call state changes
  useEffect(() => {
    switch (callState) {
      case 'dialing':
      case 'ringing':
        playRingingTone()
        break
      case 'connected':
        stopAllAudio()
        onConnect?.()
        break
      case 'ended':
      case 'disposition_pending':
        stopAllAudio()
        onDisconnect?.()
        break
      case 'idle':
      case 'connecting':
        stopAllAudio()
        break
    }
  }, [callState, playRingingTone, stopAllAudio, onConnect, onDisconnect])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (audioDevice) {
      audioDevice.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }, [audioDevice, isMuted])

  // Disconnect audio
  const disconnectAudio = useCallback(() => {
    if (audioDevice) {
      audioDevice.getTracks().forEach(track => {
        track.stop()
      })
      setAudioDevice(null)
    }
    stopAllAudio()
    onDisconnect?.()
  }, [audioDevice, stopAllAudio, onDisconnect])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          {isRinging && <Phone className="animate-pulse text-yellow-500" />}
          {callState === 'connected' && <Headphones className="text-green-500" />}
          {callState === 'idle' && <Volume2 className="text-gray-400" />}
          {callState === 'ended' && <PhoneOff className="text-gray-500" />}
          Audio Feed
          {isRinging && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full animate-pulse">
              Ringing
            </span>
          )}
        </h3>
        
        {audioDevice && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isMuted ? 'bg-red-600/20 text-red-400' : 'bg-gray-800 text-gray-400'
              )}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        )}
      </div>

      {!audioDevice ? (
        <div className="text-center py-6">
          <VolumeX size={48} className="text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400 text-sm mb-4">Connect browser audio to enable calls</p>
          <button
            onClick={initializeAudio}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium"
          >
            Connect Audio
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Status:</span>
            <span className={cn(
              'text-sm font-medium',
              callState === 'ringing' && 'text-yellow-500',
              callState === 'connected' && 'text-green-500',
              callState === 'idle' && 'text-gray-400',
              callState === 'ended' && 'text-gray-500'
            )}>
              {callState === 'ringing' && 'Ringing...'}
              {callState === 'connected' && 'Connected'}
              {callState === 'idle' && 'Ready'}
              {callState === 'ended' && 'Call Ended'}
            </span>
          </div>

          {/* Volume Control */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Volume:</span>
              <span className="text-sm text-gray-400">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Softphone Keypad - Only during active connected calls */}
          {callState === 'connected' && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2">DTMF Keypad</h4>
              <div className="grid grid-cols-3 gap-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(digit => (
                  <button
                    key={digit}
                    onClick={() => playDTMFTone(digit)}
                    className="py-2 bg-gray-800 hover:bg-gray-700 rounded text-xs font-mono transition-colors"
                  >
                    {digit}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Audio Info */}
          <div className="text-xs text-gray-500 space-y-1">
            <div>Microphone: {isMuted ? 'Muted' : 'Active'}</div>
            <div>Sample Rate: {audioContextRef.current?.sampleRate || 'N/A'} Hz</div>
          </div>

          {/* Disconnect Button */}
          <button
            onClick={disconnectAudio}
            className="w-full py-2 bg-red-600/20 border border-red-600 rounded-lg text-red-400 text-sm font-medium hover:bg-red-600/30 transition-colors"
          >
            Disconnect Audio
          </button>
        </div>
      )}
    </div>
  )
}
