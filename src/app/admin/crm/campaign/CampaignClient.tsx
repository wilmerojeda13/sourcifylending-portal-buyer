'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Bot, Loader2, Phone, Mic, Clock, Webhook,
  CheckCircle2, AlertCircle, Info, Zap, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const DEFAULT_SCRIPT = `Hi, is this {{first_name}}?

Great! This is Sarah from Sourcify Lending. We specialize in helping business owners like yourself build and optimize their business credit profile — without using personal credit.

I'm calling because we have a quick 15-minute demo that shows exactly how our clients typically unlock $50,000 to $150,000 in business credit within 90 days.

Would you be open to a quick call this week to see if you qualify?

[If interested: Great! I'll have someone from our team reach out to schedule that. Can I confirm your email?]
[If not interested: No problem at all. I'll make a note of that. Have a great day!]`

const STAGE_OPTIONS = [
  { value: 'all', label: 'All Active Leads' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'demo_held', label: 'Demo Held' },
]

const COST_PER_MIN = 0.09

interface LaunchResult {
  batch_id: string
  total_calls: number
  message: string
}

export default function CampaignClient() {
  const [stage, setStage] = useState('new')
  const [script, setScript] = useState(DEFAULT_SCRIPT)
  const [voice, setVoice] = useState<'female' | 'male'>('female')
  const [maxDuration, setMaxDuration] = useState(2)
  const [leadCount, setLeadCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [result, setResult] = useState<LaunchResult | null>(null)

  const WEBHOOK_URL = 'https://sourcifylending.com/api/webhooks/bland'

  // Fetch lead count whenever stage changes
  const fetchCount = useCallback(async () => {
    setLoadingCount(true)
    setLeadCount(null)
    try {
      const p = new URLSearchParams({ limit: '1', page: '0', archived: 'false' })
      if (stage && stage !== 'all') p.set('stage', stage)
      const res = await fetch(`/api/admin/crm/leads?${p}`)
      const json = await res.json()
      setLeadCount(json.total ?? 0)
    } catch {
      setLeadCount(null)
    } finally {
      setLoadingCount(false)
    }
  }, [stage])

  useEffect(() => { fetchCount() }, [fetchCount])

  async function launch() {
    if (!leadCount) { toast.error('No leads to call'); return }
    const confirmed = window.confirm(
      `Launch AI voice campaign for ${leadCount.toLocaleString()} leads?\n\nEstimated cost: $${estimatedCost.toFixed(2)}\n\nThis will immediately begin calling leads.`
    )
    if (!confirmed) return

    setLaunching(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/crm/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, script, voice, max_duration: maxDuration }),
      })
      const json = await res.json()
      if (res.ok) {
        setResult(json)
        toast.success(json.message)
      } else {
        toast.error(json.error ?? 'Failed to launch campaign')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLaunching(false)
    }
  }

  const estimatedCost = (leadCount ?? 0) * maxDuration * COST_PER_MIN

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/admin/crm"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16}/> CRM
          </Link>
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-green-400"/>
            <span className="font-semibold text-sm">AI Voice Campaign</span>
          </div>
          <div className="w-16"/> {/* spacer */}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <Bot size={28} className="text-green-400"/>
          </div>
          <h1 className="text-2xl font-bold">AI Voice Campaign</h1>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            Automatically call your leads using an AI voice agent powered by Bland.ai. The CRM updates after each call.
          </p>
        </div>

        {/* Lead count + cost summary */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {loadingCount
                  ? <Loader2 size={20} className="animate-spin text-gray-500"/>
                  : <p className="text-2xl font-bold text-white">{leadCount?.toLocaleString() ?? '—'}</p>
                }
              </div>
              <p className="text-xs text-gray-500">Leads to call</p>
            </div>
            <div className="text-center border-x border-gray-800">
              <p className="text-2xl font-bold text-amber-400">{maxDuration}m</p>
              <p className="text-xs text-gray-500">Max per call</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">
                ${leadCount != null ? estimatedCost.toFixed(2) : '—'}
              </p>
              <p className="text-xs text-gray-500">Est. cost</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-600 text-center mt-3">
            Estimated at ${COST_PER_MIN}/min × leads × max duration. Actual cost depends on call length.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-5">

          {/* Stage filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Stage to Call
            </label>
            <select
              value={stage}
              onChange={e => setStage(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
            >
              {STAGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Voice */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              AI Voice
            </label>
            <div className="flex gap-3">
              {(['female', 'male'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVoice(v)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                    voice === v
                      ? 'bg-green-600 border-green-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                  )}
                >
                  <Mic size={14}/>
                  {v === 'female' ? 'Female (Sarah / Maya)' : 'Male (Mason)'}
                </button>
              ))}
            </div>
          </div>

          {/* Max duration */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Max Call Duration (minutes)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={15}
                value={maxDuration}
                onChange={e => setMaxDuration(Number(e.target.value) || 2)}
                className="w-24 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
              <div className="flex gap-2">
                {[1, 2, 3, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setMaxDuration(n)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                      maxDuration === n
                        ? 'bg-green-600 border-green-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                    )}
                  >
                    {n}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Script */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              AI Script
            </label>
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              rows={12}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 resize-y font-mono leading-relaxed"
              placeholder="Enter the script the AI will follow..."
            />
            <p className="text-xs text-gray-600 mt-1.5">
              Use {'{{first_name}}'}, {'{{last_name}}'}, {'{{business_name}}'} as dynamic variables.
            </p>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Webhook URL (auto-configured)
            </label>
            <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5">
              <Webhook size={14} className="text-gray-500 shrink-0"/>
              <p className="text-xs text-gray-400 font-mono truncate">{WEBHOOK_URL}</p>
            </div>
            <p className="text-xs text-gray-600 mt-1.5">
              Bland.ai will POST call results here. Your CRM stages update automatically.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info size={14} className="text-blue-400 shrink-0"/>
            <p className="text-sm font-semibold text-blue-300">How the AI Campaign Works</p>
          </div>
          <ol className="space-y-2 text-xs text-gray-400 list-none">
            {[
              'The AI calls each lead using the script above, speaking naturally and adapting to responses.',
              'Bland.ai detects whether the call was answered, went to voicemail, or had no answer.',
              'After each call completes, Bland.ai sends results to your webhook.',
              'Your CRM automatically updates the lead\'s stage and logs a call activity — within seconds.',
              'You can view updated leads in the CRM immediately.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Result card */}
        {result && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={16} className="text-green-400"/>
              <p className="font-semibold text-green-300">Campaign Launched!</p>
            </div>
            <p className="text-sm text-gray-300">{result.message}</p>
            {result.batch_id && (
              <p className="text-xs text-gray-500 mt-2 font-mono">Batch ID: {result.batch_id}</p>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Watch your CRM — lead stages will update automatically as calls complete.
            </p>
          </div>
        )}

        {/* Launch button */}
        <button
          onClick={launch}
          disabled={launching || !leadCount || loadingCount}
          className={cn(
            'w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all',
            launching || !leadCount || loadingCount
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-500 active:bg-green-700 text-white shadow-lg shadow-green-900/30'
          )}
        >
          {launching ? (
            <>
              <Loader2 size={18} className="animate-spin"/> Launching Campaign...
            </>
          ) : (
            <>
              <Zap size={18}/>
              Launch Campaign
              {leadCount != null && leadCount > 0 && (
                <span className="text-green-200 font-normal text-sm">
                  ({leadCount.toLocaleString()} calls)
                </span>
              )}
            </>
          )}
        </button>

        {!leadCount && !loadingCount && (
          <p className="text-center text-xs text-gray-600">
            No leads found for the selected stage. Choose a different stage or check your CRM.
          </p>
        )}

        <div className="h-8"/>
      </div>
    </div>
  )
}
