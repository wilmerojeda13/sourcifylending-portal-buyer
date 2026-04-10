'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Phone, ChevronRight, Building2, Loader2, CheckCircle2,
  ThumbsUp, ThumbsDown, Voicemail, PhoneMissed,
  CalendarPlus, Ban, Clock, ArrowRight, Copy, AlertTriangle,
  CheckCircle, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ───────────────────────────────────────────────────────────────────
type CampaignLeadStatus =
  | 'new' | 'attempted' | 'contacted' | 'interested'
  | 'callback' | 'follow_up' | 'qualified'
  | 'promoted' | 'dnc' | 'closed_lost'

interface RawLead {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  phone_e164: string | null
  email: string | null
  business_name: string | null
  notes: string | null
  do_not_call: boolean
  promoted_to_crm_lead_id: string | null
  likely_timezone: string | null
  timezone_confidence: string | null
  call_window_status: string | null
  blocked_until_label: string | null
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
  raw_lead: RawLead
}

interface Campaign {
  id: string
  name: string
  status: string
}

// ─── Dispositions ────────────────────────────────────────────────────────────
const DISPOSITIONS = [
  { outcome: 'no_answer',      label: 'No Answer',      icon: PhoneMissed,   color: 'bg-gray-800 text-gray-200 hover:bg-gray-700',    next: 'attempted'    },
  { outcome: 'voicemail',      label: 'Voicemail',      icon: Voicemail,     color: 'bg-gray-700 text-gray-200 hover:bg-gray-600',    next: 'attempted'    },
  { outcome: 'contacted',      label: 'Contacted',      icon: Phone,         color: 'bg-blue-700 text-white hover:bg-blue-600',       next: 'contacted'    },
  { outcome: 'callback',       label: 'Callback',       icon: CalendarPlus,  color: 'bg-cyan-700 text-white hover:bg-cyan-600',       next: 'callback'     },
  { outcome: 'interested',     label: 'Interested',     icon: ThumbsUp,      color: 'bg-green-700 text-white hover:bg-green-600',     next: 'interested'   },
  { outcome: 'follow_up',      label: 'Follow Up',      icon: Clock,         color: 'bg-yellow-700 text-white hover:bg-yellow-600',   next: 'follow_up'    },
  { outcome: 'qualified',      label: 'Qualified →CRM', icon: CheckCircle2,  color: 'bg-purple-700 text-white hover:bg-purple-600',   next: 'qualified', promote: true },
  { outcome: 'not_interested', label: 'Not Interested', icon: ThumbsDown,    color: 'bg-red-900 text-red-200 hover:bg-red-800',       next: 'closed_lost'  },
  { outcome: 'dnc',            label: 'DNC',            icon: Ban,           color: 'bg-red-700 text-white hover:bg-red-600',         next: 'dnc'          },
] as const

