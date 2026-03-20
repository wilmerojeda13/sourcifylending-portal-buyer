'use client'

import { useState } from 'react'
import { FlaskConical, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface SeedResult {
  success: boolean
  message?: string
  accounts?: { name: string; email: string; program: string }[]
  password?: string
  errors?: string[]
}

export default function SeedDemoButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [showAccounts, setShowAccounts] = useState(false)

  const handleSeed = async () => {
    if (!confirm('Seed (or re-seed) all 4 demo accounts? Existing demo data will be replaced.')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/seed-demo', { method: 'POST' })
      const data = await res.json()
      setResult(data)
      if (data.success) setShowAccounts(true)
    } catch {
      setResult({ success: false, errors: ['Network error — could not reach seed endpoint.'] })
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
          <FlaskConical size={20} className="text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Seed Demo Users</h3>
          <p className="text-xs text-gray-500 leading-snug">Create / reset all 4 demo accounts — Program A, B, C, and dual A+B switcher</p>
        </div>
      </div>

      <button
        onClick={handleSeed}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
      >
        {loading ? (
          <><Loader2 size={15} className="animate-spin" /> Seeding…</>
        ) : (
          <><FlaskConical size={15} /> Seed Demo Users</>
        )}
      </button>

      {result && (
        <div className={`mt-4 rounded-xl border p-3 text-xs ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-1.5 font-bold mb-1">
            {result.success
              ? <><CheckCircle size={13} className="text-green-600" /><span className="text-green-700">Seed successful</span></>
              : <><XCircle size={13} className="text-red-600" /><span className="text-red-700">Seed failed or partial</span></>
            }
          </div>

          {result.message && (
            <p className="text-gray-600 mb-1">{result.message}</p>
          )}

          {result.errors && result.errors.length > 0 && (
            <ul className="text-red-600 space-y-0.5 mt-1">
              {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}

          {result.accounts && result.accounts.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowAccounts(!showAccounts)}
                className="flex items-center gap-1 text-green-700 font-semibold hover:text-green-800"
              >
                {showAccounts ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showAccounts ? 'Hide' : 'Show'} accounts
              </button>
              {showAccounts && (
                <div className="mt-2 space-y-2">
                  <p className="text-gray-500 mb-1">
                    Password: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-800">{result.password}</code>
                  </p>
                  {result.accounts.map((a) => (
                    <div key={a.email} className="bg-white border border-green-100 rounded-lg px-3 py-2 space-y-0.5">
                      <p className="font-semibold text-gray-800">{a.name}</p>
                      <p className="text-gray-500 font-mono">{a.email}</p>
                      <p className="text-gray-400">{a.program}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
