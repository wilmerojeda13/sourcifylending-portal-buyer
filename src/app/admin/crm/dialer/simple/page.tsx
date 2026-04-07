'use client'

import { useState, useEffect } from 'react'
import SimpleDialerClient from '@/components/admin/crm/dialer/SimpleDialerClient'
import CallAudioFeed from '@/components/admin/crm/dialer/CallAudioFeed'
import SoftphoneKeypad from '@/components/admin/crm/dialer/SoftphoneKeypad'
import DispositionPanel from '@/components/admin/crm/dialer/DispositionPanel'
import { Phone, Settings, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

type CallState = 'idle' | 'connecting' | 'dialing' | 'ringing' | 'connected' | 'ended' | 'disposition_pending'
type CallAudioState = CallState // Make them the same type

interface CRMLead {
  id: string
  first_name: string
  last_name: string
  phone: string
  business_name?: string | null
  email?: string | null
  stage: string
}

export default function SimpleDialerPage() {
  const [view, setView] = useState<'dialer' | 'settings' | 'analytics'>('dialer')
  const [callState, setCallState] = useState<CallState>('idle')
  const [currentLead, setCurrentLead] = useState<CRMLead | null>(null)
  const [showKeypad, setShowKeypad] = useState(false)
  const [showDisposition, setShowDisposition] = useState(false)

  // Handle call state changes
  useEffect(() => {
    if (callState === 'connected') {
      setShowKeypad(true)
      setShowDisposition(false)
    } else if (callState === 'disposition_pending') {
      setShowKeypad(false)
      setShowDisposition(true)
    } else {
      setShowKeypad(false)
      setShowDisposition(false)
    }
  }, [callState])

  // Handle disposition save
  const handleDispositionSave = async (disposition: any, note: string, followUpAt: string, temperature: string) => {
    console.log('Saving disposition:', { disposition, note, followUpAt, temperature })
    // Here you would integrate with your actual CRM API
    // Reset to idle state after saving
    setCallState('idle')
    setShowDisposition(false)
  }

  // Handle DTMF digit press
  const handleDigitPress = (digit: string) => {
    console.log('DTMF digit pressed:', digit)
    // Here you would send the DTMF tone to the active call
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Phone className="text-green-500" size={32} />
              <div>
                <h1 className="text-2xl font-bold text-white">Simple Power Dialer</h1>
                <p className="text-gray-400 text-sm">Single-line dialing with manual control</p>
              </div>
            </div>
            
            <nav className="flex items-center gap-2">
              <button
                onClick={() => setView('dialer')}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  view === 'dialer' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                Dialer
              </button>
              <button
                onClick={() => setView('settings')}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
                  view === 'settings' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                <Settings size={16} />
                Settings
              </button>
              <button
                onClick={() => setView('analytics')}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
                  view === 'analytics' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                <BarChart3 size={16} />
                Analytics
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {view === 'dialer' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Dialer */}
            <div className="lg:col-span-3">
              <SimpleDialerClient />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Call Audio Feed */}
              <CallAudioFeed 
                callState={callState}
                onConnect={() => console.log('Call connected')}
                onDisconnect={() => console.log('Call disconnected')}
              />

              {/* Softphone Keypad */}
              {showKeypad && (
                <SoftphoneKeypad 
                  onDigitPress={handleDigitPress}
                  disabled={callState !== 'connected'}
                />
              )}

              {/* Disposition Panel */}
              {showDisposition && (
                <DispositionPanel 
                  onSave={handleDispositionSave}
                  disabled={callState !== 'disposition_pending'}
                />
              )}

              {/* Call Status */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <h3 className="font-semibold mb-3">System Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Call State:</span>
                    <span className={cn(
                      'font-medium capitalize',
                      callState === 'connected' && 'text-green-500',
                      callState === 'ringing' && 'text-yellow-500',
                      callState === 'disposition_pending' && 'text-amber-500',
                      callState === 'idle' && 'text-gray-400'
                    )}>
                      {callState.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Current Lead:</span>
                    <span className="text-gray-300">
                      {currentLead ? `${currentLead.first_name} ${currentLead.last_name}` : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Keypad:</span>
                    <span className={cn(
                      'font-medium',
                      showKeypad ? 'text-green-500' : 'text-gray-500'
                    )}>
                      {showKeypad ? 'Active' : 'Hidden'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Disposition:</span>
                    <span className={cn(
                      'font-medium',
                      showDisposition ? 'text-amber-500' : 'text-gray-500'
                    )}>
                      {showDisposition ? 'Pending' : 'Hidden'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-xl font-bold mb-6">Dialer Settings</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Audio Settings</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-gray-300">Enable Ringing Tone</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-gray-300">DTMF Feedback</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-gray-300">Auto-advance on Disposition</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                  </label>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Call Settings</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-300 mb-2">Default Follow-up Time</label>
                    <select className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                      <option>Tomorrow 10:00 AM</option>
                      <option>Tomorrow 2:00 PM</option>
                      <option>Next Week Monday</option>
                      <option>Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-300 mb-2">Lead Batch Size</label>
                    <input type="number" defaultValue="50" className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium">
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'analytics' && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-xl font-bold mb-6">Dialer Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Today's Calls</h3>
                <div className="text-3xl font-bold text-green-500">47</div>
                <div className="text-sm text-gray-400">+12% from yesterday</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Connect Rate</h3>
                <div className="text-3xl font-bold text-blue-500">23%</div>
                <div className="text-sm text-gray-400">11 of 47 calls</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Avg Call Duration</h3>
                <div className="text-3xl font-bold text-amber-500">2:45</div>
                <div className="text-sm text-gray-400">2 minutes 45 seconds</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
