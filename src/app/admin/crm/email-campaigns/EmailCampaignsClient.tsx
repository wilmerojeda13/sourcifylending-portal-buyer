'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Mail, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface CampaignRow {
  id: string
  name: string
  subject: string
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
  updated_at: string
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-sky-100 text-sky-700',
  sending: 'bg-amber-100 text-amber-700',
  sent: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  paused: 'bg-violet-100 text-violet-700',
}

export default function EmailCampaignsClient() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '',
    subject: '',
    from_email: '',
    from_name: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/crm/email-campaigns')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load campaigns')
      setCampaigns((json.campaigns ?? []) as CampaignRow[])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createCampaign() {
    if (!form.name.trim() || !form.subject.trim() || !form.from_email.trim()) {
      toast.error('Name, subject, and from email are required')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/admin/crm/email-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          subject: form.subject.trim(),
          from_email: form.from_email.trim(),
          from_name: form.from_name.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create campaign')
      toast.success('Draft created')
      setForm({ name: '', subject: '', from_email: '', from_name: '' })
      setShowCreate(false)
      router.push(`/admin/crm/email-campaigns/${json.campaign.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create campaign')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">CRM</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Email Campaigns</h1>
          <p className="mt-2 text-sm text-gray-400">Drafts, send controls, and basic campaign stats.</p>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-gray-200"
        >
          <Plus size={16} /> New Draft
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-200">Create Draft</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Campaign name"
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
            <input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Subject"
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
            <input
              value={form.from_email}
              onChange={e => setForm(f => ({ ...f, from_email: e.target.value }))}
              placeholder="From email"
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
            <input
              value={form.from_name}
              onChange={e => setForm(f => ({ ...f, from_name: e.target.value }))}
              placeholder="From name (optional)"
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={createCampaign}
              disabled={creating}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create Draft'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-950/60">
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Subject</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Recipients</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Sent</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Delivered</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Opened</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Clicked</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Bounced</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Complained</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Updated</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center">
                  <Mail size={36} className="mx-auto text-gray-600" />
                  <p className="mt-3 text-sm text-gray-400">No campaigns yet.</p>
                </td>
              </tr>
            ) : campaigns.map(campaign => (
              <tr key={campaign.id} className="hover:bg-gray-950/50">
                <td className="px-4 py-3.5">
                  <Link href={`/admin/crm/email-campaigns/${campaign.id}`} className="font-medium text-white hover:text-green-300">
                    {campaign.name}
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', STATUS_BADGE[campaign.status] ?? 'bg-gray-100 text-gray-700')}>
                    {campaign.status}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-300">{campaign.subject}</td>
                <td className="px-4 py-3.5 text-right text-gray-300">{campaign.recipient_count.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right text-gray-300">{campaign.sent_count.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right text-gray-300">{campaign.delivered_count.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right text-gray-300">{campaign.opened_count.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right text-gray-300">{campaign.clicked_count.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right text-gray-300">{campaign.bounced_count.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right text-gray-300">{campaign.complained_count.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right text-xs text-gray-500">
                  {new Date(campaign.updated_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <Link href={`/admin/crm/email-campaigns/${campaign.id}`} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-gray-500 hover:text-white">
                    Open <ChevronRight size={13} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
