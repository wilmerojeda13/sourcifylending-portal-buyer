'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, MinusCircle, X, Loader2 } from 'lucide-react'

interface Props {
  opportunityName: string
  opportunityId?: string
  program?: string
  stage?: string
  onClose: () => void
  onSubmitted?: (outcome: string) => void
}

const OPTIONS = [
  { value: 'approved', label: 'Approved!', icon: CheckCircle, color: 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' },
  { value: 'denied', label: 'Denied', icon: XCircle, color: 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100' },
  { value: 'pending', label: 'Still Pending', icon: Clock, color: 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100' },
  { value: 'not_applied', label: "Didn't Apply", icon: MinusCircle, color: 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100' },
]

export default function OutcomeFeedbackModal({ opportunityName, opportunityId, program, stage, onClose, onSubmitted }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (!selected) return
    setSubmitting(true)
    try {
      await fetch('/api/outcomes/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opportunityId,
          opportunity_name: opportunityName,
          program,
          stage,
          outcome: selected,
        }),
      })
      setDone(true)
      onSubmitted?.(selected)
      setTimeout(onClose, 1500)
    } catch {
      // silently fail — don't block the user
      onClose()
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>

        {done ? (
          <div className="text-center py-4">
            <CheckCircle className="mx-auto text-green-500 mb-2" size={40} />
            <p className="font-semibold text-gray-800">Thanks for the update!</p>
            <p className="text-sm text-gray-500 mt-1">This helps us improve recommendations for you.</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Quick Feedback</p>
              <h3 className="font-bold text-gray-900 text-base leading-snug">What happened with your application?</h3>
              <p className="text-xs text-gray-500 mt-1 truncate">{opportunityName}</p>
            </div>

            <div className="space-y-2 mb-4">
              {OPTIONS.map(({ value, label, icon: Icon, color }) => (
                <button
                  key={value}
                  onClick={() => setSelected(value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${color} ${selected === value ? 'ring-2 ring-offset-1 ring-current' : ''}`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!selected || submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 size={15} className="animate-spin" />Saving&hellip;</> : 'Submit'}
            </button>

            <p className="text-center text-xs text-gray-400 mt-3">
              Helps us show better options for clients like you
            </p>
          </>
        )}
      </div>
    </div>
  )
}
