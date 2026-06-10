'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, Search, ChevronDown, ChevronUp, Loader2, ExternalLink } from 'lucide-react'

interface Application {
  id: string
  name: string
  email: string
  phone: string | null
  company_name: string | null
  website_or_social: string | null
  promotion_plan: string
  referral_experience: boolean
  monthly_referral_estimate: string | null
  marketing_channels: string[]
  status: 'new' | 'reviewed' | 'approved' | 'declined'
  admin_notes: string | null
  created_at: string
}

const STATUS_CONFIG = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: Clock },
  reviewed: { label: 'Reviewed', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700', icon: XCircle },
}

export default function AffiliateApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('new')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const fetchApplications = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/affiliates/applications?${params}`)
      const data = await res.json()
      setApplications(data.applications ?? [])
      const noteMap: Record<string, string> = {}
      for (const a of data.applications ?? []) noteMap[a.id] = a.admin_notes ?? ''
      setNotes(noteMap)
    } catch { /* ignore */ }
    setLoading(false)
  }, [search, statusFilter])

  useEffect(() => { fetchApplications() }, [fetchApplications])

  const updateStatus = async (id: string, status: string) => {
    setSaving(id)
    try {
      await fetch('/api/admin/affiliates/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, admin_notes: notes[id] }),
      })
      await fetchApplications()
    } catch { /* ignore */ }
    setSaving(null)
  }

  const saveNotes = async (id: string) => {
    setSaving(id + '_notes')
    try {
      await fetch('/api/admin/affiliates/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, admin_notes: notes[id] }),
      })
    } catch { /* ignore */ }
    setSaving(null)
  }

  const tabs = [
    { value: 'new', label: 'New' },
    { value: 'reviewed', label: 'Reviewed' },
    { value: 'approved', label: 'Approved' },
    { value: 'declined', label: 'Declined' },
    { value: '', label: 'All' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 text-gray-900 dark:text-gray-100 space-y-6">
      {/* Back nav */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
              <a href="/admin/affiliates" className="hover:text-green-700">Partners</a>
        <span>/</span>
        <span className="text-gray-900 font-medium">Applications</span>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Partner Applications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve partner-program applications</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === t.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Applications list */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8">
          <Loader2 size={18} className="animate-spin" /> Loading applications…
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
          <Clock size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium text-gray-600">No applications found</p>
          <p className="text-sm mt-1">New partner applications will appear here when submitted via the /partners page.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map(app => {
            const cfg = STATUS_CONFIG[app.status]
            const StatusIcon = cfg.icon
            const isExpanded = expanded === app.id
            return (
              <div key={app.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : app.id)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-green-700 font-bold text-sm">{app.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{app.name}</p>
                      <p className="text-xs text-gray-500 truncate">{app.email}{app.company_name ? ` · ${app.company_name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
                      <StatusIcon size={11} />
                      {cfg.label}
                    </span>
                    <p className="text-xs text-gray-400 hidden sm:block">
                      {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-5 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                      {[
                        ['Phone', app.phone || '—'],
                        ['Company', app.company_name || '—'],
                        ['Website / Social', app.website_or_social || '—'],
                        ['Prior Closing / Onboarding Experience', app.referral_experience ? 'Yes' : 'No'],
                        ['Est. Monthly Volume', app.monthly_referral_estimate || '—'],
                        ['Marketing Channels', (app.marketing_channels || []).join(', ') || '—'],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                          <p className="text-gray-800 font-medium">
                            {label === 'Website / Social' && value !== '—'
                              ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline flex items-center gap-1">{value} <ExternalLink size={11} /></a>
                              : value
                            }
                          </p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Promotion Plan</p>
                      <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 leading-relaxed">
                        {app.promotion_plan}
                      </div>
                    </div>

                    {/* Admin notes */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Admin Notes</label>
                      <textarea
                        rows={2}
                        value={notes[app.id] ?? ''}
                        onChange={e => setNotes(n => ({ ...n, [app.id]: e.target.value }))}
                        placeholder="Internal notes (not shown to applicant)…"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {app.status !== 'approved' && (
                        <button
                          onClick={() => updateStatus(app.id, 'approved')}
                          disabled={saving === app.id}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                        >
                          {saving === app.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          Approve
                        </button>
                      )}
                      {app.status !== 'reviewed' && app.status !== 'approved' && (
                        <button
                          onClick={() => updateStatus(app.id, 'reviewed')}
                          disabled={saving === app.id}
                          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                        >
                          Mark Reviewed
                        </button>
                      )}
                      {app.status !== 'declined' && (
                        <button
                          onClick={() => updateStatus(app.id, 'declined')}
                          disabled={saving === app.id}
                          className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                        >
                          <XCircle size={12} />
                          Decline
                        </button>
                      )}
                      <button
                        onClick={() => saveNotes(app.id)}
                        disabled={saving === app.id + '_notes'}
                        className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                      >
                        {saving === app.id + '_notes' ? <Loader2 size={12} className="animate-spin" /> : null}
                        Save Notes
                      </button>
                      {app.status === 'approved' && (
                        <a
                          href="/admin/affiliates"
                          className="flex items-center gap-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                        >
                          Add as Partner →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
