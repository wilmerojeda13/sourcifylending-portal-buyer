'use client'

import { useState } from 'react'
import { Users, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface MigrateResult {
  success: boolean
  message?: string
  migrated?: string[]
  errors?: string[]
}

export default function MigrateClientsButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MigrateResult | null>(null)

  const handleMigrate = async () => {
    if (!confirm('Migrate Arnold Mswia, Alexander De Armas, and Bruce Thomas into the portal? This is safe to run more than once.')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/migrate-clients', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ success: false, errors: ['Network error — could not reach migration endpoint.'] })
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
          <Users size={20} className="text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Migrate Active Clients</h3>
          <p className="text-xs text-gray-500 leading-snug">Import Arnold, Alexander, and Bruce from Notion into the portal with their current stages and tasks</p>
        </div>
      </div>

      <button
        onClick={handleMigrate}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
      >
        {loading ? (
          <><Loader2 size={15} className="animate-spin" /> Migrating…</>
        ) : (
          <><Users size={15} /> Migrate Clients</>
        )}
      </button>

      {result && (
        <div className={`mt-4 rounded-xl border p-3 text-xs ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-1.5 font-bold mb-1">
            {result.success
              ? <><CheckCircle size={13} className="text-green-600" /><span className="text-green-700">Migration successful</span></>
              : <><XCircle size={13} className="text-red-600" /><span className="text-red-700">Migration failed or partial</span></>
            }
          </div>
          {result.message && <p className="text-gray-600 mb-1">{result.message}</p>}
          {result.migrated && result.migrated.length > 0 && (
            <ul className="text-green-700 space-y-0.5 mt-1">
              {result.migrated.map((name, i) => <li key={i}>✓ {name}</li>)}
            </ul>
          )}
          {result.errors && result.errors.length > 0 && (
            <ul className="text-red-600 space-y-0.5 mt-1">
              {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
