'use client'

import { useState, useEffect } from 'react'
import { Mic, MicOff, Volume2, VolumeX, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BrowserAudioProps {
  connectionMode: 'browser' | 'phone'
  deviceStatus: 'offline' | 'connecting' | 'connected' | 'error'
  sessionBusy: boolean
  onReconnect: () => void
}

export default function BrowserAudio({ connectionMode, deviceStatus, sessionBusy, onReconnect }: BrowserAudioProps) {
  const [micGranted, setMicGranted] = useState<boolean | null>(null)

  useEffect(() => {
    if (connectionMode !== 'browser') return
    navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((result) => {
      setMicGranted(result.state === 'granted')
      result.onchange = () => setMicGranted(result.state === 'granted')
    }).catch(() => {
      // Permissions API not supported — check via getUserMedia
      navigator.mediaDevices?.getUserMedia({ audio: true })
        .then(stream => { stream.getTracks().forEach(t => t.stop()); setMicGranted(true) })
        .catch(() => setMicGranted(false))
    })
  }, [connectionMode])

  if (connectionMode !== 'browser') return null

  const isConnected = deviceStatus === 'connected'
  const isConnecting = deviceStatus === 'connecting'
  const isError = deviceStatus === 'error'
  const micBlocked = micGranted === false

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 flex items-center gap-3 text-sm transition-colors',
      isConnected ? 'border-green-500/30 bg-green-500/10' :
      isError || micBlocked ? 'border-red-500/30 bg-red-500/10' :
      isConnecting ? 'border-blue-500/30 bg-blue-500/10' :
      'border-gray-700 bg-gray-900/50'
    )}>
      {/* Mic status */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {micBlocked
          ? <MicOff className="w-4 h-4 text-red-400" />
          : <Mic className={cn('w-4 h-4', isConnected ? 'text-green-400' : 'text-gray-400')} />
        }
        <span className={cn(
          'text-xs font-medium',
          micBlocked ? 'text-red-400' : isConnected ? 'text-green-400' : 'text-gray-400'
        )}>
          {micBlocked ? 'Mic Blocked' : 'Mic'}
        </span>
      </div>

      <div className="w-px h-4 bg-gray-700 flex-shrink-0" />

      {/* Audio status */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {isConnected
          ? <Volume2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          : isError || micBlocked
            ? <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            : <VolumeX className="w-4 h-4 text-gray-500 flex-shrink-0" />
        }
        <span className={cn(
          'text-xs truncate',
          isConnected ? 'text-green-400' :
          isError || micBlocked ? 'text-red-400' :
          isConnecting ? 'text-blue-400' : 'text-gray-500'
        )}>
          {micBlocked
            ? 'Allow mic → click lock icon in address bar'
            : isConnected ? 'Browser audio live'
            : isConnecting ? 'Connecting...'
            : isError ? 'Connection error — reconnect below'
            : 'Not connected'}
        </span>
      </div>

      {/* Reconnect button */}
      {(isError || (!isConnected && !isConnecting)) && !micBlocked && (
        <button
          onClick={onReconnect}
          disabled={sessionBusy || isConnecting}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <RefreshCw size={12} />
          Reconnect
        </button>
      )}
    </div>
  )
}