// ─── Timezone callability badge ───────────────────────────────────────────────
function CallWindowBadge({ lead }: { lead: RawLead }) {
  if (!lead.call_window_status) return null
  if (lead.call_window_status === 'callable_now') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle size={11} /> Callable now {lead.likely_timezone && `· ${lead.likely_timezone}`}
    </span>
  )
  if (lead.call_window_status === 'blocked_by_timezone') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <AlertTriangle size={11} /> {lead.blocked_until_label ?? 'Outside call window'} {lead.likely_timezone && `· ${lead.likely_timezone}`}
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
      <Globe size={11} /> Unknown timezone
    </span>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function CampaignDialerClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign]       = useState<Campaign | null>(null)
  const [queue, setQueue]             = useState<CampaignLead[]>([])
  const [index, setIndex]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [acting, setActing]           = useState(false)
  const [note, setNote]               = useState('')
  const [callbackAt, setCallbackAt]   = useState('')
  const [done, setDone]               = useState(0)
  const [skipped, setSkipped]         = useState(0)
  const [copied, setCopied]           = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('dialable')

  const current   = queue[index] ?? null
  const total     = queue.length
  const remaining = total - index

  const FILTER_OPTIONS = [
    { key: 'dialable',   label: 'Ready to Dial' },
    { key: 'new',        label: 'New' },
    { key: 'attempted',  label: 'Attempted' },
    { key: 'callback',   label: 'Callbacks' },
    { key: 'follow_up',  label: 'Follow Up' },
    { key: 'interested', label: 'Interested' },
    { key: 'qualified',  label: 'Qualified' },
  ]

  const load = useCallback(async (filter: string) => {
    setLoading(true)
    setIndex(0)
    setNote('')
    setCallbackAt('')
    try {
      const [camRes, leadsRes] = await Promise.all([
        fetch(`/api/admin/dialer/campaigns/${campaignId}`),
        fetch(`/api/admin/dialer/campaigns/${campaignId}/leads?${filter === 'dialable' ? 'dialable=1' : `status=${filter}`}`),
      ])
      const [camJson, leadsJson] = await Promise.all([camRes.json(), leadsRes.json()])
      setCampaign(camJson.campaign ?? null)
      setQueue(leadsJson.leads ?? [])
    } catch {
      toast.error('Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { load(statusFilter) }, [statusFilter, load])

  function copyPhone() {
    if (!current) return
    navigator.clipboard.writeText(current.raw_lead.phone_e164 ?? current.raw_lead.phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Phone number copied')
  }

  function handleDial() {
    if (!raw) return
    const number = raw.phone_e164 ?? raw.phone
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    if (isMobile) {
      window.location.href = `tel:${number}`
      return
    }
    // Desktop: open Google Voice click-to-call
    const gvUrl = `https://voice.google.com/calls?a=nc&n=${encodeURIComponent(number)}`
    window.open(gvUrl, '_blank', 'noopener')
    navigator.clipboard.writeText(number).catch(() => {})
    toast.success(`Opening Google Voice · ${number} copied`)
  }

  async function saveDisposition(d: typeof DISPOSITIONS[number]) {
    if (!current) return
    setActing(true)
    try {
      const res = await fetch(`/api/admin/dialer/campaigns/${campaignId}/disposition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_lead_id: current.id,
          raw_lead_id:      current.raw_lead_id,
          outcome:          d.outcome,
          note:             note.trim() || null,
          callback_due_at:  callbackAt || null,
          promote:          ('promote' in d && (d as { promote?: boolean }).promote) || false,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      if (json.promotion) toast.success(`${current.raw_lead.first_name} promoted to CRM!`)

      // Remove from queue and advance
      setQueue(q => q.filter((_, i) => i !== index))
      setIndex(i => Math.min(i, queue.length - 2))
      setDone(n => n + 1)
      setNote('')
      setCallbackAt('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setActing(false)
    }
  }

  function skip() {
    setSkipped(s => s + 1)
    setNote('')
    setCallbackAt('')
    setIndex(i => i + 1)
  }

  // ── Queue complete screen ──────────────────────────────────────────────────
  if (!loading && queue.length > 0 && index >= queue.length) return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-20">
      <CheckCircle2 size={52} className="text-green-500 mb-4" />
      <h2 className="text-2xl font-bold text-gray-100 mb-1">Queue Complete</h2>
      <p className="text-gray-400 mb-1">{done} dispositioned · {skipped} skipped</p>
      {campaign && <p className="text-sm text-gray-400 mb-8">Campaign: {campaign.name}</p>}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => { setDone(0); setSkipped(0); load(statusFilter) }}
          className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700"
        >
          Reload Queue
        </button>
        {FILTER_OPTIONS.filter(f => f.key !== statusFilter).slice(0, 2).map(f => (
          <button key={f.key}
            onClick={() => { setStatusFilter(f.key); setDone(0); setSkipped(0) }}
            className="px-5 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-700"
          >
            Dial {f.label}
          </button>
        ))}
        <Link href={`/admin/dialer/campaigns/${campaignId}`}
          className="px-5 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-700">
          Campaign Overview
        </Link>
        <Link href="/admin/dialer/campaigns"
          className="px-5 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-700">
          All Campaigns
        </Link>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-gray-400" />
    </div>
  )

  if (queue.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-20">
      <Phone size={40} className="text-gray-300 mb-4" />
      <h3 className="font-semibold text-gray-300 mb-1">
        No leads in <span className="capitalize">{statusFilter.replace('_',' ')}</span>
      </h3>
      <p className="text-sm text-gray-400 mb-6">Try a different filter or add more leads to this campaign.</p>
      <div className="flex gap-3 flex-wrap justify-center">
        {FILTER_OPTIONS.filter(f => f.key !== statusFilter).map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-400 text-sm rounded-xl hover:bg-gray-700">
            Try {f.label}
          </button>
        ))}
        <Link href={`/admin/dialer/campaigns/${campaignId}`}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700">
          Add Leads
        </Link>
      </div>
    </div>
  )

  const raw = current?.raw_lead

  return (
    <div className="flex-1 overflow-auto">
      {/* Sub-nav: campaign info + filter pills */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-2.5">
        <div className="flex items-center gap-3 overflow-x-auto">
          <Link href={`/admin/dialer/campaigns/${campaignId}`}
            className="text-xs text-gray-400 hover:text-gray-200 shrink-0 flex items-center gap-1">
            {campaign?.name ?? 'Campaign'}
          </Link>
          <span className="text-gray-300 shrink-0">›</span>
          <div className="flex items-center gap-1.5 min-w-max">
            {FILTER_OPTIONS.map(f => (
              <button key={f.key} onClick={() => { setStatusFilter(f.key); setDone(0); setSkipped(0) }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                  statusFilter === f.key ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
                )}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="ml-2 text-xs text-gray-400 shrink-0">{remaining} left</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <div className="h-full bg-green-500 transition-all duration-300"
          style={{ width: total ? `${(index / total) * 100}%` : '0%' }} />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Left: lead card */}
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            {/* Lead header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-100">
                  {raw ? `${raw.first_name} ${raw.last_name ?? ''}` : 'No lead'}
                </h2>
                {raw?.business_name && (
                  <p className="text-sm text-gray-400 flex items-center gap-1 mt-0.5">
                    <Building2 size={13} /> {raw.business_name}
                  </p>
                )}
                {raw && <div className="mt-1.5"><CallWindowBadge lead={raw} /></div>}
                {current?.last_call_outcome && (
                  <span className="inline-block mt-1.5 text-[11px] bg-gray-700 text-gray-400 rounded-full px-2 py-0.5">
                    Last: {current.last_call_outcome}
                  </span>
                )}
                {raw?.promoted_to_crm_lead_id && (
                  <span className="inline-block mt-1.5 text-[11px] bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 ml-1">
                    In CRM ✓
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{index + 1} / {total}</p>
                <p className="text-xs text-gray-400">{done} done · {skipped} skipped</p>
              </div>
            </div>

            {/* Phone — manual dial */}
            {raw && (
              <div className="rounded-2xl bg-gray-900 px-5 py-4 mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Phone Number</p>
                <div className="flex items-center justify-between gap-3">
                  <a
                    href={`tel:${raw.phone_e164 ?? raw.phone}`}
                    className="text-2xl font-bold text-white tracking-wide hover:text-green-400 transition-colors"
                  >
                    {raw.phone}
                  </a>
                  <div className="flex gap-2">
                    <button onClick={copyPhone}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-gray-200 text-xs font-medium rounded-lg hover:bg-gray-600">
                      {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={handleDial}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700">
                      <Phone size={13} /> Dial
                    </button>
                  </div>
                </div>
                {raw.email && <p className="text-xs text-gray-500 mt-2">{raw.email}</p>}
              </div>
            )}

            {/* Notes + callback time */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Call Note</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Quick note (optional)…"
                  className="w-full px-3 py-2.5 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 placeholder:text-gray-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Callback / Follow-up Time</label>
                <input type="datetime-local" value={callbackAt} onChange={e => setCallbackAt(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 [color-scheme:dark]" />
              </div>
            </div>
          </div>

          {/* Raw lead notes */}
          {raw?.notes && (
            <div className="bg-amber-950/30 border border-amber-800 rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-1">Lead Notes</p>
              <p className="text-sm text-amber-200 leading-relaxed">{raw.notes}</p>
            </div>
          )}
        </div>

        {/* Right: dispositions */}
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Call Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {DISPOSITIONS.map(d => {
                const Icon = d.icon
                return (
                  <button key={d.outcome} onClick={() => saveDisposition(d)} disabled={acting}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50',
                      d.color,
                    )}>
                    <Icon size={15} /> {d.label}
                  </button>
                )
              })}
            </div>

            <button onClick={skip} disabled={!current || acting}
              className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-400 bg-gray-800 rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors">
              <ChevronRight size={15} /> Skip
            </button>
          </div>

          {/* Stats */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 px-4 py-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Position</p>
              <p className="text-lg font-bold text-gray-100 mt-0.5">{index + 1}/{total}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Done</p>
              <p className="text-lg font-bold text-green-600 mt-0.5">{done}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Skipped</p>
              <p className="text-lg font-bold text-gray-500 mt-0.5">{skipped}</p>
            </div>
          </div>

          {/* Next lead preview */}
          {queue[index + 1] && (
            <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 flex items-center gap-1">
                <ArrowRight size={10} /> Up next
              </p>
              <p className="text-sm font-medium text-gray-300">
                {queue[index + 1].raw_lead.first_name} {queue[index + 1].raw_lead.last_name ?? ''}
              </p>
              <p className="text-xs text-gray-400">{queue[index + 1].raw_lead.phone}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
