'use client'

import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

interface SoftphoneKeypadProps {
  onDigitPress?: (digit: string) => void
  disabled?: boolean
  className?: string
}

// DTMF frequencies for softphone keypad
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
}

// DTMF letters for reference
const DTMF_LETTERS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
  '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
}

export default function SoftphoneKeypad({ onDigitPress, disabled = false, className }: SoftphoneKeypadProps) {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [pressedDigit, setPressedDigit] = useState<string | null>(null)
  const pressTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize audio context
  const initializeAudio = useCallback(() => {
    if (typeof window !== 'undefined' && !audioContext) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      setAudioContext(ctx)
    }
  }, [audioContext])

  // Play DTMF tone
  const playDTMFTone = useCallback((digit: string) => {
    if (!audioContext || !digit || !DTMF_FREQUENCIES[digit]) return

    const ctx = audioContext
    const [lowFreq, highFreq] = DTMF_FREQUENCIES[digit]
    
    // Create oscillators for dual-tone multi-frequency
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gainNode = ctx.createGain()
    
    // Set frequencies
    osc1.frequency.setValueAtTime(lowFreq, ctx.currentTime)
    osc2.frequency.setValueAtTime(highFreq, ctx.currentTime)
    
    // Connect to gain node and destination
    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)
    
    // Set gain envelope (quick attack, quick decay)
    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01) // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15) // Quick decay
    
    // Start and stop oscillators
    osc1.start(ctx.currentTime)
    osc2.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.15)
    
    // Visual feedback
    setPressedDigit(digit)
    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current)
    }
    pressTimeoutRef.current = setTimeout(() => {
      setPressedDigit(null)
    }, 150)
  }, [audioContext])

  // Handle digit press
  const handleDigitPress = useCallback((digit: string) => {
    if (disabled) return

    // Initialize audio on first press
    if (!audioContext) {
      initializeAudio()
    }

    // Play tone
    playDTMFTone(digit)

    // Call callback
    onDigitPress?.(digit)
  }, [disabled, audioContext, initializeAudio, playDTMFTone, onDigitPress])

  // Cleanup
  const cleanup = useCallback(() => {
    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current)
    }
    if (audioContext) {
      audioContext.close()
    }
  }, [audioContext])

  // Auto-cleanup on unmount
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', cleanup)
  }

  return (
    <div className={cn('bg-gray-900 rounded-xl border border-gray-800 p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Keypad</h3>
        <span className="text-xs text-gray-400">DTMF Tones</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(digit => (
          <button
            key={digit}
            onClick={() => handleDigitPress(digit)}
            disabled={disabled}
            className={cn(
              'relative py-4 rounded-lg font-mono text-xl font-semibold transition-all',
              'bg-gray-800 hover:bg-gray-700 active:bg-gray-600',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              pressedDigit === digit && 'bg-blue-600 scale-95',
              disabled && pressedDigit === digit && 'bg-gray-700'
            )}
          >
            <div className={cn(
              'transition-colors',
              pressedDigit === digit ? 'text-white' : 'text-gray-300'
            )}>
              {digit}
            </div>
            {DTMF_LETTERS[digit] && (
              <div className={cn(
                'text-xs font-normal mt-1',
                pressedDigit === digit ? 'text-blue-200' : 'text-gray-500'
              )}>
                {DTMF_LETTERS[digit]}
              </div>
            )}
            
            {/* Visual feedback for pressed digit */}
            {pressedDigit === digit && (
              <div className="absolute inset-0 rounded-lg border-2 border-blue-400 pointer-events-none" />
            )}
          </button>
        ))}
      </div>

      {/* Instructions */}
      <div className="mt-4 text-xs text-gray-400 text-center">
        Press digits during calls for IVR navigation
      </div>

      {/* Audio Status */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-400">Audio:</span>
        <span className={cn(
          'font-medium',
          audioContext ? 'text-green-400' : 'text-gray-500'
        )}>
          {audioContext ? 'Ready' : 'Not Initialized'}
        </span>
      </div>
    </div>
  )
}
