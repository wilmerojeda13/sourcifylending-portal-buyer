'use client'
import { useState, useEffect } from 'react'
import { Activity, Phone, Clock, Loader2 } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  'in-progress': 'bg-green-100 text-green-700',
  ringing:       'bg-yellow-100 text-yellow-700',
  initiated:     'bg-blue-100 text-blue-700',
}

function useDuration(startedAt: string | null): string {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const update = () => {
      const diff = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
      setSecs(Math.max(0, diff))
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [startedAt])
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function CallCard({ call }: { call: Record<string, unknown> }) {
  const duration = useDuration(call.started_at as string | null)
  const lead = call.voice_leads as Record<string, string> | null
  const status = call.status as string

  return (
    <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-5 flex items-start gap-4">
      <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center shrink-0">
        <Phone size={22} className="text-green-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-bold text-gray-900 truncate">
            {lead?.business_name || lead?.owner_name || (call.to_number as string) || 'Unknown'}
          </p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-500'}`}>
            {status.replace('-', ' ').toUpperCase()}
          </span>
        </div>
        <p className="text-sm text-gray-500">{call.to_number as string}</p>
        {lead?.business_name && lead?.owner_name && (
          <p className="text-xs text-gray-400 mt-0.5">{lead.owner_name}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 text-gray-500 bg-gray-50 px-3 py-1.5 rounded-xl">
        <Clock size={14} />
        <span className="text-sm font-mono font-semibold">{duration}</span>
      </div>
    </div>
  )
}

export default function LiveCallsPage() {
  const [calls, setCalls] = useState<Record<string, unknown>[]>([])
  const [recent, setRecent] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadCalls = async () => {
    const [activeRes, recentRes] = await Promise.all([
      fetch('/api/voice/calls?status=in-progress&limit=20'),
      fetch(`/api/voice/calls?status=completed&limit=10`),
    ])
    if (activeRes.ok) { const d = await activeRes.json(); setCalls(d.calls ?? []) }
    if (recentRes.ok) { const d = await recentRes.json(); setRecent(d.calls ?? []) }
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    loadCalls()
    const t = setInterval(loadCalls, 3000)
    return () => clearInterval(t)
  }, [])

  const activeCalls = calls.filter(c => ['in-progress', 'ringing', 'initiated'].includes(c.status as string))

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Live Calls</h1>
          {activeCalls.length > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-red-100 rounded-full">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-red-600">{activeCalls.length} LIVE</span>
            </span>
          )}
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <Activity size={12} /> Auto-refreshes every 3s · {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin" /> Loading…
        </div>
      ) : activeCalls.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-16 text-center">
          <Phone size={48} className="text-gray-200 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-500 mb-2">No active calls</h3>
          <p className="text-sm text-gray-400">Calls appear here in real-time. Start a campaign or dial a lead to begin.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeCalls.map(call => <CallCard key={call.id as string} call={call} />)}
        </div>
      )}

      {/* Recently Completed */}
      {recent.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-sm">Recently Completed</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recent.map(call => {
              const lead = call.voice_leads as Record<string, string> | null
              const disp = call.disposition as string | null
              return (
                <div key={call.id as string} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{lead?.business_name || call.to_number as string || '—'}</p>
                    <p className="text-xs text-gray-400">{new Date(call.created_at as string).toLocaleTimeString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {disp && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{disp.replace(/_/g, ' ')}</span>}
                    {call.duration_seconds && <span className="text-xs text-gray-400">{call.duration_seconds as number}s</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
        <h3 className="font-semibold text-indigo-800 mb-2 text-sm">Voice Server Status</h3>
        <p className="text-xs text-indigo-600 leading-relaxed">
          The voice server runs separately on your configured WebSocket URL. Configure it in <a href="/admin/voice/settings" className="underline">Settings</a>.
          Check the health endpoint at <code className="bg-indigo-100 px-1 rounded">http://[your-server]:3002/health</code>
        </p>
      </div>
    </div>
  )
}
