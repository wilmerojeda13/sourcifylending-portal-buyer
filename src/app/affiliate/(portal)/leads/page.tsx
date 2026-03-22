'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  UserPlus, Mail, MailCheck, Clock, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Loader2, Plus, X, Send, RefreshCw,
  Phone, Building2, StickyNote, Info
} from 'lucide-react'

interface Lead {
  id: string
  full_name: string
  email: string
  phone: string | null
  business_name: string | null
  notes: string | null
  deal_type: 'referral_only' | 'affiliate_closed'
  status: 'lead_created' | 'invite_sent' | 'account_created' | 'active' | 'cancelled'
  invite_sent_at: string | null
  invite_sent_count: number
  account_created_at: string | null
  converted_at: string | null
  created_at: string
}

const STATUS_CONFIG = {
  lead_created:    { label: 'Lead Created',    icon: Clock,         color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  invite_sent:     { label: 'Invite Sent',     icon: MailCheck,     color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  account_created: { label: 'Account Created', icon: CheckCircle,   color: 'bg-indigo-100 text-indigo-700',dot: 'bg-indigo-500' },
  active:          { label: 'Active Client',   icon: CheckCircle,   color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  cancelled:       { label: 'Cancelled',        icon: XCircle,       color: 'bg-red-100 text-red-600',      dot: 'bg-red-400' },
} as const

const STATUS_STEPS = ['lead_created', 'invite_sent', 'account_created', 'active'] as const

function StatusBadge({ status }: { status: Lead['status'] }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function DealTypeBadge({ dealType }: { dealType: Lead['deal_type'] }) {
  return dealType === 'affiliate_closed'
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase">I Closed · 30%</span>
    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase">Referral · 10%</span>
}

function fmtDate(s: string | null) {
  if (!s) return null
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusProgress({ status }: { status: Lead['status'] }) {
  const currentIdx = STATUS_STEPS.indexOf(status as typeof STATUS_STEPS[number])
  if (status === 'cancelled') {
    return <span className="text-xs text-red-500 font-medium">Cancelled</span>
  }
  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, i) => {
        const done = i <= currentIdx
        return (
          <div key={step} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full transition-colors ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
            {i < STATUS_STEPS.length - 1 && (
              <div className={`w-4 h-0.5 ${i < currentIdx ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  // Add lead form
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '', email: '', phone: '', business_name: '', notes: '',
    deal_type: 'referral_only' as Lead['deal_type'],
  })
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // Invite state
  const [inviteLoading, setInviteLoading] = useState<string | null>(null)
  const [inviteMsg, setInviteMsg] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  // Expanded row
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/affiliate/leads?${params}`)
      const data = await res.json()
      setLeads(data.leads ?? [])
      setTotal(data.total ?? 0)
    } catch { /* no-op */ }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  function resetForm() {
    setFormData({ full_name: '', email: '', phone: '', business_name: '', notes: '', deal_type: 'referral_only' })
    setFormError('')
  }

  async function handleSaveLead(sendInvite: boolean) {
    if (!formData.full_name.trim() || !formData.email.trim()) {
      setFormError('Full name and email are required.')
      return
    }
    setFormLoading(true)
    setFormError('')
    try {
      const res = await fetch('/api/affiliate/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to save lead.')
        setFormLoading(false)
        return
      }
      const newLead: Lead = data.lead
      if (sendInvite) {
        await sendInviteFor(newLead.id)
      }
      resetForm()
      setShowForm(false)
      fetchLeads()
    } catch {
      setFormError('Network error. Please try again.')
    }
    setFormLoading(false)
  }

  async function sendInviteFor(leadId: string) {
    setInviteLoading(leadId)
    setInviteMsg(null)
    try {
      const res = await fetch(`/api/affiliate/leads/${leadId}/invite`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setInviteMsg({ id: leadId, ok: true, msg: 'Invite sent successfully!' })
        fetchLeads()
      } else {
        setInviteMsg({ id: leadId, ok: false, msg: data.error || 'Failed to send invite.' })
      }
    } catch {
      setInviteMsg({ id: leadId, ok: false, msg: 'Network error.' })
    }
    setInviteLoading(null)
    setTimeout(() => setInviteMsg(null), 5000)
  }

  const canSendInvite = (lead: Lead) =>
    lead.status !== 'account_created' &&
    lead.status !== 'active' &&
    lead.status !== 'cancelled' &&
    (lead.invite_sent_count ?? 0) < 3

  const summaryStats = {
    total,
    invite_sent: leads.filter(l => l.status === 'invite_sent').length,
    converted: leads.filter(l => l.status === 'active').length,
  }

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Prospects</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add leads, send invites, and track their progress</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError('') }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} /> Add Prospect
        </button>
      </div>

      {/* Toast notification */}
      {inviteMsg && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
          inviteMsg.ok
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {inviteMsg.ok ? <MailCheck size={16} /> : <XCircle size={16} />}
          {inviteMsg.msg}
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Prospects', value: summaryStats.total, color: 'text-gray-900' },
          { label: 'Invite Sent', value: summaryStats.invite_sent, color: 'text-blue-600' },
          { label: 'Active Clients', value: summaryStats.converted, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 text-sm text-indigo-800">
        <Info size={16} className="shrink-0 mt-0.5 text-indigo-500" />
        <div>
          <span className="font-semibold">How this works:</span> Add a prospect, choose your deal type, and send them a personalized invite link. When they sign up through your link, they&apos;re automatically tracked under your account. You earn commission when they become a paying client.
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { value: '', label: 'All' },
          { value: 'lead_created', label: 'Lead Created' },
          { value: 'invite_sent', label: 'Invite Sent' },
          { value: 'account_created', label: 'Account Created' },
          { value: 'active', label: 'Active' },
          { value: 'cancelled', label: 'Cancelled' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === value
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Leads list */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin mb-3" />
            <span className="text-sm">Loading prospects…</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <UserPlus size={32} className="mb-3 opacity-40" />
            <p className="text-sm font-medium text-gray-500">No prospects yet</p>
            <p className="text-xs mt-1">Click "Add Prospect" to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {leads.map(lead => (
              <div key={lead.id}>
                {/* Lead row */}
                <div
                  className="px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    {/* Left: name + email */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-indigo-700">
                          {lead.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">{lead.full_name}</div>
                        <div className="text-xs text-gray-500">{lead.email}</div>
                        {lead.business_name && (
                          <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Building2 size={10} /> {lead.business_name}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle: status + progress */}
                    <div className="flex flex-col gap-1.5 items-start">
                      <StatusBadge status={lead.status} />
                      <StatusProgress status={lead.status} />
                    </div>

                    {/* Right: deal type + actions */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <DealTypeBadge dealType={lead.deal_type} />

                      {/* Invite / Resend button */}
                      {canSendInvite(lead) && (
                        <button
                          onClick={e => { e.stopPropagation(); sendInviteFor(lead.id) }}
                          disabled={inviteLoading === lead.id}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                            lead.invite_sent_count > 0
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          } disabled:opacity-60`}
                        >
                          {inviteLoading === lead.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : lead.invite_sent_count > 0 ? (
                            <RefreshCw size={12} />
                          ) : (
                            <Send size={12} />
                          )}
                          {lead.invite_sent_count > 0 ? 'Resend' : 'Send Invite'}
                        </button>
                      )}

                      {/* Invite count badge */}
                      {lead.invite_sent_count >= 3 && lead.status === 'invite_sent' && (
                        <span className="text-[10px] text-gray-400 font-medium">Max invites sent</span>
                      )}

                      <button
                        onClick={e => { e.stopPropagation(); setExpanded(expanded === lead.id ? null : lead.id) }}
                        className="text-gray-400 hover:text-gray-600 p-1"
                      >
                        {expanded === lead.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded === lead.id && (
                  <div className="bg-gray-50 border-t border-gray-100 px-5 py-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <div className="text-gray-400 font-medium mb-1 uppercase tracking-wide text-[10px]">Created</div>
                        <div className="text-gray-700">{fmtDate(lead.created_at) ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 font-medium mb-1 uppercase tracking-wide text-[10px]">Invite Sent</div>
                        <div className="text-gray-700">
                          {lead.invite_sent_at
                            ? <>{fmtDate(lead.invite_sent_at)} <span className="text-gray-400">({lead.invite_sent_count}× sent)</span></>
                            : 'Not yet sent'}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400 font-medium mb-1 uppercase tracking-wide text-[10px]">Account Created</div>
                        <div className="text-gray-700">{fmtDate(lead.account_created_at) ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 font-medium mb-1 uppercase tracking-wide text-[10px]">Converted</div>
                        <div className="text-gray-700">{fmtDate(lead.converted_at) ?? '—'}</div>
                      </div>
                      {lead.phone && (
                        <div>
                          <div className="text-gray-400 font-medium mb-1 uppercase tracking-wide text-[10px]">Phone</div>
                          <div className="text-gray-700">{lead.phone}</div>
                        </div>
                      )}
                      {lead.notes && (
                        <div className="col-span-2 sm:col-span-4">
                          <div className="text-gray-400 font-medium mb-1 uppercase tracking-wide text-[10px]">Notes</div>
                          <div className="text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">{lead.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <UserPlus size={18} className="text-indigo-600" /> Add Prospect
              </h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={e => setFormData(d => ({ ...d, full_name: e.target.value }))}
                  placeholder="Jane Smith"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address *</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(d => ({ ...d, email: e.target.value }))}
                    placeholder="jane@example.com"
                    className="w-full pl-9 pr-4 border border-gray-200 rounded-xl py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))}
                    placeholder="+1 (555) 000-0000"
                    className="w-full pl-9 pr-4 border border-gray-200 rounded-xl py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              {/* Business Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Business Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={formData.business_name}
                    onChange={e => setFormData(d => ({ ...d, business_name: e.target.value }))}
                    placeholder="Acme Corp"
                    className="w-full pl-9 pr-4 border border-gray-200 rounded-xl py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              {/* Deal Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Deal Type *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(d => ({ ...d, deal_type: 'referral_only' }))}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      formData.deal_type === 'referral_only'
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-sm text-gray-900">Referral</div>
                    <div className="text-xs text-gray-500 mt-0.5">I&apos;m referring them</div>
                    <div className="text-xs font-bold text-indigo-600 mt-1">10% commission</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(d => ({ ...d, deal_type: 'affiliate_closed' }))}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      formData.deal_type === 'affiliate_closed'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-sm text-gray-900">I&apos;ll Close It</div>
                    <div className="text-xs text-gray-500 mt-0.5">I&apos;m handling the sale</div>
                    <div className="text-xs font-bold text-purple-600 mt-1">30% commission</div>
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1"><StickyNote size={12} /> Notes <span className="text-gray-400 font-normal">(optional)</span></span>
                </label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Any context about this prospect..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
                  {formError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setShowForm(false); resetForm() }}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveLead(false)}
                disabled={formLoading}
                className="flex-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {formLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Save Lead
              </button>
              <button
                onClick={() => handleSaveLead(true)}
                disabled={formLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {formLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Save & Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
