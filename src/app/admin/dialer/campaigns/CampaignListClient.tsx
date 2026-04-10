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
      setCampaigns(json.campaigns ?? [])
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
      setCampaigns(c => [{ ...json.campaign, status_counts: {} }, ...c])
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

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-gray-400" />
    </div>
  )

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 space-y-6">

        {/* Header + create button */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Campaigns</h1>
            <p className="text-sm text-gray-400 mt-0.5">{activeCampaigns.length} active</p>
          </div>
          <button
            onClick={() => setShowNew(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
          >
            <Plus size={16} /> New Campaign
          </button>
        </div>

        {/* KPI strip */}
        <DialerKpiStrip />

        {/* Create form */}
        {showNew && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-3">
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
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-16 text-center">
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
              const dialed = (c.status_counts.attempted ?? 0) + (c.status_counts.contacted ?? 0)
                           + (c.status_counts.interested ?? 0) + (c.status_counts.callback ?? 0)
                           + (c.status_counts.follow_up ?? 0) + (c.status_counts.qualified ?? 0)
                           + (c.status_counts.promoted ?? 0) + (c.status_counts.dnc ?? 0)
                           + (c.status_counts.closed_lost ?? 0)
              const pct = c.lead_count > 0 ? Math.round((dialed / c.lead_count) * 100) : 0

              return (
                <div key={c.id} className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
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

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span className="flex items-center gap-1"><Users size={11} /> {c.lead_count} leads</span>
                      <span>{dialed} dialed · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {/* Status chips */}
                  <div className="flex gap-1.5 flex-wrap mb-4">
                    {[
                      ['new','New','bg-gray-100 text-gray-600'],
                      ['attempted','Attempted','bg-orange-100 text-orange-700'],
                      ['interested','Interested','bg-green-100 text-green-700'],
                      ['callback','Callback','bg-cyan-100 text-cyan-700'],
                      ['qualified','Qualified','bg-purple-100 text-purple-700'],
                      ['promoted','Promoted','bg-teal-100 text-teal-700'],
                      ['dnc','DNC','bg-red-100 text-red-700'],
                    ].map(([key, label, cls]) =>
                      (c.status_counts[key] ?? 0) > 0 ? (
                        <span key={key} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cls)}>
                          {label} {c.status_counts[key]}
                        </span>
                      ) : null
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/dialer/campaigns/${c.id}`}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors"
                    >
                      Manage <ChevronRight size={14} />
                    </Link>
                    {c.status === 'active' && c.lead_count > 0 && (
                      <Link
                        href={`/admin/dialer/queue?campaign_id=${c.id}`}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-700 transition-colors"
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
                <div key={c.id} className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 flex items-center justify-between opacity-60 hover:opacity-80 transition-opacity">
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
