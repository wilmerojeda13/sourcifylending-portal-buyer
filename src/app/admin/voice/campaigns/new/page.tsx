'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Megaphone, Loader2, Users } from 'lucide-react'
import toast from 'react-hot-toast'

interface CRMFilter {
  stage: string
  program: string
  source: string
}

export default function NewCampaignPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromCRM = searchParams.get('from_crm') === '1'
  const [loading, setLoading] = useState(false)
  const [crmFilter, setCRMFilter] = useState<CRMFilter>({ stage: '', program: '', source: '' })
  const [crmCount, setCRMCount] = useState<number | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  const [form, setForm] = useState({
    name: '',
    description: '',
    lead_source_filter: fromCRM ? 'crm' : 'all',
    max_call_duration_seconds: 90,
    quiet_hours_start: '21:00',
    quiet_hours_end: '09:00',
    timezone: 'America/New_York',
    caller_id: '',
    transfer_number: '',
    analyzer_url: '',
    max_attempts_tier1: 3,
    max_attempts_tier2: 3,
    max_attempts_tier3: 2,
  })

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Fetch CRM lead count when filter changes
  useEffect(() => {
    if (form.lead_source_filter !== 'crm') { setCRMCount(null); return }
    const params = new URLSearchParams()
    if (crmFilter.stage)   params.set('stage', crmFilter.stage)
    if (crmFilter.program) params.set('program', crmFilter.program)
    if (crmFilter.source)  params.set('source', crmFilter.source)
    setCountLoading(true)
    fetch(`/api/admin/crm/leads?${params}`)
      .then(r => r.json())
      .then(j => setCRMCount(j.total ?? 0))
      .catch(() => setCRMCount(null))
      .finally(() => setCountLoading(false))
  }, [form.lead_source_filter, crmFilter])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Campaign name is required')
      return
    }
    setLoading(true)
    try {
      const payload = form.lead_source_filter === 'crm'
        ? { ...form, crm_filter: crmFilter }
        : form
      const res = await fetch('/api/voice/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to create campaign')
        return
      }
      toast.success('Campaign created!')
      router.push(`/admin/voice/campaigns/${json.campaign.id}`)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <Link href="/admin/voice/campaigns" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-2">
          <ChevronLeft size={14} /> All Campaigns
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone size={22} className="text-indigo-500" /> New Campaign
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure your AI outbound calling campaign</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm border-b border-gray-100 pb-3">Basic Information</h2>

          <div>
            <label className="label">Campaign Name *</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. MCA Outreach Q1"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input-field min-h-[80px] resize-y"
              placeholder="Optional notes about this campaign..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Lead Source Filter</label>
            <select className="input-field" value={form.lead_source_filter} onChange={e => set('lead_source_filter', e.target.value)}>
              <option value="all">All Sources</option>
              <option value="crm">📋 From CRM (Sales Pipeline)</option>
              <option value="purchased">Purchased</option>
              <option value="facebook">Facebook</option>
              <option value="inbound">Inbound</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* CRM Segment Filters */}
          {form.lead_source_filter === 'crm' && (
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-teal-600" />
                  <span className="text-sm font-semibold text-teal-700 dark:text-teal-300">CRM Segment Filters</span>
                </div>
                <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                  {countLoading ? '...' : crmCount !== null ? `${crmCount} leads match` : ''}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label text-xs">Stage</label>
                  <select className="input-field text-sm" value={crmFilter.stage} onChange={e => setCRMFilter(p => ({ ...p, stage: e.target.value }))}>
                    <option value="">All Stages</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="demo_scheduled">Demo Scheduled</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Program Interest</label>
                  <select className="input-field text-sm" value={crmFilter.program} onChange={e => setCRMFilter(p => ({ ...p, program: e.target.value }))}>
                    <option value="">All Programs</option>
                    <option value="program_a">Program A</option>
                    <option value="program_b">Program B</option>
                    <option value="program_c">Program C</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Lead Source</label>
                  <select className="input-field text-sm" value={crmFilter.source} onChange={e => setCRMFilter(p => ({ ...p, source: e.target.value }))}>
                    <option value="">All Sources</option>
                    {['manual','analyzer','affiliate','facebook','purchased','referral','inbound','other'].map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-teal-600 dark:text-teal-400">
                Sarah will call all matching CRM leads. Closed Won/Lost leads are automatically excluded.
              </p>
            </div>
          )}
        </div>

        {/* Phone Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm border-b border-gray-100 pb-3">Phone Settings</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Caller ID</label>
              <input
                type="tel"
                className="input-field"
                placeholder="+12125551234"
                value={form.caller_id}
                onChange={e => set('caller_id', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Transfer Number</label>
              <input
                type="tel"
                className="input-field"
                placeholder="+12125551234"
                value={form.transfer_number}
                onChange={e => set('transfer_number', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Max Call Duration (seconds)</label>
            <input
              type="number"
              className="input-field"
              min={30}
              max={600}
              value={form.max_call_duration_seconds}
              onChange={e => set('max_call_duration_seconds', parseInt(e.target.value) || 90)}
            />
          </div>

          <div>
            <label className="label">Analyzer Webhook URL</label>
            <input
              type="text"
              className="input-field"
              placeholder="https://..."
              value={form.analyzer_url}
              onChange={e => set('analyzer_url', e.target.value)}
            />
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm border-b border-gray-100 pb-3">Quiet Hours &amp; Timezone</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Quiet Hours Start</label>
              <input
                type="time"
                className="input-field"
                value={form.quiet_hours_start}
                onChange={e => set('quiet_hours_start', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Quiet Hours End</label>
              <input
                type="time"
                className="input-field"
                value={form.quiet_hours_end}
                onChange={e => set('quiet_hours_end', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Timezone</label>
              <select className="input-field" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Retry Rules */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm border-b border-gray-100 pb-3">Max Attempts Per Tier</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Tier 1 (High Priority)</label>
              <input
                type="number"
                className="input-field"
                min={1}
                max={5}
                value={form.max_attempts_tier1}
                onChange={e => set('max_attempts_tier1', parseInt(e.target.value) || 3)}
              />
            </div>
            <div>
              <label className="label">Tier 2 (Medium)</label>
              <input
                type="number"
                className="input-field"
                min={1}
                max={5}
                value={form.max_attempts_tier2}
                onChange={e => set('max_attempts_tier2', parseInt(e.target.value) || 3)}
              />
            </div>
            <div>
              <label className="label">Tier 3 (Low Priority)</label>
              <input
                type="number"
                className="input-field"
                min={1}
                max={5}
                value={form.max_attempts_tier3}
                onChange={e => set('max_attempts_tier3', parseInt(e.target.value) || 2)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={loading} className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60">
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
          <Link href="/admin/voice/campaigns" className="btn-secondary px-5 py-2.5 text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
