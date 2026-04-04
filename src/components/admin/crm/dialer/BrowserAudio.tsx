'use client'

import { Mic, Volume2, VolumeX, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BrowserAudioProps {
  connectionMode: 'browser' | 'phone'
  deviceStatus: 'offline' | 'connecting' | 'connected' | 'error'
  sessionBusy: boolean
  onReconnect: () => void
}

export default function BrowserAudio({ connectionMode, deviceStatus, sessionBusy, onReconnect }: BrowserAudioProps) {
  if (connectionMode !== 'browser') return null

  const isConnected = deviceStatus === 'connected'
  const isConnecting = deviceStatus === 'connecting'
  const isError = deviceStatus === 'error'

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 flex items-center gap-3 text-sm transition-colors',
      isConnected ? 'border-green-500/30 bg-green-500/10' :
      isError ? 'border-red-500/30 bg-red-500/10' :
      isConnecting ? 'border-blue-500/30 bg-blue-500/10' :
      'border-gray-700 bg-gray-900/50'
    )}>
      {/* Mic status */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Mic className={cn('w-4 h-4', isConnected ? 'text-green-400' : 'text-gray-400')} />
        <span className={cn('text-xs font-medium', isConnected ? 'text-green-400' : 'text-gray-400')}>
          Mic
        </span>
      </div>

      <div className="w-px h-4 bg-gray-700 flex-shrink-0" />

      {/* Audio status */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {isConnected
          ? <Volume2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          : isError
            ? <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            : <VolumeX className="w-4 h-4 text-gray-500 flex-shrink-0" />
        }
        <span className={cn(
          'text-xs truncate',
          isConnected ? 'text-green-400' :
          isError ? 'text-red-400' :
          isConnecting ? 'text-blue-400' : 'text-gray-500'
        )}>
          {isConnected ? 'Browser audio live'
            : isConnecting ? 'Connecting...'
            : isError ? 'Connection error — click Reconnect'
            : 'Not connected'}
        </span>
      </div>

      {/* Reconnect button */}
      {(isError || (!isConnected && !isConnecting)) && (
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
