'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Megaphone, Plus, Play, Pause, CheckCircle2, Archive, ChevronRight, Loader2, Users, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import DialerKpiStrip from '@/components/dialer/DialerKpiStrip'

type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived'

interface Campaign {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  lead_count: number
  created_at: string
  updated_at: string
  status_counts: Record<string, number>
}

function normalizeCampaign(input: Partial<Campaign> & { id: string; name?: string }) {
  return {
    ...input,
    name: input.name ?? 'Untitled campaign',
    description: input.description ?? null,
    status: input.status ?? 'paused',
    lead_count: Number(input.lead_count) || 0,
    created_at: input.created_at ?? new Date(0).toISOString(),
    updated_at: input.updated_at ?? new Date(0).toISOString(),
    status_counts: input.status_counts && typeof input.status_counts === 'object'
      ? input.status_counts
      : {},
  } as Campaign
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  active:    'bg-green-100 text-green-700',
  paused:    'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  archived:  'bg-gray-100 text-gray-500',
}

export default function CampaignListClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading]     = useState(true)
  const [creating, setCreating]   = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const [name, setName]           = useState('')
  const [desc, setDesc]           = useState('')

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/admin/dialer/campaigns')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCampaigns((json.campaigns ?? []).map(normalizeCampaign))
    } catch {
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function createCampaign() {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res  = await fetch('/api/admin/dialer/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Campaign created')
      setName('')
      setDesc('')
      setShowNew(false)
      setCampaigns(c => [normalizeCampaign({ ...(json.campaign ?? {}), status_counts: {} }), ...c])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function deleteCampaign(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? This removes the campaign and all its lead assignments. Raw lead data is preserved.`)) return
    try {
      const res = await fetch(`/api/admin/dialer/campaigns/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Campaign deleted')
      setCampaigns(cs => cs.filter(c => c.id !== id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function setStatus(id: string, status: CampaignStatus) {
    try {
      const res  = await fetch(`/api/admin/dialer/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCampaigns(cs => cs.map(c => c.id === id ? { ...c, status } : c))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  const activeCampaigns   = campaigns.filter(c => c.status !== 'archived')
  const archivedCampaigns = campaigns.filter(c => c.status === 'archived')
  const queueReadyTotal = campaigns.reduce((sum, c) => sum
    + (c.status_counts?.new ?? 0)
    + (c.status_counts?.attempted ?? 0)
    + (c.status_counts?.callback ?? 0)
    + (c.status_counts?.follow_up ?? 0), 0)
  const qualifiedTotal = campaigns.reduce((sum, c) => sum + (c.status_counts?.qualified ?? 0), 0)
  const progressTotal = campaigns.reduce((sum, c) => sum + c.lead_count, 0)

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-gray-400" />
    </div>
  )

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 space-y-6">

        {/* Header + create button */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Operations</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Campaigns</h1>
            <p className="mt-2 text-sm text-gray-400">
              Live status, queue depth, and progress stay here. Reporting lives in Analytics.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/dialer/analytics"
              className="hidden rounded-lg border border-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900 sm:inline-flex"
            >
              Open Analytics
            </Link>
            <button
              onClick={() => setShowNew(v => !v)}
              className="flex items-center gap-2 rounded-lg border border-gray-700 bg-white px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-gray-200"
            >
              <Plus size={16} /> New Campaign
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-400/15 bg-[#111827] p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Active Campaigns</p>
            <p className="mt-2 text-3xl font-semibold text-white">{activeCampaigns.length}</p>
            <p className="mt-1 text-sm text-gray-400">Currently in workflow</p>
          </div>
          <div className="rounded-lg border border-sky-400/15 bg-[#111827] p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Queue Ready</p>
            <p className="mt-2 text-3xl font-semibold text-white">{queueReadyTotal.toLocaleString()}</p>
            <p className="mt-1 text-sm text-gray-400">Ready for dialing</p>
          </div>
          <div className="rounded-lg border border-fuchsia-400/15 bg-[#111827] p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Qualified / CRM Ready</p>
            <p className="mt-2 text-3xl font-semibold text-white">{qualifiedTotal.toLocaleString()}</p>
            <p className="mt-1 text-sm text-gray-400">{progressTotal.toLocaleString()} total assigned leads</p>
          </div>
        </div>

        <DialerKpiStrip />

        {/* Create form */}
        {showNew && (
          <div className="rounded-lg border border-sky-400/15 bg-[#111827] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-300">New Campaign</h2>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Campaign name (e.g. April MCA Push)"
              className="w-full px-4 py-2.5 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 placeholder:text-gray-500"
              autoFocus
            />
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-4 py-2.5 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 placeholder:text-gray-500 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={createCampaign}
                disabled={!name.trim() || creating}
                className="px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create Campaign'}
              </button>
              <button
                onClick={() => { setShowNew(false); setName(''); setDesc('') }}
                className="px-5 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {campaigns.length === 0 && !showNew && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-16 text-center">
            <Megaphone size={44} className="mx-auto mb-4 text-gray-600" />
            <h3 className="font-semibold text-gray-200 mb-1">No campaigns yet</h3>
            <p className="text-sm text-gray-400 mb-5">Create a campaign to start dialing raw leads.</p>
            <button
              onClick={() => setShowNew(true)}
              className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700"
            >
              Create First Campaign
            </button>
          </div>
        )}

        {/* Active campaigns */}
        {activeCampaigns.length > 0 && (
          <div className="space-y-3">
            {activeCampaigns.map(c => {
              const counts = c.status_counts ?? {}
              const dialed = (counts.attempted ?? 0) + (counts.contacted ?? 0)
                           + (counts.interested ?? 0) + (counts.callback ?? 0)
                           + (counts.follow_up ?? 0) + (counts.qualified ?? 0)
                           + (counts.promoted ?? 0) + (counts.dnc ?? 0)
                           + (counts.closed_lost ?? 0)
              const pct = c.lead_count > 0 ? Math.round((dialed / c.lead_count) * 100) : 0

              return (
                <div key={c.id} className="rounded-lg border border-gray-800 bg-[#111827] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-100 text-base">{c.name}</h3>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', STATUS_BADGE[c.status])}>
                          {c.status}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{c.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {c.status === 'active' && (
                        <button onClick={() => setStatus(c.id, 'paused')} title="Pause"
                          className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-900/30 rounded-lg transition-colors">
                          <Pause size={15} />
                        </button>
                      )}
                      {c.status === 'paused' && (
                        <button onClick={() => setStatus(c.id, 'active')} title="Resume"
                          className="p-2 text-gray-500 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors">
                          <Play size={15} />
                        </button>
                      )}
                      {c.status !== 'completed' && c.status !== 'archived' && (
                        <button onClick={() => setStatus(c.id, 'completed')} title="Mark complete"
                          className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-900/30 rounded-lg transition-colors">
                          <CheckCircle2 size={15} />
                        </button>
                      )}
                      {c.status === 'completed' && (
                        <button onClick={() => setStatus(c.id, 'archived')} title="Archive"
                          className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
                          <Archive size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-4 grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Assigned</p>
                      <p className="mt-1 flex items-center gap-1 text-lg font-semibold text-white">
                        <Users size={14} className="text-gray-500" />
                        {c.lead_count.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Queue Ready</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {(((c.status_counts?.new ?? 0) + (c.status_counts?.attempted ?? 0) + (c.status_counts?.callback ?? 0) + (c.status_counts?.follow_up ?? 0))).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Progress</p>
                      <p className="mt-1 text-lg font-semibold text-white">{pct}%</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">CRM Ready</p>
                      <p className="mt-1 text-lg font-semibold text-white">{(((c.status_counts?.qualified ?? 0) + (c.status_counts?.promoted ?? 0))).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                      <span>{dialed.toLocaleString()} dialed</span>
                      <span>{pct}% complete</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800/90 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {/* Status chips */}
                  <div className="flex gap-1.5 flex-wrap mb-4">
                    {[
                      ['new','New','border-gray-700 bg-gray-800 text-gray-300'],
                      ['attempted','Attempted','border-amber-400/20 bg-amber-400/10 text-amber-200'],
                      ['interested','Interested','border-emerald-400/20 bg-emerald-400/10 text-emerald-200'],
                      ['callback','Callback','border-sky-400/20 bg-sky-400/10 text-sky-200'],
                      ['qualified','Qualified','border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200'],
                      ['promoted','Promoted','border-cyan-400/20 bg-cyan-400/10 text-cyan-200'],
                      ['dnc','DNC','border-rose-400/20 bg-rose-400/10 text-rose-200'],
                    ].map(([key, label, cls]) =>
                      (counts[key as string] ?? 0) > 0 ? (
                        <span key={key} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', cls)}>
                          {label} {(counts[key as string] ?? 0)}
                        </span>
                      ) : null
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/dialer/campaigns/${c.id}`}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#0b1220] px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-[#111a2c]"
                    >
                      Manage <ChevronRight size={14} />
                    </Link>
                    {c.status === 'active' && c.lead_count > 0 && (
                      <Link
                        href={`/admin/dialer/queue?campaign_id=${c.id}`}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-emerald-400"
                      >
                        <Play size={14} /> Start Dialing
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Archived */}
        {archivedCampaigns.length > 0 && (
          <details className="group">
            <summary className="text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-300 select-none">
              Archived ({archivedCampaigns.length})
            </summary>
            <div className="mt-3 space-y-2">
              {archivedCampaigns.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#111827] px-4 py-3 opacity-60 transition-opacity hover:opacity-80">
                  <div>
                    <p className="text-sm font-medium text-gray-400">{c.name}</p>
                    <p className="text-xs text-gray-600">{c.lead_count} leads</p>
                  </div>
                  <button
                    onClick={() => deleteCampaign(c.id, c.name)}
                    title="Permanently delete"
                    className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
