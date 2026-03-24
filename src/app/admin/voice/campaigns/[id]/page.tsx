'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { PhoneCall, Users, CheckCircle, TrendingUp, Play, Pause, ChevronLeft, Loader2, Phone } from 'lucide-react'

const DISP_COLOR: Record<string, string> = {
  transferred_live: 'bg-green-100 text-green-700', send_link: 'bg-blue-100 text-blue-700',
  callback_requested: 'bg-indigo-100 text-indigo-700', interested: 'bg-emerald-100 text-emerald-700',
  decision_maker: 'bg-purple-100 text-purple-700', not_interested: 'bg-gray-100 text-gray-500',
  voicemail: 'bg-amber-100 text-amber-700', no_answer: 'bg-gray-100 text-gray-400',
  do_not_call: 'bg-red-100 text-red-600', bad_number: 'bg-red-100 text-red-500',
  wrong_number: 'bg-red-100 text-red-500', gatekeeper: 'bg-yellow-100 text-yellow-700',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500', active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700', completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-400',
}

export default function CampaignDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [campaign, setCampaign] = useState<Record<string, unknown> | null>(null)
  const [leads, setLeads] = useState<Record<string, unknown>[]>([])
  const [calls, setCalls] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [dialLoading, setDialLoading] = useState(false)

  const load = useCallback(async () => {
    const [cRes, lRes, callRes] = await Promise.all([
      fetch(`/api/voice/campaigns/${id}`),
      fetch(`/api/voice/leads?campaign_id=${id}&limit=10`),
      fetch(`/api/voice/calls?campaign_id=${id}&limit=10`),
    ])
    if (cRes.ok) { const d = await cRes.json(); setCampaign(d.campaign) }
    if (lRes.ok) { const d = await lRes.json(); setLeads(d.leads ?? []) }
    if (callRes.ok) { const d = await callRes.json(); setCalls(d.calls ?? []) }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const handleStart = async () => {
    setActionLoading(true)
    const r = await fetch(`/api/voice/campaigns/${id}/start`, { method: 'POST' })
    const d = await r.json()
    if (r.ok) { toast.success('Campaign started'); load() } else toast.error(d.error)
    setActionLoading(false)
  }

  const handlePause = async () => {
    setActionLoading(true)
    const r = await fetch(`/api/voice/campaigns/${id}/pause`, { method: 'POST' })
    const d = await r.json()
    if (r.ok) { toast.success('Campaign paused'); load() } else toast.error(d.error)
    setActionLoading(false)
  }

  const handleDialNext = async () => {
    const nextLead = leads.find(l => !l.do_not_call && l.phone_e164 && (l.call_attempt_count as number) < 3)
    if (!nextLead) { toast.error('No dialable leads available'); return }
    setDialLoading(true)
    const r = await fetch('/api/voice/dial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: nextLead.id, campaign_id: id }) })
    const d = await r.json()
    if (r.ok) { toast.success('Call initiated'); load() } else toast.error(d.error)
    setDialLoading(false)
  }

  if (loading) return <div className="p-8 flex items-center gap-3 text-gray-400"><Loader2 size={20} className="animate-spin" /> Loading campaign...</div>
  if (!campaign) return <div className="p-8 text-gray-500">Campaign not found. <Link href="/admin/voice/campaigns" className="text-indigo-600">Back</Link></div>

  const pct = (campaign.total_leads as number) > 0 ? Math.round(((campaign.total_calls as number) / (campaign.total_leads as number)) * 100) : 0
  const status = campaign.status as string

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/voice/campaigns" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
          <ChevronLeft size={16} /> Campaigns
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name as string}</h1>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-500'}`}>{status}</span>
          </div>
          {campaign.description && <p className="text-sm text-gray-500 mt-1">{campaign.description as string}</p>}
        </div>
        <div className="flex gap-2">
          {status === 'active' ? (
            <button onClick={handlePause} disabled={actionLoading} className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
              <Pause size={15} /> Pause
            </button>
          ) : (
            <button onClick={handleStart} disabled={actionLoading || status === 'completed' || status === 'archived'} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
              <Play size={15} /> {status === 'draft' ? 'Start Campaign' : 'Resume'}
            </button>
          )}
          <button onClick={handleDialNext} disabled={dialLoading || status !== 'active'} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
            {dialLoading ? <Loader2 size={15} className="animate-spin" /> : <Phone size={15} />} Dial Next Lead
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: campaign.total_leads as number, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Calls Made', value: campaign.total_calls as number, icon: PhoneCall, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Connects', value: campaign.total_connects as number, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Qualified', value: campaign.total_qualified as number, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>
              <Icon size={16} className={color} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Dial Progress</span>
          <span className="text-sm text-gray-500">{campaign.total_calls as number} / {campaign.total_leads as number} leads called ({pct}%)</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Leads */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Top Leads by Score</h2>
            <Link href={`/admin/voice/leads?campaign_id=${id}`} className="text-xs text-indigo-600 hover:text-indigo-700">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {leads.length === 0 ? (
              <div className="p-5 text-sm text-gray-400 text-center">
                No leads yet. <Link href="/admin/voice/leads" className="text-indigo-600">Import leads →</Link>
              </div>
            ) : leads.map((lead) => (
              <div key={lead.id as string} className={`flex items-center gap-3 px-5 py-3 ${lead.do_not_call ? 'bg-red-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{(lead.business_name as string) || (lead.owner_name as string) || '—'}</p>
                  <p className="text-xs text-gray-400">{lead.phone_e164 as string || '—'} · {lead.call_attempt_count as number} attempts</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(lead.lead_quality_score as number) >= 70 ? 'bg-green-100 text-green-700' : (lead.lead_quality_score as number) >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                    {lead.lead_quality_score as number}
                  </span>
                  {lead.do_not_call && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">DNC</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Calls */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Recent Calls</h2>
            <Link href={`/admin/voice/logs?campaign_id=${id}`} className="text-xs text-indigo-600 hover:text-indigo-700">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {calls.length === 0 ? (
              <div className="p-5 text-sm text-gray-400 text-center">No calls yet</div>
            ) : calls.map((call) => {
              const disp = (call.disposition as string | null) ?? ''
              return (
                <div key={call.id as string} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{call.to_number as string || '—'}</p>
                    <p className="text-xs text-gray-400">{new Date(call.created_at as string).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {disp && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DISP_COLOR[disp] ?? 'bg-gray-100 text-gray-500'}`}>{disp.replace(/_/g, ' ')}</span>}
                    {call.duration_seconds && <span className="text-xs text-gray-400">{call.duration_seconds as number}s</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
