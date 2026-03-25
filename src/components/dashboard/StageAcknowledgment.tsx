'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, Award } from 'lucide-react'

interface Props {
  stage: string
  program: string
  onComplete: () => void
}

export default function StageAcknowledgment({ stage, program, onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAcknowledge() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/acknowledgments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, program }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      setDone(true)
      setTimeout(() => onComplete(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-3">
        <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-green-800 text-sm">Stage Acknowledged</p>
          <p className="text-green-600 text-xs mt-0.5">Your confirmation has been saved. Moving to the next stage…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <Award className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-blue-900 text-sm">Stage Complete — {stage}</h3>
          <p className="text-blue-700 text-xs mt-1 leading-relaxed">
            Before advancing, please confirm you have received the guidance and services for this stage. This is logged with a timestamp for your records.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-red-600 text-xs mb-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
      )}

      <button
        onClick={handleAcknowledge}
        disabled={loading}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
      >
        {loading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving confirmation…</>
        ) : (
          <><CheckCircle className="h-4 w-4" /> I Acknowledge I Received {stage} Services</>
        )}
      </button>
    </div>
  )
}
