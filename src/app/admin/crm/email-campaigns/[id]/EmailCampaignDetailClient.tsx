'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, Play, Send, Sparkles, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface CampaignRow {
  id: string
  name: string
  subject: string
  html_body: string | null
  text_body: string | null
  from_email: string
  from_name: string | null
  status: string
  recipient_count: number
  sent_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  complained_count: number
  unsubscribed_count: number
  created_by: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
  currentRecipientCount?: number
}

interface RecentEntry {
  id: string
  email: string
  created_at: string
  reason?: string | null
  source?: string | null
  suppression_type?: string | null
  notes?: string | null
}

interface DetailResponse {
  campaign: CampaignRow
  recent_unsubscribes: RecentEntry[]
  recent_suppressions: RecentEntry[]
}

interface ActionSummary {
  title: string
  fields: Record<string, string | number | null>
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-sky-100 text-sky-700',
  sending: 'bg-amber-100 text-amber-700',
  sent: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  paused: 'bg-violet-100 text-violet-700',
}

function parseRecipientLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/[,\t|]/).map(part => part.trim())
      const [email, first_name, last_name, contact_id] = parts
      return {
        email,
        first_name: first_name || undefined,
        last_name: last_name || undefined,
        contact_id: contact_id || undefined,
      }
    })
}

function formatTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function EmailCampaignDetailClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<CampaignRow | null>(null)
  const [unsubscribes, setUnsubscribes] = useState<RecentEntry[]>([])
  const [suppressions, setSuppressions] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [starting, setStarting] = useState(false)
  const [processingBatch, setProcessingBatch] = useState(false)
  const [recipientText, setRecipientText] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [batchLimit, setBatchLimit] = useState(25)
  const [lastAction, setLastAction] = useState<ActionSummary | null>(null)
  const [form, setForm] = useState({
    name: '',
    subject: '',
    html_body: '',
    text_body: '',
    from_email: '',
    from_name: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/crm/email-campaigns/${campaignId}`)
      const json = await res.json() as DetailResponse & { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to load campaign')
      setCampaign(json.campaign)
      setUnsubscribes(json.recent_unsubscribes ?? [])
      setSuppressions(json.recent_suppressions ?? [])
      setForm({
        name: json.campaign.name ?? '',
        subject: json.campaign.subject ?? '',
        html_body: json.campaign.html_body ?? '',
        text_body: json.campaign.text_body ?? '',
        from_email: json.campaign.from_email ?? '',
        from_name: json.campaign.from_name ?? '',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load campaign')
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  const editable = campaign?.status === 'draft' || campaign?.status === 'paused'
  const canTest = campaign?.status === 'draft' || campaign?.status === 'paused'
  const canStart = campaign?.status === 'scheduled' || campaign?.status === 'paused'
  const canProcessBatch = campaign?.status === 'sending'

  async function saveCampaign() {
    if (!editable) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/crm/email-campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save campaign')
      setCampaign(json.campaign)
      toast.success('Campaign saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save campaign')
    } finally {
      setSaving(false)
    }
  }

  async function attachRecipients() {
    const recipients = parseRecipientLines(recipientText)
    if (recipients.length === 0) {
      toast.error('Paste at least one recipient row')
      return
    }

    setAttaching(true)
    try {
      const res = await fetch(`/api/admin/crm/email-campaigns/${campaignId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attach', recipients }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to attach recipients')
      setLastAction({
        title: 'Recipient attach',
        fields: {
          attempted: json.attempted,
          inserted: json.inserted,
          skipped_duplicates: json.skipped_duplicates,
          skipped_invalid: json.skipped_invalid,
          recipient_count: json.recipient_count,
        },
      })
      setRecipientText('')
      toast.success('Recipients attached')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to attach recipients')
    } finally {
      setAttaching(false)
    }
  }

  async function sendTest() {
    if (!testEmail.trim()) {
      toast.error('Enter a test recipient email')
      return
    }

    setSendingTest(true)
    try {
      const res = await fetch(`/api/admin/crm/email-campaigns/${campaignId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', recipientEmail: testEmail.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.errorMessage ?? json.error ?? 'Failed to send test')
      setLastAction({
        title: 'Test send',
        fields: {
          success: json.success ? 'yes' : 'no',
          provider_message_id: json.providerMessageId ?? null,
          error_message: json.errorMessage ?? null,
          allowed_reasons: Array.isArray(json.reasons) ? json.reasons.join(', ') : null,
        },
      })
      toast.success(json.success ? 'Test email sent' : 'Test send blocked')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send test email')
    } finally {
      setSendingTest(false)
    }
  }

  async function startSend() {
    setStarting(true)
    try {
      const res = await fetch(`/api/admin/crm/email-campaigns/${campaignId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.errorMessage ?? json.error ?? 'Failed to start campaign')
      setLastAction({
        title: 'Start send',
        fields: {
          success: json.success ? 'yes' : 'no',
          status: json.campaign?.status ?? null,
        },
      })
      toast.success('Campaign moved to sending')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start campaign')
    } finally {
      setStarting(false)
    }
  }

  async function processBatch() {
    setProcessingBatch(true)
    try {
      const res = await fetch(`/api/admin/crm/email-campaigns/${campaignId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', limit: batchLimit }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.errorMessage ?? json.error ?? 'Failed to process batch')
      setLastAction({
        title: 'Batch processing',
        fields: {
          attempted: json.attempted,
          processed: json.processed,
          sent: json.sent,
          blocked: json.blocked,
          failed: json.failed,
          remaining: json.remaining,
          campaign_status: json.campaign?.status ?? null,
        },
      })
      toast.success('Batch processed')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to process batch')
    } finally {
      setProcessingBatch(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 text-gray-400 sm:px-6">
        Campaign not found. <Link href="/admin/crm/email-campaigns" className="text-white underline">Back to campaigns</Link>
      </div>
    )
  }

  const stats = [
    ['Recipients', campaign.recipient_count],
    ['Sent', campaign.sent_count],
    ['Delivered', campaign.delivered_count],
    ['Opened', campaign.opened_count],
    ['Clicked', campaign.clicked_count],
    ['Bounced', campaign.bounced_count],
    ['Complained', campaign.complained_count],
    ['Unsubscribed', campaign.unsubscribed_count],
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/crm/email-campaigns" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <ChevronLeft size={15} /> Campaigns
        </Link>
        <span className={cn('inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]', STATUS_BADGE[campaign.status] ?? 'bg-gray-100 text-gray-700')}>
          {campaign.status}
        </span>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Campaign</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{campaign.name}</h1>
            <p className="mt-2 text-sm text-gray-400">{campaign.subject}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-400 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Updated</p>
              <p className="mt-1 text-white">{formatTime(campaign.updated_at)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Sent at</p>
              <p className="mt-1 text-white">{formatTime(campaign.sent_at)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-gray-500">From</p>
              <p className="mt-1 text-white">{campaign.from_name ? `${campaign.from_name} <${campaign.from_email}>` : campaign.from_email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Editable</p>
              <p className="mt-1 text-white">{editable ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{Number(value ?? 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Draft Fields</h2>
              <p className="mt-1 text-xs text-gray-500">Save is only enabled for draft and paused campaigns.</p>
            </div>
            {saving && <Loader2 size={16} className="animate-spin text-gray-500" />}
          </div>

          <div className="mt-4 space-y-3">
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              disabled={!editable}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 disabled:opacity-60"
              placeholder="Campaign name"
            />
            <input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              disabled={!editable}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 disabled:opacity-60"
              placeholder="Subject"
            />
            <input
              value={form.from_email}
              onChange={e => setForm(f => ({ ...f, from_email: e.target.value }))}
              disabled={!editable}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 disabled:opacity-60"
              placeholder="From email"
            />
            <input
              value={form.from_name}
              onChange={e => setForm(f => ({ ...f, from_name: e.target.value }))}
              disabled={!editable}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 disabled:opacity-60"
              placeholder="From name"
            />
            <textarea
              value={form.html_body}
              onChange={e => setForm(f => ({ ...f, html_body: e.target.value }))}
              disabled={!editable}
              rows={8}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 font-mono text-sm text-white placeholder:text-gray-500 disabled:opacity-60"
              placeholder="HTML body"
            />
            <textarea
              value={form.text_body}
              onChange={e => setForm(f => ({ ...f, text_body: e.target.value }))}
              disabled={!editable}
              rows={5}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 font-mono text-sm text-white placeholder:text-gray-500 disabled:opacity-60"
              placeholder="Text body"
            />
            <div className="flex gap-3">
              <button
                onClick={saveCampaign}
                disabled={!editable || saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              {!editable && (
                <p className="self-center text-xs text-gray-500">Edit is locked once the campaign leaves draft/paused.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-200">Manual Recipients</h2>
                <p className="mt-1 text-xs text-gray-500">Paste one recipient per line as `email` or `email,first,last,contact_id`.</p>
              </div>
              {attaching && <Loader2 size={16} className="animate-spin text-gray-500" />}
            </div>
            <textarea
              value={recipientText}
              onChange={e => setRecipientText(e.target.value)}
              rows={7}
              className="mt-4 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 font-mono text-sm text-white placeholder:text-gray-500"
              placeholder={'recipient@example.com\nrecipient2@example.com,First,Last'}
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={attachRecipients}
                disabled={attaching}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-gray-200 disabled:opacity-60"
              >
                <Upload size={15} /> Attach Recipients
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-200">Test Send</h2>
                <p className="mt-1 text-xs text-gray-500">Draft and paused campaigns only.</p>
              </div>
              {sendingTest && <Loader2 size={16} className="animate-spin text-gray-500" />}
            </div>
            <div className="mt-4 flex gap-3">
              <input
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                type="email"
                className="flex-1 rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500"
                placeholder="test-recipient@example.com"
              />
              <button
                onClick={sendTest}
                disabled={sendingTest || !canTest}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-60"
              >
                <Sparkles size={15} /> Send Test
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-200">Send Controls</h2>
                <p className="mt-1 text-xs text-gray-500">Start campaign send and process the next batch.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={startSend}
                disabled={starting || !canStart}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-60"
              >
                <Play size={15} /> Start Send
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={batchLimit}
                  onChange={e => setBatchLimit(Number(e.target.value) || 25)}
                  className="w-20 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                />
                <button
                  onClick={processBatch}
                  disabled={processingBatch || !canProcessBatch}
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-gray-200 disabled:opacity-60"
                >
                  <Send size={15} /> Process Batch
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {lastAction && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-200">{lastAction.title}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(lastAction.fields).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">{label.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-sm font-medium text-white">{value ?? '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-200">Recent Unsubscribes</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-950/60">
                <tr className="border-b border-gray-800">
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.16em] text-gray-500">Email</th>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.16em] text-gray-500">Reason</th>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.16em] text-gray-500">Source</th>
                  <th className="px-3 py-2 text-right text-[11px] uppercase tracking-[0.16em] text-gray-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {unsubscribes.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-500">No unsubscribes yet.</td></tr>
                ) : unsubscribes.map(row => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5 text-gray-200">{row.email}</td>
                    <td className="px-3 py-2.5 text-gray-400">{row.reason ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-400">{row.source ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{formatTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-200">Recent Suppressions</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-950/60">
                <tr className="border-b border-gray-800">
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.16em] text-gray-500">Email</th>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.16em] text-gray-500">Type</th>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.16em] text-gray-500">Source</th>
                  <th className="px-3 py-2 text-right text-[11px] uppercase tracking-[0.16em] text-gray-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {suppressions.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-500">No suppressions yet.</td></tr>
                ) : suppressions.map(row => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5 text-gray-200">{row.email}</td>
                    <td className="px-3 py-2.5 text-gray-400">{row.suppression_type ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-400">{row.source ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{formatTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
