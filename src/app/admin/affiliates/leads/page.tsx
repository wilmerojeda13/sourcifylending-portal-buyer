'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Search, Filter, Loader2, UserPlus, Mail,
  CheckCircle, Clock, XCircle, ArrowRight
} from 'lucide-react'

interface Lead {
  id: string
  affiliate_id: string
  full_name: string
  email: string
  phone: string | null
  business_name: string | null
  deal_type: 'referral_only' | 'affiliate_closed'
  status: 'lead_created' | 'invite_sent' | 'account_created' | 'active' | 'cancelled'
  invite_sent_at: string | null
  invite_sent_count: number
  account_created_at: string | null
  converted_at: string | null
  created_at: string
  affiliates: {
    id: string
    name: string
    email: string
    referral_code: string
  } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  lead_created:    { label: 'Lead Created',    color: 'bg-gray-100 text-gray-600' },
  invite_sent:     { label: 'Invite Sent',     color: 'bg-blue-100 text-blue-700' },
  account_created: { label: 'Account Created', color: 'bg-indigo-100 text-indigo-700' },
  active:          { label: 'Active Client',   color: 'bg-green-100 text-green-700' },
  cancelled:       { label: 'Cancelled',        color: 'bg-red-100 text-red-600' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function DealTypeBadge({ dealType }: { dealType: string }) {
  return dealType === 'affiliate_closed'
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase">Closed · 30%</span>
    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase">Referral · 10%</span>
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_FLOW = ['lead_created', 'invite_sent', 'account_created', 'active']

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/admin/affiliates/leads?${params}`)
      const data = await res.json()
      setLeads(data.leads ?? [])
      setTotal(data.total ?? 0)
    } catch { /* no-op */ }
    setLoading(false)
  }, [page, search, statusFilter])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Stats
  const byStatus = (s: string) => leads.filter(l => l.status === s).length

  const limit = 25
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/admin/affiliates" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ChevronLeft size={14} /> Affiliates
          </Link>
          <span className="text-gray-300">/</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Affiliate Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">Prospects submitted by affiliates and their conversion status</p>
          </div>
        </div>

        {/* Sub-nav */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {[
            { label: 'Affiliates', href: '/admin/affiliates' },
            { label: 'Commissions', href: '/admin/affiliates/commissions' },
            { label: 'Leads', href: '/admin/affiliates/leads', active: true },
            { label: 'Applications', href: '/admin/affiliates/applications' },
            { label: 'Settings', href: '/admin/affiliates/settings' },
            { label: 'Flags', href: '/admin/affiliates/flags' },
          ].map(({ label, href, active }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${active
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STATUS_FLOW.map(s => {
            const cfg = STATUS_CONFIG[s]
            return (
              <div key={s} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 text-center">
                <div className="text-xl font-bold text-gray-900">{byStatus(s)}</div>
                <div className="text-xs text-gray-400 mt-0.5">{cfg.label}</div>
              </div>
            )
          })}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 text-center">
            <div className="text-xl font-bold text-gray-900">{total}</div>
            <div className="text-xs text-gray-400 mt-0.5">Total Leads</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or business..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-gray-400" />
            {(['', ...STATUS_FLOW, 'cancelled'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === '' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">{total} lead{total !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Lead', 'Business', 'Affiliate', 'Deal Type', 'Status', 'Invite Sent', 'Account Created', 'Created'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                      <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                      Loading leads…
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                      <UserPlus size={24} className="mx-auto mb-2 opacity-40" />
                      No leads found
                    </td>
                  </tr>
                ) : leads.map(lead => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{lead.full_name}</div>
                      <div className="text-xs text-gray-400">{lead.email}</div>
                      {lead.phone && <div className="text-xs text-gray-400">{lead.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{lead.business_name || '—'}</td>
                    <td className="px-4 py-3">
                      {lead.affiliates ? (
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{lead.affiliates.name}</div>
                          <code className="text-[10px] text-gray-400 font-mono">{lead.affiliates.referral_code}</code>
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3"><DealTypeBadge dealType={lead.deal_type} /></td>
                    <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {lead.invite_sent_at ? (
                        <div>
                          <div>{fmtDate(lead.invite_sent_at)}</div>
                          <div className="text-gray-400">{lead.invite_sent_count}× sent</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(lead.account_created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Previous</button>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
