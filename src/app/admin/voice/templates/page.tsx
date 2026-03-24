'use client'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { FileText, Plus, CheckCircle, Clock, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

interface Template {
  id: string
  name: string
  version: number
  is_active: boolean
  created_at: string
  system_prompt?: string
  opening_purchased?: string
  opening_facebook?: string
  opening_inbound?: string
  opening_other?: string
  objection_not_interested?: string
  objection_busy?: string
  objection_send_info?: string
  objection_already_funded?: string
  objection_working_with_someone?: string
  objection_what_is_this?: string
  objection_is_this_loan?: string
  objection_remove_me?: string
}

const FIELDS: { key: keyof Template; label: string; rows: number }[] = [
  { key: 'system_prompt', label: 'System Prompt (AI Persona & Instructions)', rows: 10 },
  { key: 'opening_purchased', label: 'Opening — Purchased Lead', rows: 4 },
  { key: 'opening_facebook', label: 'Opening — Facebook Lead', rows: 4 },
  { key: 'opening_inbound', label: 'Opening — Inbound Lead', rows: 4 },
  { key: 'opening_other', label: 'Opening — Other Lead', rows: 4 },
  { key: 'objection_not_interested', label: 'Objection: Not Interested', rows: 3 },
  { key: 'objection_busy', label: 'Objection: Too Busy', rows: 3 },
  { key: 'objection_send_info', label: 'Objection: Just Send Info', rows: 3 },
  { key: 'objection_already_funded', label: 'Objection: Already Funded', rows: 3 },
  { key: 'objection_working_with_someone', label: 'Objection: Working with Someone', rows: 3 },
  { key: 'objection_what_is_this', label: 'Objection: What Is This?', rows: 3 },
  { key: 'objection_is_this_loan', label: 'Objection: Is This a Loan?', rows: 3 },
  { key: 'objection_remove_me', label: 'Objection: Remove Me / DNC', rows: 3 },
]

const EMPTY_FORM: Partial<Template> = {
  name: '',
  system_prompt: '',
  opening_purchased: '',
  opening_facebook: '',
  opening_inbound: '',
  opening_other: '',
  objection_not_interested: '',
  objection_busy: '',
  objection_send_info: '',
  objection_already_funded: '',
  objection_working_with_someone: '',
  objection_what_is_this: '',
  objection_is_this_loan: '',
  objection_remove_me: '',
}

export default function TemplatesPage() {
  const [active, setActive] = useState<Template | null>(null)
  const [all, setAll] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState<Partial<Template>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/voice/templates')
    if (r.ok) {
      const d = await r.json()
      setActive(d.active)
      setAll(d.all ?? [])
      if (d.active && !showNew) {
        setForm({ ...EMPTY_FORM, ...d.active, name: `v${(d.active.version ?? 0) + 1} - ` })
      }
    }
    setLoading(false)
  }, [showNew])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error('Name is required'); return }
    if (!form.system_prompt?.trim()) { toast.error('System prompt is required'); return }
    setSaving(true)
    const r = await fetch('/api/voice/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await r.json()
    if (r.ok) {
      toast.success('Template saved and activated!')
      setShowNew(false)
      load()
    } else {
      toast.error(d.error)
    }
    setSaving(false)
  }

  const handleActivate = async (id: string) => {
    setActivatingId(id)
    const r = await fetch('/api/voice/templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (r.ok) { toast.success('Template activated'); load() } else toast.error('Failed to activate')
    setActivatingId(null)
  }

  const startNew = () => {
    setForm({ ...EMPTY_FORM, ...active, name: `v${(active?.version ?? 0) + 1} - ` })
    setShowNew(true)
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voice Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Manage AI voice scripts and system prompts</p>
        </div>
        {!showNew && (
          <button onClick={startNew} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
            <Plus size={16} /> New Version
          </button>
        )}
      </div>

      {/* Active template summary */}
      {active && !showNew && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-green-600" />
            <span className="font-bold text-green-800 text-sm">Active Template</span>
            <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">v{active.version}</span>
          </div>
          <p className="font-semibold text-gray-900">{active.name}</p>
          <p className="text-xs text-gray-500 mt-1">Created {new Date(active.created_at).toLocaleDateString()}</p>
          <button
            onClick={() => setExpandedId(expandedId === active.id ? null : active.id)}
            className="mt-3 text-xs text-green-700 hover:text-green-800 flex items-center gap-1"
          >
            {expandedId === active.id ? <><ChevronUp size={14} /> Hide details</> : <><ChevronDown size={14} /> View full template</>}
          </button>
          {expandedId === active.id && (
            <div className="mt-4 space-y-4">
              {FIELDS.map(f => active[f.key] ? (
                <div key={f.key}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{f.label}</p>
                  <pre className="text-xs text-gray-700 bg-white border border-gray-200 rounded-xl p-3 whitespace-pre-wrap font-sans leading-relaxed">
                    {active[f.key] as string}
                  </pre>
                </div>
              ) : null)}
            </div>
          )}
        </div>
      )}

      {/* New version form */}
      {showNew && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Create New Version</h2>
            <button onClick={() => setShowNew(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>

          <div>
            <label className="label">Template Name</label>
            <input
              value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. v3 - Friendly B2B Script"
              className="input-field"
            />
          </div>

          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <textarea
                value={(form[f.key] as string) ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                rows={f.rows}
                className="input-field font-mono text-xs leading-relaxed"
                placeholder={f.key === 'system_prompt' ? 'You are Sofia, a friendly business funding specialist...' : 'Script text...'}
              />
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowNew(false)} className="btn-secondary flex-1 py-2.5">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><FileText size={15} /> Save & Activate</>}
            </button>
          </div>
        </div>
      )}

      {/* Version history */}
      {all.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-sm">Version History</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {all.map(t => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-gray-500">v{t.version}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{t.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock size={10} /> {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                {t.is_active ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                    <CheckCircle size={10} /> ACTIVE
                  </span>
                ) : (
                  <button
                    onClick={() => handleActivate(t.id)}
                    disabled={activatingId === t.id}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold disabled:opacity-50"
                  >
                    {activatingId === t.id ? <Loader2 size={12} className="animate-spin" /> : 'Activate'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
          <Loader2 size={18} className="animate-spin" /> Loading templates…
        </div>
      )}
    </div>
  )
}
