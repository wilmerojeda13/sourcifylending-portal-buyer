'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Headphones, Volume2, AlertCircle, RefreshCw, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BrowserAudioProps {
  connectionMode: 'browser' | 'phone'
  deviceStatus: 'offline' | 'connecting' | 'connected' | 'error'
  sessionBusy: boolean
  onReconnect: () => void
}

type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

export default function BrowserAudio({ connectionMode, deviceStatus, sessionBusy, onReconnect }: BrowserAudioProps) {
  const [micPermission, setMicPermission] = useState<MicPermission>('unknown')
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([])
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<string>('')
  const deviceRef = useRef<any>(null)

  // Check microphone permissions
  useEffect(() => {
    if (connectionMode !== 'browser') return

    const checkPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
        setMicPermission('granted')
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setMicPermission('denied')
        } else if (err.name === 'NotReadableError') {
          setMicPermission('denied')
        } else {
          setMicPermission('prompt')
        }
      }
    }

    checkPermission()

    // Listen for permission changes
    navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((result) => {
      setMicPermission(result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'prompt')
    })

  }, [connectionMode])

  // Get available audio devices
  useEffect(() => {
    if (connectionMode !== 'browser') return

    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioDevices = devices.filter(device => device.kind === 'audioinput')
        setAvailableDevices(audioDevices.map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          kind: device.kind,
        })))
      } catch (err) {
        console.error('Error getting devices:', err)
      }
    }

    getDevices()

    // Listen for device changes
    navigator.mediaDevices?.addEventListener('devicechange', getDevices)

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', getDevices)
    }
  }, [connectionMode])

  // Test microphone
  const testMicrophone = async () => {
    if (micPermission !== 'granted') {
      setTestResult('Microphone permission required')
      return
    }

    setIsTesting(true)
    setTestResult('Testing...')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: selectedDevice || undefined,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      
      // Test audio levels
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      source.connect(analyser)
      
      setTimeout(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(dataArray)
        
        // Check if we're getting audio data
        const hasAudio = dataArray.some(value => value > 10)
        
        stream.getTracks().forEach(track => track.stop())
        setTestResult(hasAudio ? '✅ Microphone working' : '❌ No audio detected')
        setIsTesting(false)
      }, 2000)

    } catch (err: any) {
      console.error('Mic test error:', err)
      setTestResult(`❌ Error: ${err.message || 'Unknown error'}`)
      setIsTesting(false)
    }
  }

  const getPermissionIcon = () => {
    switch (micPermission) {
      case 'granted': return <Mic className="w-4 h-4 text-green-500" />
      case 'denied': return <MicOff className="w-4 h-4 text-red-500" />
      case 'prompt': return <AlertCircle className="w-4 h-4 text-yellow-500" />
      default: return <AlertCircle className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusColor = () => {
    switch (deviceStatus) {
      case 'connected': return 'text-green-500'
      case 'connecting': return 'text-yellow-500'
      case 'error': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getStatusText = () => {
    switch (deviceStatus) {
      case 'connected': return 'Browser Audio Ready'
      case 'connecting': return 'Connecting...'
      case 'error': return 'Connection Error'
      default: return 'Not Connected'
    }
  }

  if (connectionMode !== 'browser') return null

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
        <Headphones className="w-4 h-4" />
        Browser Audio
      </h3>

      {/* Permission Status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">Microphone Permission</span>
          <div className="flex items-center gap-2">
            {getPermissionIcon()}
            <span className={cn("text-xs font-medium", getStatusColor())}>
              {micPermission === 'granted' ? 'Granted' : micPermission === 'denied' ? 'Blocked' : 'Unknown'}
            </span>
          </div>
        </div>

        {micPermission === 'denied' && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
            <p className="font-medium">Microphone Access Required</p>
            <p className="mt-1">Allow microphone access in your browser settings, then reconnect.</p>
            <div className="mt-2 text-xs text-gray-500">
              <p>Chrome: Settings → Privacy and Security → Site Settings → Microphone</p>
              <p>Firefox: Settings → Privacy & Security → Permissions → Microphone</p>
            </div>
          </div>
        )}
      </div>

      {/* Device Selection */}
      {micPermission === 'granted' && availableDevices.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">Microphone Device</span>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              {availableDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => navigator.mediaDevices?.enumerateDevices()}
              className="p-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Device Status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">Connection Status</span>
          <div className="flex items-center gap-2">
            <Volume2 className={cn("w-4 h-4", getStatusColor())} />
            <span className={cn("text-xs font-medium", getStatusColor())}>
              {getStatusText()}
            </span>
          </div>
        </div>

        {deviceStatus === 'connected' && (
          <div className="text-xs text-green-400">
            Selected: {selectedDevice || 'Default device'}
          </div>
        )}
      </div>

      {/* Test Controls */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">Audio Test</span>
          <button
            onClick={testMicrophone}
            disabled={isTesting || micPermission !== 'granted'}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? 'Testing...' : 'Test Microphone'}
          </button>
        </div>

        {testResult && (
          <div className={cn(
            "text-xs p-2 rounded border",
            testResult.includes('✅') ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"
          )}>
            {testResult}
          </div>
        )}
      </div>

      {/* Reconnect Control */}
      <div className="pt-3 border-t border-gray-800">
        <button
          onClick={onReconnect}
          disabled={sessionBusy || deviceStatus === 'connecting'}
          className="w-full px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={16} className="mr-2" />
          Reconnect Browser Audio
        </button>
      </div>
    </div>
  )
}

interface MediaDeviceInfo {
  deviceId: string
  label: string
  kind: string
}
