'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Phone, ChevronRight, Building2, Loader2, CheckCircle2,
  ThumbsUp, ThumbsDown, Voicemail, PhoneMissed,
  CalendarPlus, Ban, Clock, ArrowRight, Copy, AlertTriangle,
  CheckCircle, Globe, Send, Mail, Pencil, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getIndustryBadge } from '@/lib/dialer-industry'
import toast from 'react-hot-toast'

// Canonical dialer campaign flow used from /admin/dialer/campaigns.
// Do not move mobile UI work into the legacy CRM dialer tree.
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
  industry: string | null
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
  status_counts: Record<string, number>
}

function isMobileDialDevice() {
  if (typeof navigator === 'undefined') return false
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
}

function buildDialTarget(number: string) {
  if (isMobileDialDevice()) {
    return {
      href: `tel:${number}`,
      target: undefined,
      copiedMessage: null,
    }
  }

  return {
    href: `https://voice.google.com/calls?a=${encodeURIComponent(`nc,${number}`)}`,
    target: '_blank',
    copiedMessage: `Opening Google Voice · ${number} copied`,
  }
}

function buildTextMessage(firstName: string) {
  return `Hey ${firstName}, this is Abel. Here's the link to set up your free account and take advantage of our free inquiry dispute tool: https://sourcifylending.com`
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

const DEFAULT_SCRIPT = `Hey, is this {first_name}? Great. My name is Abel with SourcifyLending.com. The reason I'm calling is because it looks like your business had inquired for funding in the past. Just wanted to see if you already found the funding you were seeking, or did you ever find a solution?

THE PIVOT: Well, the reason I'm reaching out is because on average, I help my clients get anywhere from $50,000 to $100,000 in 0% interest business funding—or business credit cards from places like Chase or Bank of America. Just wanted to see if you had a quick minute to run it by you and see if we're a good fit?

THE STRATEGY:
Step 1: You set up a free account and run the Business Analyzer to scan for any 'blind spots' the banks look for.
Step 2: We underwrite everything in-house without doing any hard credit inquiries, so your score is protected.
Step 3: We determine if you're ready to get the funding now, or if we need to address any red flags on the credit side first.

Does that sound like a better direction for you?`

// ─── ScriptCard ──────────────────────────────────────────────────────────────
function ScriptCard({ firstName, defaultExpanded = false }: { firstName: string; defaultExpanded?: boolean }) {
  const [script, setScript]         = useState(DEFAULT_SCRIPT)
  const [draft, setDraft]           = useState(DEFAULT_SCRIPT)
  const [editing, setEditing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [collapsed, setCollapsed]   = useState(!defaultExpanded)
  const [loaded, setLoaded]         = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings/sales_script')
      .then(r => r.json())
      .then(j => {
        if (j.value) {
          setScript(j.value)
          setDraft(j.value)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings/sales_script', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: draft }),
      })
      if (!res.ok) throw new Error('Save failed')
      setScript(draft)
      setEditing(false)
      toast.success('Script saved')
    } catch {
      toast.error('Could not save script')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(script)
    setEditing(false)
  }

  const rendered = script.replace(/\{first_name\}/g, firstName || 'there')

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">📋 Sales Script</span>
        <div className="flex items-center gap-2">
          {!editing && loaded && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); setCollapsed(false); setEditing(true) }}
              className="flex items-center gap-1 rounded-lg bg-gray-800 px-2 py-1 text-[11px] text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <Pencil size={11} /> Edit
            </span>
          )}
          {collapsed ? <ChevronDown size={15} className="text-gray-500" /> : <ChevronUp size={15} className="text-gray-500" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          {editing ? (
            <>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={12}
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-xs text-gray-100 leading-relaxed resize-y focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={cancel}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-700 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{rendered}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function CampaignDialerClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign]           = useState<Campaign | null>(null)
  const [queue, setQueue]                 = useState<CampaignLead[]>([])
  const [index, setIndex]                 = useState(0)
  const [loading, setLoading]             = useState(true)
  const [acting, setActing]               = useState(false)
  const [mobileDockMode, setMobileDockMode] = useState<'pre_call' | 'post_call'>('pre_call')
  const [note, setNote]                   = useState('')
  const [callbackAt, setCallbackAt]       = useState('')
  const [done, setDone]                   = useState(0)
  const [skipped, setSkipped]             = useState(0)
  const [copied, setCopied]               = useState(false)
  const [emailSending, setEmailSending]   = useState(false)
  const [statusFilter, setStatusFilter]   = useState<string>('dialable')
  const [totalDialable, setTotalDialable] = useState(0)
  const [textModalOpen, setTextModalOpen] = useState(false)
  const [textDraft, setTextDraft]         = useState('')

  const current   = queue[index] ?? null
  const batchSize = queue.length
  // Use accurate server-side total (from status_counts view), not capped batch size
  const total     = totalDialable || batchSize
  const remaining = Math.max(0, total - done)

  const FILTER_OPTIONS = [
    { key: 'dialable',   label: 'Ready to Dial' },
    { key: 'new',        label: 'New' },
    { key: 'attempted',  label: 'Attempted' },
    { key: 'callback',   label: 'Callbacks' },
    { key: 'follow_up',  label: 'Follow Up' },
    { key: 'interested', label: 'Interested' },
    { key: 'qualified',  label: 'Qualified' },
    { key: 'high_priority', label: 'High Priority', color: 'bg-indigo-100 text-indigo-700' },
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
      const cam: Campaign | null = camJson.campaign ?? null
      setCampaign(cam)
      setQueue(leadsJson.leads ?? [])
      // Compute accurate total from status_counts view (not capped batch)
      if (cam?.status_counts) {
        const sc = cam.status_counts
        const t = filter === 'dialable'
          ? (['new','attempted','callback','follow_up'] as const).reduce((s, k) => s + (sc[k] ?? 0), 0)
          : (sc[filter] ?? 0)
        setTotalDialable(t)
      }
    } catch {
      toast.error('Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { load(statusFilter) }, [statusFilter, load])

  useEffect(() => {
    setMobileDockMode('pre_call')
  }, [current?.id])

  function copyPhone() {
    const lead = current
    if (!lead) return

    const rawLead = lead.raw_lead
    navigator.clipboard.writeText(rawLead.phone_e164 ?? rawLead.phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Phone number copied')
  }

  function openTextModal() {
    const lead = current
    if (!lead) return

    setTextDraft(buildTextMessage(lead.raw_lead.first_name))
    setTextModalOpen(true)
  }

  async function copyText() {
    if (!textDraft) return
    try {
      await navigator.clipboard.writeText(textDraft)
      toast.success('Text copied')
    } catch {
      toast.error('Could not copy text')
    }
  }

  function handleDial() {
    if (!raw) return
    const number = raw.phone_e164 ?? raw.phone
    const dialTarget = buildDialTarget(number)
    setMobileDockMode('post_call')
    if (dialTarget.target) {
      window.open(dialTarget.href, dialTarget.target, 'noopener,noreferrer')
      navigator.clipboard.writeText(number).catch(() => {})
      if (dialTarget.copiedMessage) {
        toast.success(dialTarget.copiedMessage)
      }
      return
    }

    window.location.href = dialTarget.href
  }

  async function sendIntroEmail() {
    const lead = current
    if (!lead || emailSending) return

    const rawLead = lead.raw_lead
    
    // STRICT CHECK: Must have valid email with @ and .
    if (!rawLead?.email || typeof rawLead.email !== 'string') {
      console.warn('Email send skipped: No email for lead', rawLead?.id)
      return
    }
    
    const email = rawLead.email.trim()
    if (!email.includes('@') || !email.includes('.')) {
      console.warn('Email send skipped: Invalid email format', email)
      return
    }
    
    if (!rawLead.id) {
      console.warn('Email send skipped: No lead ID')
      return
    }

    setEmailSending(true)
    try {
      const res = await fetch(`/api/admin/dialer/leads/${rawLead.id}/intro-email`, {
        method: 'POST',
      })
      await res.json().catch(() => ({}))
      if (!res.ok) {
        console.warn('Intro email API returned error:', res.status)
        return
      }

      toast.success('Intro email sent.')
    } catch (err) {
      console.warn('Intro email send failed:', err)
      // No toast error - just log to console
    } finally {
      setEmailSending(false)
    }
  }

  async function saveDisposition(d: typeof DISPOSITIONS[number]) {
    const lead = current
    if (!lead) return

    const leadId = lead.id
    const rawLead = lead.raw_lead

    setActing(true)
    
    // HARD GATEKEEPER: Validate lead data before sending
    const safeString = (val: unknown): string | null => {
      if (val === null || val === undefined) return null
      if (typeof val === 'string') return val.trim() || null
      return String(val).trim() || null
    }
    
    const safeLeadId = safeString(leadId)
    const safeRawLeadId = safeString(rawLead?.id)
    const safeOutcome = safeString(d.outcome)
    const safeNote = safeString(note)
    const safeCallbackAt = safeString(callbackAt)
    
    // Must have valid IDs and outcome
    if (!safeLeadId || !safeRawLeadId || !safeOutcome) {
      toast.error('Invalid lead data - skipping')
      setActing(false)
      // Still increment done count so we don't get stuck
      setDone(n => n + 1)
      setQueue(q => q.filter(item => item.id !== leadId))
      setIndex(i => Math.max(0, Math.min(i, queue.length - 2)))
      setMobileDockMode('pre_call')
      setNote('')
      setCallbackAt('')
      return
    }
    
    // Get local timestamp for timezone-accurate analytics
    const localTimestamp = new Date().toISOString()
    
    try {
      const res = await fetch(`/api/admin/dialer/campaigns/${campaignId}/disposition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_lead_id: safeLeadId,
          raw_lead_id:      safeRawLeadId,
          outcome:          safeOutcome,
          note:             safeNote,
          callback_due_at:  safeCallbackAt,
          promote:          ('promote' in d && (d as { promote?: boolean }).promote) || false,
          client_timestamp: localTimestamp, // For timezone sync
        }),
      })
      
      // Try to parse response, but don't fail if it's malformed
      let json: { error?: string; promotion?: { outcome?: string } } = {}
      try {
        json = await res.json()
      } catch {
        // Response wasn't valid JSON - log but don't fail
        console.warn('Disposition response was not valid JSON')
      }

      if (!res.ok) {
        throw new Error(json.error || 'Failed to save')
      }

      const promotionOutcome = json.promotion?.outcome
      if (promotionOutcome === 'created_new_crm_lead') {
        toast.success(`${current.raw_lead.first_name || 'Lead'} created in CRM.`)
      } else if (promotionOutcome === 'merged_into_existing_crm_lead') {
        toast('Merged into existing CRM lead.', { icon: 'ℹ' })
      } else if (promotionOutcome === 'already_promoted') {
        toast('Lead was already in CRM.', { icon: 'ℹ' })
      }

      // ALWAYS increment done count - this is total_dials tracking
      setDone(n => n + 1)
      
      // Remove from queue and advance
      setQueue(q => q.filter(item => item.id !== leadId))
      setIndex(i => Math.max(0, Math.min(i, queue.length - 2)))
      setMobileDockMode('pre_call')
      setNote('')
      setCallbackAt('')
    } catch (e) {
      console.error('Disposition error:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to save')
      
      // STILL increment done count even on error - total_dials must track every attempt
      setDone(n => n + 1)
      setQueue(q => q.filter(item => item.id !== leadId))
      setIndex(i => Math.max(0, Math.min(i, queue.length - 2)))
      setMobileDockMode('pre_call')
      setNote('')
      setCallbackAt('')
    } finally {
      setActing(false)
    }
  }

  function skip() {
    setSkipped(s => s + 1)
    setMobileDockMode('pre_call')
    setNote('')
    setCallbackAt('')
    setIndex(i => i + 1)
  }

  // ── Queue complete screen ──────────────────────────────────────────────────
  // Batch exhausted — automatically reload to get the next batch from the remaining pool
  if (!loading && batchSize > 0 && index >= batchSize && done < total) {
    load(statusFilter)
    return null
  }

  if (!loading && (batchSize === 0 || done >= total || index >= batchSize)) return (
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

  const raw = current?.raw_lead ?? null
  const activeLeadId = current?.id ?? ''
  const dialNumber = raw ? (raw.phone_e164 ?? raw.phone) : null
  const dialTarget = dialNumber ? buildDialTarget(dialNumber) : null

  return (
    <div className="flex-1 overflow-auto overflow-x-hidden">
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
          <span className="ml-2 text-xs text-gray-400 shrink-0">{remaining.toLocaleString()} left</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <div className="h-full bg-green-500 transition-all duration-300"
          style={{ width: total ? `${(index / total) * 100}%` : '0%' }} />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 lg:py-6">
        <div className="lg:hidden space-y-4 pb-[calc(18rem+env(safe-area-inset-bottom))]">
          <ScriptCard firstName={raw?.first_name ?? ''} />
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 overflow-x-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-gray-100">
                  {raw ? `${raw.first_name} ${raw.last_name ?? ''}` : 'No lead'}
                </h2>
                {raw?.business_name && (
                  <p className="mt-0.5 truncate text-sm text-gray-400 flex items-center gap-1 min-w-0">
                    <Building2 size={13} className="shrink-0" />
                    <span className="truncate">{raw.business_name}</span>
                  </p>
                )}
                {raw?.email ? (
                  <p className="mt-0.5 truncate text-xs text-gray-500 flex items-center gap-1 min-w-0">
                    <Mail size={12} className="shrink-0" />
                    <span className="truncate">{raw.email}</span>
                  </p>
                ) : (
                  <p className="mt-0.5 truncate text-xs text-red-400 flex items-center gap-1 min-w-0">
                    <Mail size={12} className="shrink-0" />
                    <span>No Email Provided</span>
                  </p>
                )}
                {raw?.industry && (() => {
                  const badge = getIndustryBadge(raw.industry)
                  return (
                    <span className={cn('mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', badge.color)}>
                      {badge.priority ? '⭐ ' : ''}{badge.label}
                    </span>
                  )
                })()}
                {raw && <div className="mt-1.5"><CallWindowBadge lead={raw} /></div>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{index + 1} / {total.toLocaleString()}</p>
                <p className="text-xs text-gray-500">{done} done · {skipped} skipped</p>
              </div>
            </div>

            {raw && (
              <div className="mt-4 space-y-3">
                <a
                  key={`${activeLeadId}:${dialNumber ?? raw.phone}`}
                  href={dialTarget?.href ?? '#'}
                  target={dialTarget?.target}
                  rel={dialTarget?.target ? 'noopener noreferrer' : undefined}
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-white hover:border-green-500/50 hover:text-green-400 transition-colors"
                >
                  <Phone size={16} className="shrink-0 text-green-400" />
                  <span className="min-w-0 truncate text-lg font-semibold tracking-wide">
                    {raw.phone}
                  </span>
                </a>

                <button
                  onClick={handleDial}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
                >
                  <Phone size={15} /> Dial
                </button>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={copyPhone}
                    className="flex min-w-[92px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-700"
                  >
                    {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={openTextModal}
                    disabled={!raw}
                    className="flex min-w-[92px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send size={13} />
                    Send Text
                  </button>
                  {raw.email && (
                    <button
                      onClick={sendIntroEmail}
                      disabled={emailSending}
                      className="flex min-w-[92px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                    >
                      {emailSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      {emailSending ? 'Sending...' : 'Send Email'}
                    </button>
                  )}
                </div>
                {!raw.email && (
                  <p className="text-[11px] text-gray-500">No email on file</p>
                )}
              </div>
            )}
          </div>

          <details className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-gray-200">
              More
            </summary>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Call Note</label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Quick note (optional)…"
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-gray-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Callback / Follow-up Time</label>
                <input
                  type="datetime-local"
                  value={callbackAt}
                  onChange={e => setCallbackAt(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 [color-scheme:dark] focus:border-gray-500 focus:outline-none"
                />
              </div>
            </div>
          </details>

          {raw?.notes && (
            <details className="rounded-2xl border border-amber-800 bg-amber-950/30 p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-amber-300">
                Lead Notes
              </summary>
              <p className="mt-4 text-sm leading-relaxed text-amber-200">
                {raw.notes}
              </p>
            </details>
          )}
        </div>

        {/* ── COCKPIT: 3-column desktop layout ── */}
        <div className="hidden lg:grid gap-4" style={{ gridTemplateColumns: '220px 1fr 260px' }}>

          {/* ── COL 1: Lead info ── */}
          <div className="space-y-3">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-100 leading-tight">
                    {raw ? `${raw.first_name} ${raw.last_name ?? ''}` : 'No lead'}
                  </h2>
                  {raw?.business_name && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1 truncate">
                      <Building2 size={11} className="shrink-0" /> <span className="truncate">{raw.business_name}</span>
                    </p>
                  )}
                  {raw?.email ? (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                      <Mail size={11} className="shrink-0" /> <span className="truncate">{raw.email}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-red-400 flex items-center gap-1 mt-0.5">
                      <Mail size={11} className="shrink-0" /> No Email
                    </p>
                  )}
                  {raw?.industry && (() => {
                    const badge = getIndustryBadge(raw.industry)
                    return (
                      <span className={cn('mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', badge.color)}>
                        {badge.priority ? '⭐ ' : ''}{badge.label}
                      </span>
                    )
                  })()}
                </div>
              </div>
              {raw && <div className="mb-2"><CallWindowBadge lead={raw} /></div>}
              <div className="flex flex-wrap gap-1">
                {current?.last_call_outcome && (
                  <span className="text-[10px] bg-gray-700 text-gray-400 rounded-full px-2 py-0.5">
                    Last: {current.last_call_outcome}
                  </span>
                )}
                {raw?.promoted_to_crm_lead_id && (
                  <span className="text-[10px] bg-teal-100 text-teal-700 rounded-full px-2 py-0.5">
                    In CRM ✓
                  </span>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-500 uppercase tracking-wide">
                <span>{index + 1} / {total.toLocaleString()}</span>
                <span>{done} done</span>
              </div>
            </div>

            {/* Raw lead notes */}
            {raw?.notes && (
              <div className="bg-amber-950/30 border border-amber-800 rounded-2xl p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400 mb-1">Lead Notes</p>
                <p className="text-xs text-amber-200 leading-relaxed">{raw.notes}</p>
              </div>
            )}

            {/* Next lead preview */}
            {queue[index + 1] && (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1">
                  <ArrowRight size={9} /> Up next
                </p>
                <p className="text-xs font-medium text-gray-300">
                  {queue[index + 1].raw_lead.first_name} {queue[index + 1].raw_lead.last_name ?? ''}
                </p>
                <p className="text-[11px] text-gray-500">{queue[index + 1].raw_lead.phone}</p>
              </div>
            )}
          </div>

          {/* ── COL 2: Phone actions + Script ── */}
          <div className="space-y-3">
            {/* Phone + action row */}
            {raw && (
              <div key={activeLeadId} className="bg-gray-900 rounded-2xl border border-gray-800 px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <a
                    key={`${activeLeadId}:${dialNumber ?? raw.phone}`}
                    href={dialTarget?.href ?? '#'}
                    target={dialTarget?.target}
                    rel={dialTarget?.target ? 'noopener noreferrer' : undefined}
                    className="text-2xl font-bold text-white tracking-wide hover:text-green-400 transition-colors"
                  >
                    {raw.phone}
                  </a>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={handleDial}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700">
                      <Phone size={14} /> Dial
                    </button>
                    <button onClick={copyPhone}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-gray-200 text-xs font-medium rounded-xl hover:bg-gray-600">
                      {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={openTextModal} disabled={!raw}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-gray-200 text-xs font-medium rounded-xl hover:bg-gray-600 disabled:opacity-50">
                      <Send size={13} /> Text
                    </button>
                    <button onClick={sendIntroEmail} disabled={!raw.email || emailSending}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white text-xs font-semibold rounded-xl hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400">
                      {emailSending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                      {emailSending ? 'Sending…' : 'Email'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Notes + callback */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Call Note</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Quick note…"
                  className="w-full px-3 py-2 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 placeholder:text-gray-500" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Callback / Follow-up</label>
                <input type="datetime-local" value={callbackAt} onChange={e => setCallbackAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-gray-500 bg-gray-800 text-gray-100 [color-scheme:dark]" />
              </div>
            </div>

            {/* Script — center stage, expanded by default */}
            <ScriptCard firstName={raw?.first_name ?? ''} defaultExpanded />
          </div>

          {/* ── COL 3: Dispositions + Stats ── */}
          <div className="space-y-3">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Call Outcome</p>
              <div className="grid grid-cols-1 gap-1.5">
                {DISPOSITIONS.map(d => {
                  const Icon = d.icon
                  return (
                    <button key={d.outcome} onClick={() => saveDisposition(d)} disabled={acting}
                      className={cn(
                        'flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all active:scale-[0.97] disabled:opacity-50',
                        d.color,
                      )}>
                      <Icon size={13} /> {d.label}
                    </button>
                  )
                })}
              </div>
              <button onClick={skip} disabled={!current || acting}
                className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-400 bg-gray-800 rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors">
                <ChevronRight size={13} /> Skip
              </button>
            </div>

            {/* Stats */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 px-3 py-2.5 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">Pos</p>
                <p className="text-base font-bold text-gray-100">{index + 1}/{total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">Done</p>
                <p className="text-base font-bold text-green-600">{done}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">Skip</p>
                <p className="text-base font-bold text-gray-500">{skipped}</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-800 bg-gray-950/96 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-5xl px-4 pt-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))]">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-gray-400">
            <span>Bottom Dock</span>
            <span className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-300">
              {mobileDockMode === 'pre_call' ? 'Pre-call' : 'Disposition'}
            </span>
          </div>

          {mobileDockMode === 'pre_call' ? (
            <div className="space-y-2">
              <button
                onClick={handleDial}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                <Phone size={15} /> Dial
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={skip}
                  disabled={!current || acting}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-800 px-3 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-40"
                >
                  <ChevronRight size={15} /> Skip
                </button>
                <button
                  onClick={copyPhone}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-800 px-3 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-700"
                >
                  {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid max-h-[44svh] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {DISPOSITIONS.map(d => {
                  const Icon = d.icon
                  return (
                    <button
                      key={d.outcome}
                      onClick={() => saveDisposition(d)}
                      disabled={acting}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50',
                        d.color,
                      )}
                    >
                      <Icon size={15} /> {d.label}
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={skip}
                  disabled={!current || acting}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-800 px-3 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-40"
                >
                  <ChevronRight size={15} /> Skip
                </button>
                <button
                  onClick={copyPhone}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-800 px-3 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-700"
                >
                  {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {textModalOpen && raw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-100">Send Text</p>
                <p className="text-xs text-gray-400">Manual copy helper only</p>
              </div>
              <button
                onClick={() => setTextModalOpen(false)}
                className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Text message
                </label>
                <textarea
                  value={textDraft}
                  onChange={e => setTextDraft(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-gray-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copyText}
                  disabled={!textDraft}
                  className="flex min-w-[120px] items-center justify-center gap-1.5 rounded-xl bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                >
                  <Copy size={13} />
                  Copy Text
                </button>
                <button
                  onClick={() => setTextModalOpen(false)}
                  className="flex min-w-[92px] items-center justify-center gap-1.5 rounded-xl bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
