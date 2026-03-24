'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Settings, Phone, Mic, Shield, Sliders, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface VoiceSettings {
  twilio_account_sid: string
  twilio_auth_token: string
  twilio_caller_id: string
  gemini_api_key: string
  voice_server_ws_url: string
  max_call_attempts: number
  min_call_gap_hours: number
  calling_hours_start: string
  calling_hours_end: string
  calling_days: string[]
  timezone: string
  recording_enabled: boolean
  recording_disclosure: string
  scoring_weights: Record<string, number>
  env_status?: {
    has_twilio_sid: boolean
    has_twilio_token: boolean
    has_twilio_caller_id: boolean
    has_gemini_key: boolean
    has_voice_server_url: boolean
  }
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

export default function VoiceSettingsPage() {
  const [settings, setSettings] = useState<VoiceSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/voice/settings').then(r => r.json()).then(d => {
      setSettings(d.settings)
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    const { env_status, ...payload } = settings
    const r = await fetch('/api/voice/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await r.json()
    if (r.ok) {
      toast.success('Settings saved')
      setSettings(prev => prev ? { ...prev, ...d.settings } : prev)
    } else {
      toast.error(d.error ?? 'Failed to save')
    }
    setSaving(false)
  }

  const toggleDay = (day: string) => {
    if (!settings) return
    const days = settings.calling_days ?? []
    setSettings(s => s ? ({
      ...s,
      calling_days: days.includes(day) ? days.filter(d => d !== day) : [...days, day],
    }) : s)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
        <Loader2 size={20} className="animate-spin" /> Loading settings…
      </div>
    )
  }

  if (!settings) return <div className="p-6 text-gray-500">Failed to load settings.</div>

  const env = settings.env_status
  const allEnvSet = env && env.has_twilio_sid && env.has_twilio_token && env.has_twilio_caller_id && env.has_gemini_key && env.has_voice_server_url

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voice Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure Twilio, Gemini, dialing rules, and compliance</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Settings size={15} /> Save Changes</>}
        </button>
      </div>

      {/* Environment variable status */}
      {env && (
        <div className={`rounded-2xl border p-4 ${allEnvSet ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`font-semibold text-sm mb-3 ${allEnvSet ? 'text-green-800' : 'text-amber-800'}`}>
            Environment Variables Status
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['TWILIO_ACCOUNT_SID', env.has_twilio_sid],
              ['TWILIO_AUTH_TOKEN', env.has_twilio_token],
              ['TWILIO_CALLER_ID', env.has_twilio_caller_id],
              ['GEMINI_API_KEY', env.has_gemini_key],
              ['VOICE_SERVER_WS_URL', env.has_voice_server_url],
            ].map(([name, ok]) => (
              <div key={name as string} className="flex items-center gap-2">
                {ok ? <CheckCircle size={13} className="text-green-600 shrink-0" /> : <XCircle size={13} className="text-red-500 shrink-0" />}
                <span className={`text-xs font-mono ${ok ? 'text-green-700' : 'text-red-600'}`}>{name as string}</span>
              </div>
            ))}
          </div>
          {!allEnvSet && (
            <p className="text-xs text-amber-700 mt-3">
              Set these in your Vercel project environment variables. After adding, redeploy.
            </p>
          )}
        </div>
      )}

      {/* Twilio config */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Phone size={16} className="text-indigo-500" /> Twilio Configuration</h2>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="label">Twilio Account SID</label>
            <input
              value={settings.twilio_account_sid ?? ''}
              onChange={e => setSettings(s => s ? ({ ...s, twilio_account_sid: e.target.value }) : s)}
              placeholder="Stored in env (TWILIO_ACCOUNT_SID)"
              className="input-field font-mono text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Prefer using the Vercel env var. Only set here as override.</p>
          </div>
          <div>
            <label className="label">Twilio Auth Token</label>
            <input
              type="password"
              value={settings.twilio_auth_token ?? ''}
              onChange={e => setSettings(s => s ? ({ ...s, twilio_auth_token: e.target.value }) : s)}
              placeholder="Stored in env (TWILIO_AUTH_TOKEN)"
              className="input-field font-mono text-sm"
            />
          </div>
          <div>
            <label className="label">Caller ID (Twilio Phone Number)</label>
            <input
              value={settings.twilio_caller_id ?? ''}
              onChange={e => setSettings(s => s ? ({ ...s, twilio_caller_id: e.target.value }) : s)}
              placeholder="+15551234567"
              className="input-field font-mono"
            />
          </div>
        </div>
      </div>

      {/* Gemini + Voice server */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Mic size={16} className="text-indigo-500" /> AI Voice Server</h2>
        <div>
          <label className="label">Gemini API Key</label>
          <input
            type="password"
            value={settings.gemini_api_key ?? ''}
            onChange={e => setSettings(s => s ? ({ ...s, gemini_api_key: e.target.value }) : s)}
            placeholder="Stored in env (GEMINI_API_KEY)"
            className="input-field font-mono text-sm"
          />
        </div>
        <div>
          <label className="label">Voice Server WebSocket URL</label>
          <input
            value={settings.voice_server_ws_url ?? ''}
            onChange={e => setSettings(s => s ? ({ ...s, voice_server_ws_url: e.target.value }) : s)}
            placeholder="wss://your-voice-server.railway.app/stream"
            className="input-field font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            The public WebSocket URL of your running voice-server.mjs. Deploy on Railway, Render, or a VPS.
          </p>
        </div>
      </div>

      {/* Dialing rules */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Sliders size={16} className="text-indigo-500" /> Dialing Rules</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Max Call Attempts per Lead</label>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.max_call_attempts ?? 3}
              onChange={e => setSettings(s => s ? ({ ...s, max_call_attempts: parseInt(e.target.value) }) : s)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Min Gap Between Calls (hours)</label>
            <input
              type="number"
              min={1}
              max={72}
              value={settings.min_call_gap_hours ?? 24}
              onChange={e => setSettings(s => s ? ({ ...s, min_call_gap_hours: parseInt(e.target.value) }) : s)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Calling Hours Start</label>
            <input
              type="time"
              value={settings.calling_hours_start ?? '09:00'}
              onChange={e => setSettings(s => s ? ({ ...s, calling_hours_start: e.target.value }) : s)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Calling Hours End</label>
            <input
              type="time"
              value={settings.calling_hours_end ?? '17:00'}
              onChange={e => setSettings(s => s ? ({ ...s, calling_hours_end: e.target.value }) : s)}
              className="input-field"
            />
          </div>
        </div>
        <div>
          <label className="label">Timezone</label>
          <select
            value={settings.timezone ?? 'America/New_York'}
            onChange={e => setSettings(s => s ? ({ ...s, timezone: e.target.value }) : s)}
            className="input-field"
          >
            {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu'].map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Calling Days</label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  (settings.calling_days ?? []).includes(day)
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {DAY_LABELS[day]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Compliance */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Shield size={16} className="text-indigo-500" /> Compliance</h2>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="recording"
            checked={settings.recording_enabled ?? false}
            onChange={e => setSettings(s => s ? ({ ...s, recording_enabled: e.target.checked }) : s)}
            className="w-4 h-4 accent-indigo-600"
          />
          <label htmlFor="recording" className="text-sm text-gray-700 font-medium">Enable call recording</label>
        </div>
        {settings.recording_enabled && (
          <div>
            <label className="label">Recording Disclosure (spoken at start of call)</label>
            <textarea
              value={settings.recording_disclosure ?? ''}
              onChange={e => setSettings(s => s ? ({ ...s, recording_disclosure: e.target.value }) : s)}
              rows={3}
              placeholder="This call may be recorded for quality assurance purposes."
              className="input-field"
            />
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>B2B Mode Only.</strong> This platform dials business phone numbers only. All leads are subject to TCPA compliance guidelines. Maintain your internal DNC list. You are solely responsible for ensuring compliance with applicable federal, state, and local laws.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary px-6 py-2.5 flex items-center gap-2">
          {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Settings size={15} /> Save All Settings</>}
        </button>
      </div>
    </div>
  )
}
