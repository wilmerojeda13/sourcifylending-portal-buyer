'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Play, Pause, CheckCircle2, Users, Plus, Loader2,
  Phone, Trash2, RefreshCw, Upload, CheckSquare, Square, Copy, ArrowRight, X,
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
    blocked_until_label?: string | null
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

const OUTCOME_OPTIONS = [
  { key: 'new',         label: 'Never Dialed' },
  { key: 'attempted',   label: 'Attempted — No Answer' },
  { key: 'contacted',   label: 'Contacted' },
  { key: 'interested',  label: 'Interested' },
  { key: 'callback',    label: 'Callback Scheduled' },
  { key: 'follow_up',   label: 'Follow Up' },
  { key: 'qualified',   label: 'Qualified (not in CRM)' },
]

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h =>
    h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, '_')
  )
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

function normalizeRow(row: Record<string, string>) {
  const g = (...keys: string[]) => {
    for (const k of keys) {
      const v = row[k] || row[k.replace(/_/g, '')] || row[k.replace(/_/g, ' ')]
      if (v?.trim()) return v.trim()
    }
    return ''
  }
  return {
    first_name:    g('first_name', 'firstname', 'fname', 'name', 'first'),
    last_name:     g('last_name', 'lastname', 'lname', 'last') || null,
    phone:         g('phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'telephone'),
    email:         g('email', 'email_address', 'emailaddress') || null,
    business_name: g('business_name', 'businessname', 'company', 'company_name', 'business') || null,
    notes:         g('notes', 'note', 'comments', 'comment') || null,
  }
}

export default function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign]         = useState<Campaign | null>(null)
  const [leads, setLeads]               = useState<CampaignLead[]>([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<'leads' | 'add' | 'import'>('leads')
  const [rawLeads, setRawLeads]         = useState<RawLead[]>([])
  const [rawLoading, setRawLoading]     = useState(false)
  const [addSelected, setAddSelected]   = useState<Set<string>>(new Set())
  const [adding, setAdding]             = useState(false)
  const [rawSearch, setRawSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Bulk select (leads tab)
  const [bulkSel, setBulkSel]   = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)

  // Create-from-outcomes modal
  const [showModal, setShowModal]           = useState(false)
  const [fromStatuses, setFromStatuses]     = useState<Set<string>>(new Set())
  const [fromName, setFromName]             = useState('')
  const [creatingFrom, setCreatingFrom]     = useState(false)

  // CSV import
  const [importText, setImportText]         = useState('')
  const [importParsed, setImportParsed]     = useState<ReturnType<typeof normalizeRow>[]>([])
  const [importing, setImporting]           = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
      const p = new URLSearchParams({ limit: '500', show_all: 'false' })
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

  async function addExistingLeads() {
    if (addSelected.size === 0) return
    setAdding(true)
    try {
      const res  = await fetch(`/api/admin/dialer/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_lead_ids: Array.from(addSelected) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Added ${json.added} leads`)
      setAddSelected(new Set())
      setTab('leads')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  async function importLeads() {
    if (!importParsed.length) return
    setImporting(true)
    try {
      const res  = await fetch(`/api/admin/dialer/campaigns/${campaignId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: importParsed }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Imported ${json.imported} leads${json.skipped ? ` · ${json.skipped} duplicates skipped` : ''}`)
      setImportText('')
      setImportParsed([])
      setTab('leads')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function bulkAction(action: 'remove' | 'reset') {
    if (!bulkSel.size) return
    setBulkActing(true)
    try {
      const res = await fetch(`/api/admin/dialer/campaigns/${campaignId}/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, lead_ids: Array.from(bulkSel) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`${action === 'remove' ? 'Removed' : 'Reset'} ${json.updated} leads`)
      setBulkSel(new Set())
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk action failed')
    } finally {
      setBulkActing(false)
    }
  }

  async function createFromOutcomes() {
    if (!fromName.trim() || !fromStatuses.size) return
    setCreatingFrom(true)
    try {
      const res = await fetch('/api/admin/dialer/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fromName.trim(),
          from_campaign_id: campaignId,
          outcome_statuses: Array.from(fromStatuses),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Campaign "${fromName.trim()}" created with ${json.lead_count} leads`)
      setShowModal(false)
      setFromName('')
      setFromStatuses(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create campaign')
    } finally {
      setCreatingFrom(false)
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

  const allBulkSelected = filteredLeads.length > 0 && bulkSel.size === filteredLeads.length
  function toggleBulk(id: string) {
    setBulkSel(s => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns })
  }
  function toggleAllBulk() {
    setBulkSel(allBulkSelected ? new Set() : new Set(filteredLeads.map(l => l.id)))
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-5 sm:px-6">

        {/* Breadcrumb */}
        <Link href="/admin/dialer/campaigns" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 mb-4">
          <ChevronLeft size={13} /> Campaigns
        </Link>

        {/* Campaign header */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-100">{campaign.name}</h1>
                <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize', STATUS_BADGE[campaign.status])}>
                  {campaign.status}
                </span>
              </div>
              {campaign.description && (
                <p className="text-sm text-gray-400 mt-0.5">{campaign.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Users size={11} /> {campaign.lead_count} leads
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {campaign.status === 'active' && (
                <button onClick={() => updateCampaignStatus('paused')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-yellow-400 bg-yellow-900/30 border border-yellow-700 rounded-lg hover:bg-yellow-900/50">
                  <Pause size={13} /> Pause
                </button>
              )}
              {campaign.status === 'paused' && (
                <button onClick={() => updateCampaignStatus('active')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400 bg-green-900/30 border border-green-700 rounded-lg hover:bg-green-900/50">
                  <Play size={13} /> Resume
                </button>
              )}
              {!['completed','archived'].includes(campaign.status) && (
                <button onClick={() => updateCampaignStatus('completed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-900/30 border border-blue-700 rounded-lg hover:bg-blue-900/50">
                  <CheckCircle2 size={13} /> Complete
                </button>
              )}
              <button onClick={load} className="p-2 text-gray-500 hover:text-gray-200 rounded-lg hover:bg-gray-800">
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

          {/* CTA row */}
          <div className="mt-4 pt-4 border-t border-gray-800 flex items-center gap-3 flex-wrap">
            {campaign.status === 'active' && dialableCount > 0 && (
              <Link
                href={`/admin/dialer/queue?campaign_id=${campaign.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white text-sm font-semibold rounded-xl hover:bg-gray-600 transition-colors"
              >
                <Play size={15} /> Start Dialing · {dialableCount} ready
              </Link>
            )}
            {leads.length > 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-400 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-700"
              >
                <Copy size={13} /> Clone leads → new campaign
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {([['leads','Campaign Leads'],['add','Add Existing'],['import','Import CSV']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-xl transition-colors',
                tab === key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
              )}>
              {label}
            </button>
          ))}
        </div>

        {/* Leads tab */}
        {tab === 'leads' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            {/* Status filter */}
            <div className="px-4 py-3 border-b border-gray-800 flex gap-1.5 overflow-x-auto">
              {['all', 'new', 'attempted', 'contacted', 'interested', 'callback', 'follow_up', 'qualified', 'promoted', 'dnc'].map(s => (
                <button key={s} onClick={() => { setStatusFilter(s); setBulkSel(new Set()) }}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                    statusFilter === s ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
                  )}>
                  {s === 'all' ? `All (${leads.length})` : `${s.replace('_',' ')} (${campaign.status_counts[s] ?? 0})`}
                </button>
              ))}
            </div>

            {/* Bulk action bar */}
            {bulkSel.size > 0 && (
              <div className="px-4 py-2.5 bg-blue-950/40 border-b border-blue-900/60 flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-blue-300">{bulkSel.size} selected</span>
                {!allBulkSelected && (
                  <button onClick={toggleAllBulk} className="text-xs text-blue-400 underline">
                    Select all {filteredLeads.length}
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={() => bulkAction('reset')} disabled={bulkActing}
                    className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50">
                    Reset to New
                  </button>
                  <button onClick={() => bulkAction('remove')} disabled={bulkActing}
                    className="px-3 py-1.5 text-xs font-medium text-red-400 bg-red-950/40 border border-red-800 rounded-lg hover:bg-red-900/40 disabled:opacity-50">
                    Remove
                  </button>
                  {bulkActing && <Loader2 size={13} className="animate-spin text-gray-500" />}
                  <button onClick={() => setBulkSel(new Set())} className="text-xs text-gray-500 hover:text-gray-300">
                    Clear
                  </button>
                </div>
              </div>
            )}

            {filteredLeads.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {leads.length === 0 ? 'No leads in this campaign yet.' : 'No leads match this filter.'}
                </p>
                {leads.length === 0 && (
                  <div className="flex gap-2 justify-center mt-3">
                    <button onClick={() => setTab('add')}
                      className="px-4 py-2 text-xs font-semibold text-gray-300 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-700">
                      Add Existing
                    </button>
                    <button onClick={() => setTab('import')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-gray-700 rounded-xl hover:bg-gray-600">
                      Import CSV
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/50 border-b border-gray-800">
                    <th className="w-10 px-4 py-2.5">
                      <button onClick={toggleAllBulk} className="text-gray-500 hover:text-gray-300">
                        {allBulkSelected ? <CheckSquare size={15} className="text-blue-500" /> : <Square size={15} />}
                      </button>
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Last Called</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredLeads.map(l => (
                    <tr key={l.id} className={cn('hover:bg-gray-800/40', bulkSel.has(l.id) && 'bg-blue-950/30')}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleBulk(l.id)} className="text-gray-500 hover:text-gray-300">
                          {bulkSel.has(l.id) ? <CheckSquare size={15} className="text-blue-500" /> : <Square size={15} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-100">{l.raw_lead.first_name} {l.raw_lead.last_name ?? ''}</p>
                        {l.raw_lead.business_name && <p className="text-xs text-gray-400">{l.raw_lead.business_name}</p>}
                        {l.raw_lead.call_window_status === 'blocked' && (
                          <span className="text-[10px] text-orange-400">{l.raw_lead.blocked_until_label ?? 'Outside call window'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-300">
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
                          className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg hover:bg-red-900/30 transition-colors"
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

        {/* Add existing tab */}
        {tab === 'add' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
              <input
                type="text"
                value={rawSearch}
                onChange={e => setRawSearch(e.target.value)}
                placeholder="Search by name, phone, business…"
                className="flex-1 px-3 py-2 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 placeholder:text-gray-500"
              />
              <button onClick={loadRawLeads} className="p-2 text-gray-500 hover:text-gray-200 rounded-lg hover:bg-gray-800">
                <RefreshCw size={14} />
              </button>
              {addSelected.size > 0 && (
                <button onClick={addExistingLeads} disabled={adding}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 text-white text-sm font-semibold rounded-xl hover:bg-gray-600 disabled:opacity-60 whitespace-nowrap">
                  <Plus size={14} /> {adding ? 'Adding…' : `Add ${addSelected.size}`}
                </button>
              )}
            </div>
            {rawLoading ? (
              <div className="py-12 flex justify-center"><Loader2 size={22} className="animate-spin text-gray-400" /></div>
            ) : rawLeads.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                No available leads.{' '}
                <button onClick={() => setTab('import')} className="underline text-gray-300">Import CSV instead.</button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/50 border-b border-gray-800">
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox"
                        checked={addSelected.size === rawLeads.length && rawLeads.length > 0}
                        onChange={e => setAddSelected(e.target.checked ? new Set(rawLeads.map(l => l.id)) : new Set())}
                        className="rounded" />
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {rawLeads.map(l => (
                    <tr key={l.id} className={cn('hover:bg-gray-800/40', addSelected.has(l.id) && 'bg-blue-950/30')}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={addSelected.has(l.id)}
                          onChange={e => setAddSelected(s => {
                            const ns = new Set(s); e.target.checked ? ns.add(l.id) : ns.delete(l.id); return ns
                          })} className="rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-100">{l.first_name} {l.last_name ?? ''}</p>
                        {l.business_name && <p className="text-xs text-gray-400">{l.business_name}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-300">
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

        {/* Import CSV tab */}
        {tab === 'import' && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-300 mb-1">Import CSV into this campaign</h2>
              <p className="text-xs text-gray-500 mb-4">
                Required columns: <code className="bg-gray-800 px-1 rounded">first_name</code>, <code className="bg-gray-800 px-1 rounded">phone</code>.
                Optional: last_name, email, business_name, notes. Duplicate phones are skipped.
              </p>
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 mb-3 bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-xl hover:bg-gray-700">
                <Upload size={14} /> Choose CSV File
              </button>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const reader = new FileReader()
                  reader.onload = ev => {
                    const text = ev.target?.result as string ?? ''
                    setImportText(text)
                    const rows = parseCSV(text)
                    setImportParsed(rows.map(normalizeRow).filter(r => r.first_name && r.phone))
                  }
                  reader.readAsText(f)
                }}
              />
              <textarea value={importText} onChange={e => {
                  setImportText(e.target.value)
                  const rows = parseCSV(e.target.value)
                  setImportParsed(rows.map(normalizeRow).filter(r => r.first_name && r.phone))
                }}
                placeholder={'Paste CSV here…\nfirst_name,last_name,phone,email\nJohn,Doe,5551234567,john@example.com'}
                rows={6}
                className="w-full px-3 py-2.5 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 placeholder:text-gray-600 font-mono resize-none"
              />
            </div>

            {importParsed.length > 0 && (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-300">{importParsed.length} leads ready</p>
                  <button onClick={importLeads} disabled={importing}
                    className="flex items-center gap-1.5 px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-600 disabled:opacity-60">
                    {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {importing ? 'Importing…' : `Import ${importParsed.length} leads`}
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800/50 border-b border-gray-800">
                      <th className="text-left px-4 py-2 text-gray-500 font-semibold uppercase tracking-wide">Name</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-semibold uppercase tracking-wide">Phone</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-semibold uppercase tracking-wide hidden sm:table-cell">Business</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {importParsed.slice(0, 8).map((l, i) => (
                      <tr key={i} className="hover:bg-gray-800/40">
                        <td className="px-4 py-2 text-gray-200">{l.first_name} {l.last_name ?? ''}</td>
                        <td className="px-4 py-2 text-gray-300">{l.phone}</td>
                        <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{l.business_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importParsed.length > 8 && (
                  <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-800">+ {importParsed.length - 8} more rows</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create-from-outcomes modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100 text-sm">Create campaign from outcomes</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Copy leads with selected outcomes from <span className="text-gray-300">“{campaign.name}”</span> into a new campaign at status “New”.
            </p>
            <div className="space-y-1 mb-4">
              {OUTCOME_OPTIONS.filter(o => (campaign.status_counts[o.key] ?? 0) > 0).map(o => (
                <label key={o.key} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-800 cursor-pointer">
                  <input type="checkbox" checked={fromStatuses.has(o.key)}
                    onChange={e => setFromStatuses(s => {
                      const ns = new Set(s); e.target.checked ? ns.add(o.key) : ns.delete(o.key); return ns
                    })} className="rounded" />
                  <span className="text-sm text-gray-300">{o.label}</span>
                  <span className="ml-auto text-xs text-gray-500">{campaign.status_counts[o.key]}</span>
                </label>
              ))}
            </div>
            <input type="text" value={fromName} onChange={e => setFromName(e.target.value)}
              placeholder="New campaign name…"
              className="w-full px-3 py-2.5 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 placeholder:text-gray-500 mb-4"
              autoFocus />
            <div className="flex gap-3">
              <button onClick={createFromOutcomes}
                disabled={!fromName.trim() || !fromStatuses.size || creatingFrom}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-700 text-white text-sm font-semibold rounded-xl hover:bg-gray-600 disabled:opacity-50">
                {creatingFrom
                  ? <><Loader2 size={13} className="animate-spin" /> Creating…</>
                  : <><ArrowRight size={13} /> Create Campaign</>}
              </button>
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
