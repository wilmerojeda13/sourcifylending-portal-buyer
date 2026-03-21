'use client'

import { useState } from 'react'
import { UserCheck, Loader2, Copy, Check } from 'lucide-react'

const DEMO_ACCOUNTS = [
  { label: 'Alex Mercer', sub: 'Program A — 0% APR', email: 'demo-a@sourcifylending.com', color: 'bg-blue-500' },
  { label: 'Brianna Cole', sub: 'Program B — Biz Credit', email: 'demo-b@sourcifylending.com', color: 'bg-purple-500' },
  { label: 'Carlos Vega', sub: 'Program C — Monitoring', email: 'demo-c@sourcifylending.com', color: 'bg-green-500' },
  { label: 'Alex Rivera', sub: 'Dual A+B — Switch Program', email: 'demo@sourcifylending.com', color: 'bg-orange-500' },
]

export default function DemoLoginPanel() {
  const [loading, setLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (email: string, name: string) => {
    setLoading(email)
    setError(null)
    try {
      const res = await fetch('/api/admin/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.url) {
        await navigator.clipboard.writeText(data.url)
        setCopied(email)
        setTimeout(() => setCopied(null), 4000)
      } else {
        setError(data.error || 'Failed to generate login link')
      }
    } catch {
      setError('Network error')
    }
    setLoading(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shrink-0">
          <UserCheck size={20} className="text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Quick Demo Access</h3>
          <p className="text-xs text-gray-500 leading-snug">Copy a magic link → paste in a Private/Incognito window</p>
        </div>
      </div>

      <div className="space-y-2">
        {DEMO_ACCOUNTS.map((account) => {
          const isCopied = copied === account.email
          const isLoading = loading === account.email
          return (
            <button
              key={account.email}
              onClick={() => handleLogin(account.email, account.label)}
              disabled={loading !== null}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all disabled:opacity-60 group ${
                isCopied
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-6 h-6 ${account.color} rounded-full flex items-center justify-center shrink-0`}>
                  <span className="text-[10px] font-bold text-white">{account.label.charAt(0)}</span>
                </div>
                <div className="text-left min-w-0">
                  <p className={`text-xs font-semibold truncate ${isCopied ? 'text-green-700' : 'text-gray-800'}`}>
                    {isCopied ? 'Link copied!' : account.label}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {isCopied ? 'Paste in Private/Incognito window' : account.sub}
                  </p>
                </div>
              </div>
              {isLoading ? (
                <Loader2 size={13} className="text-indigo-500 animate-spin shrink-0" />
              ) : isCopied ? (
                <Check size={13} className="text-green-500 shrink-0" />
              ) : (
                <Copy size={13} className="text-gray-300 group-hover:text-indigo-400 transition-colors shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
        Ctrl+Shift+N (Windows) · ⌘+Shift+N (Mac) to open incognito
      </p>

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
