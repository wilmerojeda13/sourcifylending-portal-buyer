'use client'

import { useState } from 'react'
import { Bell, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface ReminderResult {
  success: boolean
  sent?: number
  skipped?: number
  errors?: number
  error?: string
}

export default function SendRemindersButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReminderResult | null>(null)

  const handleSend = async () => {
    if (!confirm('Send payment reminder emails to all clients with outstanding balances or upcoming payments?')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/payments/send-reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ success: false, error: 'Network error — could not reach reminders endpoint.' })
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
          <Bell size={20} className="text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Send Payment Reminders</h3>
          <p className="text-xs text-gray-500 leading-snug">
            Email all clients with balance due, upcoming payments, or past-due accounts.
            Automatically deduplicates — safe to run daily.
          </p>
        </div>
      </div>

      <button
        onClick={handleSend}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
      >
        {loading ? (
          <><Loader2 size={15} className="animate-spin" /> Sending…</>
        ) : (
          <><Bell size={15} /> Send Payment Reminders</>
        )}
      </button>

      {result && (
        <div className={`mt-4 rounded-xl border p-3 text-xs ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-1.5 font-bold mb-1">
            {result.success
              ? <><CheckCircle size={13} className="text-green-600" /><span className="text-green-700">Reminders processed</span></>
              : <><XCircle size={13} className="text-red-600" /><span className="text-red-700">Failed</span></>
            }
          </div>
          {result.success && (
            <div className="flex gap-4 text-gray-600 mt-1">
              <span>✉️ Sent: <strong>{result.sent ?? 0}</strong></span>
              <span>⏭ Skipped: <strong>{result.skipped ?? 0}</strong></span>
              {(result.errors ?? 0) > 0 && <span className="text-red-600">⚠️ Errors: <strong>{result.errors}</strong></span>}
            </div>
          )}
          {result.error && <p className="text-red-600 mt-1">{result.error}</p>}
        </div>
      )}
    </div>
  )
}
