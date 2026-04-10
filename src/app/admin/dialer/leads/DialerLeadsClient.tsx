'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Search, Phone, User, Building2, CheckSquare, Square, ChevronDown,
  Loader2, Ban, Archive, ArrowUpRight, Phone as PhoneIcon, RefreshCw,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

export type DialerStage = 'new' | 'contacted' | 'interested' | 'callback' | 'follow_up' | 'qualified' | 'promoted' | 'dnc' | 'closed_lost'

interface RawLead {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  email: string | null
  business_name: string | null
  source: string | null
  stage: DialerStage
  last_call_outcome: string | null
  last_call_at: string | null
  callback_due_at: string | null
  do_not_call: boolean
  is_archived: boolean
  promoted_to_crm_lead_id: string | null
  created_at: string
}

const STAGES: { key: DialerStage | 'all'; label: string; color: string }[] = [
  { key: 'all',         label: 'All',            color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { key: 'new',         label: 'New',            color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'contacted',   label: 'Contacted',      color: 'bg-gray-50 text-gray-600 border-gray-200' },
  { key: 'interested',  label: 'Interested',     color: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'callback',    label: 'Callback',       color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { key: 'follow_up',   label: 'Follow Up',      color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { key: 'qualified',   label: 'Qualified',      color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'promoted',    label: 'Promoted ✓',     color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { key: 'dnc',         label: 'DNC',            color: 'bg-red-50 text-red-700 border-red-200' },
  { key: 'closed_lost', label: 'Closed Lost',    color: 'bg-gray-50 text-gray-500 border-gray-200' },
]

const STAGE_BADGE: Record<string, string> = {
  new:         'bg-blue-100 text-blue-700',
  contacted:   'bg-gray-100 text-gray-600',
  interested:  'bg-green-100 text-green-700',
  callback:    'bg-cyan-100 text-cyan-700',
  follow_up:   'bg-yellow-100 text-yellow-700',
  qualified:   'bg-purple-100 text-purple-700',
  promoted:    'bg-teal-100 text-teal-700',
  dnc:         'bg-red-100 text-red-700',
  closed_lost: 'bg-gray-100 text-gray-500',
}

export default function DialerLeadsClient() {
  const [leads, setLeads] = useState<RawLead[]>([])
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<DialerStage | 'all'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false)
  const bulkMenuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchLeads = useCallback(async (q: string, stage: DialerStage | 'all') => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      p.set('show_all', 'true')
      if (q.trim()) p.set('search', q.trim())
      if (stage !== 'all') p.set('stage', stage)
      p.set('limit', '100')
      const res = await fetch(`/api/admin/dialer/leads?${p}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setLeads(json.leads ?? [])
      setTotal(json.total ?? 0)
      setStageCounts(json.stageCounts ?? {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeads(search, stageFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter])

  function handleSearchChange(val: string) {
    setSearch(val)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => fetchLeads(val, stageFilter), 350)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === leads.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(leads.map(l => l.id)))
    }
  }

  async function bulkAction(action: 'move_stage' | 'dnc' | 'archive', stage?: DialerStage) {
    if (selected.size === 0) return
    setBulkActing(true)
    setShowBulkMoveMenu(false)
    try {
      const res = await fetch('/api/admin/dialer/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action, stage }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`${json.updated} lead${json.updated !== 1 ? 's' : ''} updated`)
      setSelected(new Set())
      await fetchLeads(search, stageFilter)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk action failed')
    } finally {
      setBulkActing(false)
    }
  }

  // Close bulk move menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) {
        setShowBulkMoveMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allSelected = leads.length > 0 && selected.size === leads.length
  const someSelected = selected.size > 0

  return (
    <div className="flex-1 overflow-auto">
      {/* Stage count pills */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {STAGES.map(s => {
            const count = s.key === 'all'
              ? Object.values(stageCounts).reduce((a, b) => a + b, 0)
              : (stageCounts[s.key] ?? 0)
            const active = stageFilter === s.key
            return (
              <button
                key={s.key}
                onClick={() => { setStageFilter(s.key); setSelected(new Set()) }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-gray-900 text-white border-gray-900'
                    : `${s.color} hover:opacity-80`,
                )}
              >
                {s.label}
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-white/20 text-white' : 'bg-black/10',
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Search + actions bar */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, phone, email..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 bg-gray-50"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => fetchLeads(search, stageFilter)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          <Link
            href="/admin/dialer/import"
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Upload size={13} /> Import
          </Link>
          <Link
            href="/admin/dialer/queue"
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            <PhoneIcon size={13} /> Start Dialing
          </Link>
        </div>
      </div>

      {/* Bulk actions bar */}
      {someSelected && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 sm:px-6 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-blue-800">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Move stage */}
            <div className="relative" ref={bulkMenuRef}>
              <button
                onClick={() => setShowBulkMoveMenu(v => !v)}
                disabled={bulkActing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                Move Stage <ChevronDown size={13} />
              </button>
              {showBulkMoveMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-[160px] py-1">
                  {STAGES.filter(s => s.key !== 'all' && s.key !== 'promoted').map(s => (
                    <button
                      key={s.key}
                      onClick={() => bulkAction('move_stage', s.key as DialerStage)}
                      className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Mark DNC */}
            <button
              onClick={() => bulkAction('dnc')}
              disabled={bulkActing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Ban size={13} /> Mark DNC
            </button>
            {/* Archive */}
            <button
              onClick={() => bulkAction('archive')}
              disabled={bulkActing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Archive size={13} /> Archive
            </button>
            {bulkActing && <Loader2 size={14} className="animate-spin text-blue-600" />}
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-blue-600 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="px-4 sm:px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20">
            <User size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-500 font-medium">No leads found</p>
            <p className="text-sm text-gray-400 mt-1">
              {stageFilter !== 'all' || search
                ? 'Try changing the filter or search.'
                : 'Import a CSV to add leads.'}
            </p>
            {stageFilter === 'all' && !search && (
              <Link href="/admin/dialer/import" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">
                <Upload size={14} /> Import Raw Leads
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="w-10 px-3 py-3">
                      <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-600">
                        {allSelected
                          ? <CheckSquare size={15} className="text-blue-600" />
                          : <Square size={15} />
                        }
                      </button>
                    </th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Source</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Last Call</th>
                    <th className="w-10 px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map(lead => (
                    <tr
                      key={lead.id}
                      className={cn('hover:bg-gray-50 transition-colors', selected.has(lead.id) && 'bg-blue-50/50')}
                    >
                      <td className="px-3 py-3">
                        <button onClick={() => toggleSelect(lead.id)} className="text-gray-400 hover:text-gray-600">
                          {selected.has(lead.id)
                            ? <CheckSquare size={15} className="text-blue-600" />
                            : <Square size={15} />
                          }
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-900">
                          {lead.first_name} {lead.last_name ?? ''}
                        </p>
                        {lead.business_name && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Building2 size={11} /> {lead.business_name}
                          </p>
                        )}
                        {lead.promoted_to_crm_lead_id && (
                          <span className="text-[10px] text-teal-600 font-medium">In CRM ✓</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-1 text-gray-600 text-xs">
                          <Phone size={11} className="shrink-0 text-gray-400" />
                          {lead.phone}
                        </span>
                        {lead.email && (
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[160px]">{lead.email}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <span className="text-xs text-gray-500">{lead.source ?? '—'}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                          STAGE_BADGE[lead.stage] ?? 'bg-gray-100 text-gray-600',
                        )}>
                          {lead.stage.replace('_', ' ')}
                        </span>
                        {lead.last_call_outcome && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{lead.last_call_outcome}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="text-xs text-gray-400">
                          {lead.last_call_at
                            ? new Date(lead.last_call_at).toLocaleDateString()
                            : '—'}
                        </span>
                        {lead.callback_due_at && (
                          <p className="text-[10px] text-cyan-600 mt-0.5">
                            CB: {new Date(lead.callback_due_at).toLocaleDateString()}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/dialer/queue?lead=${lead.id}`}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Dial this lead"
                        >
                          <PhoneIcon size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-right">
              Showing {leads.length} of {total} leads
            </p>
          </>
        )}
      </div>
    </div>
  )
}
