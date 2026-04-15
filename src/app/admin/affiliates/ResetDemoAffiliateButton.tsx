'use client'

import { useState } from 'react'
import { RefreshCw, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface ResetResult {
  success: boolean
  message?: string
  error?: string
  affiliate?: { email: string; referral_code: string }
}

export default function ResetDemoAffiliateButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ResetResult | null>(null)

  const handleReset = async () => {
    if (!confirm('Reset demo partner account? This will restore all sample referrals and commissions.')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/affiliates/seed-demo', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ success: false, error: 'Network error — could not reach seed endpoint.' })
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
          <RefreshCw size={20} className="text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Reset Demo Partner</h3>
          <p className="text-xs text-gray-500 leading-snug">
            Restore the demo partner account to its original state with fresh sample data
          </p>
        </div>
      </div>

      <button
        onClick={handleReset}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
      >
        {loading ? (
          <><Loader2 size={15} className="animate-spin" /> Resetting…</>
        ) : (
          <><RefreshCw size={15} /> Reset Demo Partner</>
        )}
      </button>

      {result && (
        <div className={`mt-4 rounded-xl border p-3 text-xs ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-1.5 font-bold mb-1">
            {result.success
              ? <><CheckCircle size={13} className="text-green-600" /><span className="text-green-700">Reset successful</span></>
              : <><XCircle size={13} className="text-red-600" /><span className="text-red-700">Reset failed</span></>
            }
          </div>
          {result.message && <p className="text-gray-600 mb-1">{result.message}</p>}
          {result.error && <p className="text-red-600">{result.error}</p>}
          {result.affiliate && (
            <div className="mt-2 bg-white border border-green-100 rounded-lg px-3 py-2 space-y-0.5">
              <p className="text-gray-500 font-mono">{result.affiliate.email}</p>
              <p className="text-gray-400">
                Code: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-700">{result.affiliate.referral_code}</code>
                {' · '}Password: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-700">PartnerDemo123!</code>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
