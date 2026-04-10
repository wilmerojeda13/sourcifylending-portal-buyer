'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Play, Pause, CheckCircle2, Users, Plus, Loader2,
  Phone, Trash2, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

type CampaignStatus  = 'active' | 'paused' | 'completed' | 'archived'
type CampaignLeadStatus =
  | 'new' | 'attempted' | 'contacted' | 'interested'
  | 'callback' | 'follow_up' | 'qualified'
  | 'promoted' | 'dnc' | 'closed_lost'

interface Campaign {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  lead_count: number
  status_counts: Record<string, number>
}

interface CampaignLead {
  id: string
  campaign_id: string
  raw_lead_id: string
  status: CampaignLeadStatus
  last_call_outcome: string | null
  last_called_at: string | null
  callback_due_at: string | null
  notes: string | null
  raw_lead: {
    id: string
    first_name: string
    last_name: string | null
    phone: string
    email: string | null
    business_name: string | null
    do_not_call: boolean
    promoted_to_crm_lead_id: string | null
    call_window_status?: string | null
    likely_timezone?: string | null
  }
}

interface RawLead {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  business_name: string | null
  stage: string
  do_not_call: boolean
  promoted_to_crm_lead_id: string | null
}

const STATUS_COLORS: Record<string, string> = {
  new:          'bg-gray-100 text-gray-600',
  attempted:    'bg-orange-100 text-orange-700',
  contacted:    'bg-blue-100 text-blue-700',
  interested:   'bg-green-100 text-green-700',
  callback:     'bg-cyan-100 text-cyan-700',
  follow_up:    'bg-yellow-100 text-yellow-700',
  qualified:    'bg-purple-100 text-purple-700',
  promoted:     'bg-teal-100 text-teal-700',
  dnc:          'bg-red-100 text-red-700',
  closed_lost:  'bg-gray-200 text-gray-500',
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  active:    'bg-green-100 text-green-700',
  paused:    'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  archived:  'bg-gray-100 text-gray-500',
}

