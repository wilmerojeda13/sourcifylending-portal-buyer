'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Bot, Loader2, Phone, Clock, Webhook,
  CheckCircle2, AlertCircle, Info, Zap, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const DEFAULT_SCRIPT = `Hi, is this {{first_name}}?

Hey — quick heads up, you're actually speaking with an AI assistant from Sourcify Lending. I know that's a little different, but I promise to keep this super short.

I'm reaching out because we help business owners like yourself — especially at {{business_name}} — build strong business credit fast, without touching your personal credit.

I'm not here to pitch you. I just want to find out if it makes sense to connect you with one of our actual advisors for a free 15-minute demo. They'll show you exactly how much credit you could qualify for.

Is that something you'd be open to?

[If YES: Perfect! I'll flag you as interested and have someone from our team reach out to schedule that. What's the best email to send a calendar link to?]
[If NO / Not interested: Totally understand, I appreciate you picking up. I'll make a note and we won't bother you again. Have a great day!]
[If asks to speak to human: Absolutely — I'll mark you as a priority and have one of our advisors call you personally. You should hear from them within 24 hours.]
[If speaks Spanish: Switch to Spanish immediately — "Por supuesto, puedo continuar en español. Somos Sourcify Lending y ayudamos a dueños de negocios a construir crédito comercial. ¿Tiene un momento para escuchar más?"]`

const STAGE_OPTIONS = [
  { value: 'all', label: 'All Active Leads' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'demo_held', label: 'Demo Held' },
]

const WEBHOOK_URL = 'https://sourcifylending.com/api/webhooks/vapi'

interface LaunchResult {
  total: number
  succeeded: number
  failed: number
  message: string
}

export default function CampaignClient() {
  const [stage, setStage] = useState('new')
  const [script, setScript] = useState(DEFAULT_SCRIPT)
  const [maxDuration, setMaxDuration] = useState(2)
  const [leadCount, setLeadCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [result, setResult] = useState<LaunchResult | null>(null)

  // Test call state
  const [testPhone, setTestPhone] = useState('')
  const [testCalling, setTestCalling] = useState(false)

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

  async function sendTestCall() {
    if (!testPhone.trim()) { toast.error('Enter a phone number'); return }
    setTestCalling(true)
    try {
      const res = await fetch('/api/admin/crm/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: testPhone.trim(), first_name: 'Admin', business_name: 'Test' }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Test call initiated! You should receive a call shortly.')
      } else {
        toast.error(json.error ?? 'Failed to initiate test call')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setTestCalling(false)
    }
  }

  async function launch() {
    if (!leadCount) { toast.error('No leads to call'); return }
    const callCount = Math.min(leadCount, 500)
    const confirmed = window.confirm(
      `Launch AI voice campaign for up to ${callCount.toLocaleString()} leads?\n\nThis will immediately begin calling leads via VAPI.\n\nCampaigns are capped at 500 leads per run — run again to continue.`
    )
    if (!confirmed) return

    setLaunching(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/crm/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, script, max_duration: maxDuration }),
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
            Automatically call your leads using an AI voice agent powered by VAPI. Transparent AI script — discloses AI upfront, books demos, switches to Spanish automatically. CRM updates after every call.
          </p>
        </div>

        {/* Lead count summary */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {loadingCount
                  ? <Loader2 size={20} className="animate-spin text-gray-500"/>
                  : <p className="text-2xl font-bold text-white">{leadCount?.toLocaleString() ?? '—'}</p>
                }
              </div>
              <p className="text-xs text-gray-500">Leads to call</p>
            </div>
            <div className="text-center border-l border-gray-800">
              <p className="text-2xl font-bold text-amber-400">{maxDuration}m</p>
              <p className="text-xs text-gray-500">Max per call</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-600 text-center mt-3">
            Campaigns run up to 500 leads at a time. Run again to continue calling remaining leads.
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
              AI Script (First Message Override)
            </label>
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              rows={12}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 resize-y font-mono leading-relaxed"
              placeholder="Enter the opening message the AI will say. Leave blank to use your VAPI assistant's default script."
            />
            <p className="text-xs text-gray-600 mt-1.5">
              Use {'{{first_name}}'}, {'{{last_name}}'}, {'{{business_name}}'} as dynamic variables. Leave blank to use your assistant&apos;s default configured script.
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
              VAPI will POST call results here. CRM stages update automatically after every call.
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
              'The AI calls each lead via VAPI, immediately discloses it\'s an AI, and pivots to booking a demo with a real human.',
              'The AI detects if the call was answered, went to voicemail, or had no answer — and handles each differently.',
              'If the lead speaks Spanish, the AI switches languages automatically mid-call.',
              'Your CRM automatically updates the lead\'s stage and logs a call activity — within seconds.',
              'Campaigns are capped at 500 leads per run. Run again to continue calling the rest.',
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

        {/* Test Call */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Phone size={14} className="text-green-400 shrink-0"/>
            <p className="text-sm font-semibold text-gray-200">Test Call</p>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Send a single test call to verify your VAPI assistant is working before launching a campaign.
          </p>
          <div className="flex gap-2">
            <input
              type="tel"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="+1 305 000 0000"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
            <button
              onClick={sendTestCall}
              disabled={testCalling}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap',
                testCalling
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              )}
            >
              {testCalling ? <Loader2 size={14} className="animate-spin"/> : <Phone size={14}/>}
              {testCalling ? 'Calling...' : 'Call Me Now'}
            </button>
          </div>
        </div>

        {/* Result card */}
        {result && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={16} className="text-green-400"/>
              <p className="font-semibold text-green-300">Campaign Launched!</p>
            </div>
            <p className="text-sm text-gray-300">{result.message}</p>
            <div className="flex gap-4 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-white">{result.total}</p>
                <p className="text-[11px] text-gray-500">Total</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{result.succeeded}</p>
                <p className="text-[11px] text-gray-500">Succeeded</p>
              </div>
              {result.failed > 0 && (
                <div className="text-center">
                  <p className="text-lg font-bold text-red-400">{result.failed}</p>
                  <p className="text-[11px] text-gray-500">Failed</p>
                </div>
              )}
            </div>
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
                  (up to {Math.min(leadCount, 500).toLocaleString()} calls)
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

        <p className="text-center text-xs text-gray-700">
          Campaigns run up to 500 leads at a time. Run again to continue.
        </p>

        <div className="h-8"/>
      </div>
    </div>
  )
}
