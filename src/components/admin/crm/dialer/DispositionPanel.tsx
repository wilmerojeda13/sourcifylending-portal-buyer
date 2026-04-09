'use client'

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, Voicemail, PhoneMissed, CalendarPlus, Ban, Clock3, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

type Stage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'demo_held' | 'follow_up' | 'closed_won' | 'closed_lost' | 'active_client'

interface DispositionOption {
  key: string
  label: string
  icon: React.ElementType
  color: string
  outcome: string
  newStage?: Stage
  temperature?: 'cold' | 'warm' | 'hot'
  isTerminal?: boolean
}

interface DispositionPanelProps {
  onSave: (disposition: DispositionOption, note: string, followUpAt: string, temperature: 'cold' | 'warm' | 'hot') => Promise<void>
  disabled?: boolean
  className?: string
}

// Disposition options
// NOTE: outcome values MUST match CRM_DISPOSITIONS in lib/crm-dispositions.ts
// The filter in Leads/Pipeline reads from crm_leads.last_call_outcome
// which is set from definition.outcome in applyCrmDisposition()
const DISPOSITION_OPTIONS: DispositionOption[] = [
  { 
    key: 'interested', 
    label: 'Interested', 
    icon: ThumbsUp, 
    color: 'bg-green-600 hover:bg-green-700 text-white', 
    outcome: 'Interested', 
    newStage: 'qualified',
    temperature: 'warm'
  },
  { 
    key: 'appointment_set',  // Changed from 'book_demo' to match CRM_DISPOSITIONS
    label: 'Appointment Set', 
    icon: CalendarPlus, 
    color: 'bg-purple-600 hover:bg-purple-700 text-white', 
    outcome: 'Appointment Set',  // Changed from 'Booked Call' to match CRM_DISPOSITIONS
    newStage: 'demo_scheduled',
    temperature: 'hot'
  },
  { 
    key: 'voicemail', 
    label: 'Voicemail', 
    icon: Voicemail, 
    color: 'bg-amber-600 hover:bg-amber-700 text-white', 
    outcome: 'Voicemail',  // Changed from 'Left Voicemail' to match CRM_DISPOSITIONS
    newStage: 'contacted',
    temperature: 'cold'
  },
  { 
    key: 'no_answer', 
    label: 'No Answer', 
    icon: PhoneMissed, 
    color: 'bg-gray-600 hover:bg-gray-700 text-white', 
    outcome: 'No Answer', 
    newStage: 'contacted',
    temperature: 'cold'
  },
  { 
    key: 'not_interested', 
    label: 'Not Interested', 
    icon: ThumbsDown, 
    color: 'bg-red-600 hover:bg-red-700 text-white', 
    outcome: 'Not Interested', 
    newStage: 'closed_lost',
    temperature: 'cold',
    isTerminal: true
  },
  { 
    key: 'dnc', 
    label: 'DNC / Remove',  // Changed from 'DNC' to match CRM_DISPOSITIONS label
    icon: Ban, 
    color: 'bg-red-800 hover:bg-red-900 text-white', 
    outcome: 'Do Not Call',  // Changed from 'DNC' to match CRM_DISPOSITIONS outcome
    isTerminal: true
  },
]

export default function DispositionPanel({ onSave, disabled = false, className }: DispositionPanelProps) {
  const [selectedDisposition, setSelectedDisposition] = useState<DispositionOption | null>(null)
  const [note, setNote] = useState('')
  const [temperature, setTemperature] = useState<'cold' | 'warm' | 'hot'>('cold')
  const [followUpAt, setFollowUpAt] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-set temperature when disposition is selected
  const handleDispositionSelect = (disposition: DispositionOption) => {
    setSelectedDisposition(disposition)
    if (disposition.temperature) {
      setTemperature(disposition.temperature)
    }
  }

  // Handle save
  const handleSave = async () => {
    if (!selectedDisposition) {
      return
    }

    setSaving(true)
    try {
      await onSave(selectedDisposition, note, followUpAt, temperature)
      // Reset form after successful save
      setSelectedDisposition(null)
      setNote('')
      setFollowUpAt('')
      setTemperature('cold')
    } catch (error) {
      console.error('Failed to save disposition:', error)
    } finally {
      setSaving(false)
    }
  }

  // Format datetime for input
  const formatDateTimeForInput = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // Set default follow-up time (tomorrow at 10 AM)
  const setDefaultFollowUp = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    setFollowUpAt(formatDateTimeForInput(tomorrow))
  }

  return (
    <div className={cn('bg-gray-900 rounded-xl border border-gray-800 p-6', className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock3 className="text-amber-500" />
          Call Disposition
        </h3>
        <span className="text-sm text-gray-400">Required to continue</span>
      </div>

      {/* Disposition Options */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-3">Call Result</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {DISPOSITION_OPTIONS.map(disposition => (
            <button
              key={disposition.key}
              onClick={() => handleDispositionSelect(disposition)}
              disabled={disabled}
              className={cn(
                'p-3 rounded-lg font-medium flex flex-col items-center justify-center gap-2 transition-all',
                disposition.color,
                'disabled:opacity-50 disabled:cursor-not-allowed',
                selectedDisposition?.key === disposition.key && 'ring-2 ring-white ring-offset-2 ring-offset-gray-900',
                'hover:scale-105 active:scale-95'
              )}
            >
              <disposition.icon size={20} />
              <span className="text-sm">{disposition.label}</span>
              {disposition.isTerminal && (
                <span className="text-xs opacity-75">Terminal</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Call Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Call Notes</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add notes about this call conversation..."
          disabled={disabled}
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg resize-none h-24 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <div className="text-xs text-gray-500 mt-1">
          {note.length} characters
        </div>
      </div>

      {/* Follow-up */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-300">Follow-up (optional)</label>
          <button
            type="button"
            onClick={setDefaultFollowUp}
            disabled={disabled}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
          >
            Set to tomorrow 10 AM
          </button>
        </div>
        <input
          type="datetime-local"
          value={followUpAt}
          onChange={(e) => setFollowUpAt(e.target.value)}
          disabled={disabled}
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Lead Temperature */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Lead Temperature</label>
        <div className="grid grid-cols-3 gap-2">
          {(['cold', 'warm', 'hot'] as const).map(temp => (
            <button
              key={temp}
              onClick={() => setTemperature(temp)}
              disabled={disabled}
              className={cn(
                'py-2 px-3 rounded-lg border capitalize font-medium transition-all',
                temperature === temp
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {temp}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Disposition Summary */}
      {selectedDisposition && (
        <div className="mb-6 p-3 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <selectedDisposition.icon size={16} className="text-gray-400" />
              <span className="text-sm text-gray-300">{selectedDisposition.label}</span>
            </div>
            {selectedDisposition.newStage && (
              <span className="text-xs text-blue-400">
                Stage: {selectedDisposition.newStage.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={!selectedDisposition || disabled || saving}
        className={cn(
          'w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all',
          selectedDisposition 
            ? 'bg-green-600 hover:bg-green-700 text-white' 
            : 'bg-gray-800 text-gray-500 cursor-not-allowed',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'hover:scale-[1.02] active:scale-[0.98]'
        )}
      >
        {saving ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save size={20} />
            Save Disposition & Continue
          </>
        )}
      </button>

      {/* Instructions */}
      <div className="mt-4 text-xs text-gray-500 text-center">
        Select a call result and save disposition to continue to the next lead
      </div>
    </div>
  )
}