export default function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign]         = useState<Campaign | null>(null)
  const [leads, setLeads]               = useState<CampaignLead[]>([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<'leads' | 'add'>('leads')
  const [rawLeads, setRawLeads]         = useState<RawLead[]>([])
  const [rawLoading, setRawLoading]     = useState(false)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [adding, setAdding]             = useState(false)
  const [rawSearch, setRawSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const load = useCallback(async () => {
    try {
      const [camRes, leadsRes] = await Promise.all([
        fetch(`/api/admin/dialer/campaigns/${campaignId}`),
        fetch(`/api/admin/dialer/campaigns/${campaignId}/leads`),
      ])
      const [camJson, leadsJson] = await Promise.all([camRes.json(), leadsRes.json()])
      if (!camRes.ok) throw new Error(camJson.error)
      setCampaign(camJson.campaign)
      setLeads(leadsJson.leads ?? [])
    } catch {
      toast.error('Failed to load campaign')
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { load() }, [load])

  // Load raw leads when Add tab opens
  const loadRawLeads = useCallback(async () => {
    setRawLoading(true)
    try {
      const p = new URLSearchParams({ limit: '200' })
      if (rawSearch) p.set('search', rawSearch)
      const res  = await fetch(`/api/admin/dialer/leads?${p}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // Filter out ones already in campaign
      const inCampaign = new Set(leads.map(l => l.raw_lead_id))
      setRawLeads((json.leads ?? []).filter((l: RawLead) => !inCampaign.has(l.id)))
    } catch {
      toast.error('Failed to load leads')
    } finally {
      setRawLoading(false)
    }
  }, [rawSearch, leads])

  useEffect(() => {
    if (tab === 'add') loadRawLeads()
  }, [tab, loadRawLeads])

  async function addSelected() {
    if (selected.size === 0) return
    setAdding(true)
    try {
      const res  = await fetch(`/api/admin/dialer/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_lead_ids: Array.from(selected) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Added ${json.added} leads`)
      setSelected(new Set())
      setTab('leads')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  async function removeLead(rawLeadId: string) {
    try {
      const res = await fetch(`/api/admin/dialer/campaigns/${campaignId}/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_lead_id: rawLeadId }),
      })
      if (!res.ok) throw new Error('Failed')
      setLeads(ls => ls.filter(l => l.raw_lead_id !== rawLeadId))
      setCampaign(c => c ? { ...c, lead_count: Math.max(c.lead_count - 1, 0) } : c)
      toast.success('Lead removed')
    } catch {
      toast.error('Failed to remove lead')
    }
  }

  async function updateCampaignStatus(status: CampaignStatus) {
    try {
      const res  = await fetch(`/api/admin/dialer/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCampaign(c => c ? { ...c, status } : c)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-gray-400" />
    </div>
  )

  if (!campaign) return (
    <div className="flex-1 flex items-center justify-center py-20 text-gray-400">
      Campaign not found.{' '}
      <Link href="/admin/dialer/campaigns" className="ml-1 text-gray-600 underline">Back to Campaigns</Link>
    </div>
  )

  const filteredLeads = statusFilter === 'all'
    ? leads
    : leads.filter(l => l.status === statusFilter)

  const dialableCount = leads.filter(l =>
    ['new', 'attempted', 'callback', 'follow_up'].includes(l.status)
  ).length

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-5 sm:px-6">

        {/* Breadcrumb */}
        <Link href="/admin/dialer/campaigns" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4">
          <ChevronLeft size={13} /> Campaigns
        </Link>

        {/* Campaign header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{campaign.name}</h1>
                <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize', STATUS_BADGE[campaign.status])}>
                  {campaign.status}
                </span>
              </div>
              {campaign.description && (
                <p className="text-sm text-gray-500 mt-0.5">{campaign.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Users size={11} /> {campaign.lead_count} leads
              </p>
            </div>

            <div className="flex items-center gap-2">
              {campaign.status === 'active' && (
                <button onClick={() => updateCampaignStatus('paused')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100">
                  <Pause size={13} /> Pause
                </button>
              )}
              {campaign.status === 'paused' && (
                <button onClick={() => updateCampaignStatus('active')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100">
                  <Play size={13} /> Resume
                </button>
              )}
              {!['completed','archived'].includes(campaign.status) && (
                <button onClick={() => updateCampaignStatus('completed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
                  <CheckCircle2 size={13} /> Complete
                </button>
              )}
              <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Status count pills */}
          <div className="flex gap-1.5 flex-wrap mt-4">
            {Object.entries(STATUS_COLORS).map(([key, cls]) =>
              (campaign.status_counts[key] ?? 0) > 0 ? (
                <span key={key} className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', cls)}>
                  {key.replace('_',' ')} {campaign.status_counts[key]}
                </span>
              ) : null
            )}
          </div>

          {/* Start dialing CTA */}
          {campaign.status === 'active' && dialableCount > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <Link
                href={`/admin/dialer/queue?campaign_id=${campaign.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
              >
                <Play size={15} /> Start Dialing · {dialableCount} leads ready
              </Link>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {[['leads', 'Campaign Leads'], ['add', 'Add Leads']] .map(([key, label]) => (
            <button key={key} onClick={() => setTab(key as 'leads' | 'add')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-xl transition-colors',
                tab === key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
              )}>
              {label}
            </button>
          ))}
        </div>

        {/* Leads tab */}
        {tab === 'leads' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Status filter */}
            <div className="px-4 py-3 border-b border-gray-100 flex gap-1.5 overflow-x-auto">
              {['all', 'new', 'attempted', 'interested', 'callback', 'qualified', 'promoted', 'dnc'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                    statusFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}>
                  {s === 'all' ? `All (${leads.length})` : `${s.replace('_',' ')} (${campaign.status_counts[s] ?? 0})`}
                </button>
              ))}
            </div>

            {filteredLeads.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {leads.length === 0 ? 'No leads in this campaign yet.' : 'No leads match this filter.'}
                </p>
                {leads.length === 0 && (
                  <button onClick={() => setTab('add')}
                    className="mt-3 px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-700">
                    Add Leads
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Last Called</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLeads.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{l.raw_lead.first_name} {l.raw_lead.last_name ?? ''}</p>
                        {l.raw_lead.business_name && <p className="text-xs text-gray-400">{l.raw_lead.business_name}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-600">
                        <span className="flex items-center gap-1"><Phone size={11} /> {l.raw_lead.phone}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', STATUS_COLORS[l.status] ?? 'bg-gray-100 text-gray-500')}>
                          {l.status.replace('_',' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-400">
                        {l.last_called_at ? new Date(l.last_called_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => removeLead(l.raw_lead_id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Remove from campaign">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Add leads tab */}
        {tab === 'add' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <input
                type="text"
                value={rawSearch}
                onChange={e => setRawSearch(e.target.value)}
                placeholder="Search leads by name, phone, business…"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400"
              />
              <button onClick={loadRawLeads} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                <RefreshCw size={14} />
              </button>
              {selected.size > 0 && (
                <button onClick={addSelected} disabled={adding}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-60 whitespace-nowrap">
                  <Plus size={14} /> {adding ? 'Adding…' : `Add ${selected.size}`}
                </button>
              )}
            </div>

            {rawLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 size={22} className="animate-spin text-gray-400" />
              </div>
            ) : rawLeads.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No available leads to add.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox"
                        checked={selected.size === rawLeads.length}
                        onChange={e => setSelected(e.target.checked ? new Set(rawLeads.map(l => l.id)) : new Set())}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rawLeads.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <input type="checkbox"
                          checked={selected.has(l.id)}
                          onChange={e => setSelected(s => {
                            const ns = new Set(s)
                            e.target.checked ? ns.add(l.id) : ns.delete(l.id)
                            return ns
                          })}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{l.first_name} {l.last_name ?? ''}</p>
                        {l.business_name && <p className="text-xs text-gray-400">{l.business_name}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-600">
                        <span className="flex items-center gap-1"><Phone size={11} /> {l.phone}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-400">{l.stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
