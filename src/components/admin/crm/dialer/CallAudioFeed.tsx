'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Volume2, VolumeX, Phone, PhoneOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type CallAudioState = 'idle' | 'ringing' | 'connected' | 'ended'

interface CallAudioFeedProps {
  callState: CallAudioState
  onConnect?: () => void
  onDisconnect?: () => void
}

export default function CallAudioFeed({ callState, onConnect, onDisconnect }: CallAudioFeedProps) {
  const [audioDevice, setAudioDevice] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(0.7)
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const ringingOscillatorsRef = useRef<OscillatorNode[]>([])
  const gainNodeRef = useRef<GainNode | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

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
      return stream
    } catch (error) {
      console.error('Failed to initialize audio:', error)
      throw error
    }
  }, [])

  // Play ringing tone (US ringback tone: 440Hz + 480Hz, 2 seconds on, 4 seconds off)
  const playRingingTone = useCallback(() => {
    if (!audioContextRef.current || !gainNodeRef.current) return

    stopAllAudio()

    const ctx = audioContextRef.current
    const gain = gainNodeRef.current

    // Create two oscillators for ringback tone
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    
    osc1.frequency.setValueAtTime(440, ctx.currentTime) // Low frequency
    osc2.frequency.setValueAtTime(480, ctx.currentTime) // High frequency
    
    osc1.connect(gain)
    osc2.connect(gain)
    
    // Ringing pattern: 2 seconds on, 4 seconds off, repeat
    const now = ctx.currentTime
    const totalDuration = 30 // 30 seconds of ringing max
    
    for (let i = 0; i < 5; i++) {
      const onTime = now + (i * 6)
      const offTime = onTime + 2
      
      if (onTime >= now + totalDuration) break
      
      gain.gain.setValueAtTime(volume * 0.3, onTime)
      gain.gain.setValueAtTime(0, offTime)
    }
    
    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + totalDuration)
    osc2.stop(now + totalDuration)
    
    ringingOscillatorsRef.current = [osc1, osc2]
  }, [volume])

  // Stop all audio
  const stopAllAudio = useCallback(() => {
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

  // Handle call state changes
  useEffect(() => {
    switch (callState) {
      case 'ringing':
        playRingingTone()
        break
      case 'connected':
        stopAllAudio()
        onConnect?.()
        break
      case 'ended':
        stopAllAudio()
        onDisconnect?.()
        break
      case 'idle':
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
  }, [audioDevice, stopAllAudio])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          {callState === 'ringing' && <Phone className="animate-pulse text-yellow-500" />}
          {callState === 'connected' && <Volume2 className="text-green-500" />}
          {callState === 'idle' && <Volume2 className="text-gray-400" />}
          {callState === 'ended' && <PhoneOff className="text-gray-500" />}
          Audio Feed
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

          {/* Audio Info */}
          <div className="text-xs text-gray-500 space-y-1">
            <div>Microphone: {isMuted ? 'Muted' : 'Active'}</div>
            <div>Sample Rate: {audioContextRef.current?.sampleRate || 'N/A'} Hz</div>
          </div>

          {/* Disconnect Button */}
          <button
            onClick={disconnectAudio}
            className="w-full py-2 bg-red-600/20 border border-red-600 rounded-lg text-red-400 text-sm font-medium hover:bg-red-600/30"
          >
            Disconnect Audio
          </button>
        </div>
      )}
    </div>
  )
}
