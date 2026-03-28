'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Phone, ChevronLeft, ChevronRight, Building2, Mail,
  ThumbsUp, ThumbsDown, Voicemail, PhoneMissed, CalendarPlus,
  Ban, Loader2, Users, CheckCircle2, Filter, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
type Stage = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'demo_held' | 'follow_up' | 'closed_won' | 'closed_lost' | 'active_client'

interface CRMLead {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  business_name: string | null
  stage: Stage
  program_interest: string | null
  source: string
  notes: string | null
  follow_up_at: string | null
}

// ─── Dispositions ─────────────────────────────────────────────────────────────
const DISPOSITIONS = [
  { key: 'interested',    label: 'Interested',    icon: ThumbsUp,    color: 'bg-green-500 hover:bg-green-600 text-white',   newStage: 'qualified' as Stage,        actType: 'call' },
  { key: 'book_demo',     label: 'Book Demo',     icon: CalendarPlus,color: 'bg-purple-500 hover:bg-purple-600 text-white',  newStage: 'demo_scheduled' as Stage,   actType: 'call' },
  { key: 'voicemail',     label: 'Voicemail',     icon: Voicemail,   color: 'bg-amber-500 hover:bg-amber-600 text-white',   newStage: 'contacted' as Stage,        actType: 'voicemail' },
  { key: 'no_answer',     label: 'No Answer',     icon: PhoneMissed, color: 'bg-gray-400 hover:bg-gray-500 text-white',     newStage: 'contacted' as Stage,        actType: 'call' },
  { key: 'not_interested',label: 'Not Interested',icon: ThumbsDown,  color: 'bg-red-400 hover:bg-red-500 text-white',       newStage: 'closed_lost' as Stage,      actType: 'call' },
  { key: 'dnc',           label: 'DNC',           icon: Ban,         color: 'bg-red-700 hover:bg-red-800 text-white',       newStage: null,                        actType: 'call' },
]

const PROGRAM_LABEL: Record<string, string> = { program_a: 'Program A', program_b: 'Program B', program_c: 'Program C' }
const PROGRAM_BADGE: Record<string, string> = {
  program_a: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  program_b: 'bg-emerald-100 text-emerald-700',
  program_c: 'bg-blue-100 text-blue-700',
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DialerClient() {
  const [leads, setLeads]         = useState<CRMLead[]>([])
  const [index, setIndex]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [acting, setActing]       = useState(false)
  const [called, setCalled]       = useState(false)
  const [note, setNote]           = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [programFilter, setProgramFilter] = useState('')
  const [skipped, setSkipped]     = useState(0)
  const [done, setDone]           = useState(0)

  const load = useCallback(async (stage: string) => {
    setLoading(true)
    setIndex(0)
    setCalled(false)
    setNote('')
    try {
      const p = new URLSearchParams()
      p.set('stage', stage)
      if (programFilter) p.set('program', programFilter)
      const res  = await fetch(`/api/admin/crm/leads?${p}`)
      const json = await res.json()
      setLeads((json.leads ?? []).filter((l: CRMLead & { do_not_call: boolean }) => !l.do_not_call))
    } catch { toast.error('Failed to load leads') }
    finally { setLoading(false) }
  }, [programFilter])

  useEffect(() => {
    if (stageFilter) load(stageFilter)
  }, [stageFilter, load])

  const current = leads[index]
  const total   = leads.length
  const remaining = total - index

  async function logAndAdvance(disposition: typeof DISPOSITIONS[number]) {
    if (!current) return
    setActing(true)
    try {
      // Update stage
      if (disposition.newStage && disposition.newStage !== current.stage) {
        await fetch(`/api/admin/crm/leads/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: disposition.newStage, last_contacted_at: new Date().toISOString() }),
        })
      }
      // DNC
      if (disposition.key === 'dnc') {
        await fetch(`/api/admin/crm/leads/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ do_not_call: true }),
        })
      }
      // Log activity
      await fetch('/api/admin/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: current.id,
          type: disposition.actType,
          body: [disposition.label, note.trim()].filter(Boolean).join(' — ') || disposition.label,
          metadata: { disposition: disposition.key },
        }),
      })
      setDone(d => d + 1)
      advance()
    } catch { toast.error('Failed to log') }
    finally { setActing(false) }
  }

  function advance() {
    setCalled(false)
    setNote('')
    setIndex(i => i + 1)
  }

  function skip() {
    setSkipped(s => s + 1)
    advance()
  }

  // ── Stage picker splash ──────────────────────────────────────────────────────
  if (!stageFilter) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
      <Link href="/admin/crm" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 mb-10 self-start absolute top-4 left-4">
        <ChevronLeft size={16}/> CRM
      </Link>
      <Phone size={36} className="text-green-500 mb-4"/>
      <h1 className="text-2xl font-bold text-white mb-2">Dialer Mode</h1>
      <p className="text-gray-400 text-sm mb-8 text-center">Choose a stage to dial through. Only leads in that stage will be loaded.</p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {[
          { k: 'new',            l: 'New',            sub: 'Cold outreach',       color: 'border-gray-600 hover:border-gray-400' },
          { k: 'contacted',      l: 'Contacted',      sub: 'Already reached',     color: 'border-blue-700 hover:border-blue-500' },
          { k: 'qualified',      l: 'Qualified',      sub: 'Warm leads',          color: 'border-amber-700 hover:border-amber-500' },
          { k: 'demo_scheduled', l: 'Demo Scheduled', sub: 'Confirm demo',        color: 'border-purple-700 hover:border-purple-500' },
          { k: 'demo_held',      l: 'Demo Held',      sub: 'Post-demo follow-up', color: 'border-indigo-700 hover:border-indigo-500' },
          { k: 'follow_up',      l: 'Follow Up',      sub: 'Scheduled callbacks', color: 'border-orange-700 hover:border-orange-500' },
        ].map(s => (
          <button key={s.k} onClick={() => setStageFilter(s.k)}
            className={cn('flex flex-col items-start px-4 py-3 rounded-xl border bg-gray-900 transition-colors text-left', s.color)}>
            <span className="text-white font-semibold text-sm">{s.l}</span>
            <span className="text-gray-500 text-xs mt-0.5">{s.sub}</span>
          </button>
        ))}
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-gray-400"/>
    </div>
  )

  // Done
  if (!current && !loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <CheckCircle2 size={52} className="text-green-500 mb-4"/>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Queue Complete!</h2>
      <p className="text-gray-500 mb-2">{done} contacted · {skipped} skipped</p>
      <p className="text-sm text-gray-400 mb-8">You've gone through all leads in this filter.</p>
      <div className="flex gap-3">
        <button onClick={() => { setStageFilter(null); setLeads([]); setDone(0); setSkipped(0) }} className="btn-primary px-6 py-3">Change Stage</button>
        <button onClick={() => stageFilter && load(stageFilter)} className="btn-secondary px-6 py-3">Reload Queue</button>
        <Link href="/admin/crm" className="btn-secondary px-6 py-3">Back to CRM</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex flex-col">
          <Link href="/admin" className="text-xs text-gray-600 hover:text-green-500 font-medium inline-flex items-center gap-0.5 leading-none mb-0.5">
            <ChevronLeft size={12}/> Admin
          </Link>
          <Link href="/admin/crm" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
            <ChevronLeft size={18}/> CRM
          </Link>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 font-medium">DIALER MODE</p>
          <p className="text-xs text-gray-400">
            {[
              {k:'new',l:'New'},{k:'contacted',l:'Contacted'},{k:'qualified',l:'Qualified'},
              {k:'demo_scheduled',l:'Demo Scheduled'},{k:'demo_held',l:'Demo Held'},{k:'follow_up',l:'Follow Up'},{k:'active_client',l:'Active Client'},
            ].find(s=>s.k===stageFilter)?.l ?? stageFilter} · {remaining} left · {done} done
          </p>
        </div>
        <button onClick={() => setShowFilters(p => !p)} className={cn('p-2 rounded-lg transition-colors', showFilters ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400')}>
          <Filter size={16}/>
        </button>
      </div>

      {/* ── Filters ── */}
      {showFilters && (
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 space-y-3">
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Stage</p>
            <div className="flex gap-2 flex-wrap">
              {[
                {k:'new',l:'New'},
                {k:'contacted',l:'Contacted'},
                {k:'qualified',l:'Qualified'},
                {k:'demo_scheduled',l:'Demo Scheduled'},
                {k:'demo_held',l:'Demo Held'},
                {k:'follow_up',l:'Follow Up'},
                {k:'active_client',l:'Active Client'},
              ].map(s=>(
                <button key={s.k} onClick={()=>{ setStageFilter(s.k); setShowFilters(false) }}
                  className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-colors', stageFilter===s.k ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400')}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Program</p>
            <div className="flex gap-2 flex-wrap">
              {[{k:'',l:'All'},{k:'program_a',l:'Prog A'},{k:'program_b',l:'Prog B'},{k:'program_c',l:'Prog C'}].map(p=>(
                <button key={p.k} onClick={()=>setProgramFilter(p.k)}
                  className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-colors', programFilter===p.k ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400')}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
          <button onClick={()=>setShowFilters(false)} className="w-full btn-primary text-sm py-2">Apply</button>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="h-1 bg-gray-800">
        <div className="h-1 bg-green-500 transition-all duration-300" style={{width:`${total ? ((index)/total)*100 : 0}%`}}/>
      </div>

      {/* ── Lead card ── */}
      <div className="flex-1 flex flex-col px-4 pt-6 pb-4">
        <div className="bg-gray-900 rounded-3xl p-6 mb-5 border border-gray-800">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white">{current.first_name} {current.last_name}</h2>
              {current.business_name && (
                <p className="text-gray-400 flex items-center gap-1.5 mt-0.5">
                  <Building2 size={13}/> {current.business_name}
                </p>
              )}
            </div>
            {current.program_interest && (
              <span className={cn('badge text-xs px-2.5 py-1 shrink-0', PROGRAM_BADGE[current.program_interest])}>
                {PROGRAM_LABEL[current.program_interest]}
              </span>
            )}
          </div>

          {/* Big call button */}
          <a
            href={`tel:${current.phone}`}
            onClick={() => setCalled(true)}
            className={cn(
              'flex items-center justify-center gap-3 w-full py-5 rounded-2xl text-xl font-bold transition-all active:scale-[0.98]',
              called
                ? 'bg-gray-700 text-gray-300'
                : 'bg-green-500 hover:bg-green-600 active:bg-green-700 text-white shadow-lg shadow-green-900/40'
            )}
          >
            <Phone size={24}/> {current.phone}
          </a>

          {current.email && (
            <p className="text-gray-500 text-xs flex items-center gap-1.5 mt-3 justify-center">
              <Mail size={11}/> {current.email}
            </p>
          )}

          {current.notes && (
            <div className="mt-4 bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-300 leading-relaxed">{current.notes}</p>
            </div>
          )}
        </div>

        {/* Quick note */}
        <div className="mb-4">
          <input
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-600"
            placeholder="Quick note (optional)..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {/* Disposition buttons */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {DISPOSITIONS.map(d => {
            const Icon = d.icon
            return (
              <button
                key={d.key}
                onClick={() => logAndAdvance(d)}
                disabled={acting}
                className={cn('flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-50', d.color)}
              >
                <Icon size={18}/> {d.label}
              </button>
            )
          })}
        </div>

        {/* Skip + nav */}
        <div className="flex items-center gap-3">
          <button onClick={skip} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gray-800 text-gray-400 text-sm font-medium hover:bg-gray-700 transition-colors">
            <ChevronRight size={16}/> Skip
          </button>
          <div className="text-center text-xs text-gray-600 px-2">
            {index + 1} / {total}
          </div>
          <Link href={`/admin/crm/${current.id}`} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gray-800 text-gray-400 text-sm font-medium hover:bg-gray-700 transition-colors">
            <Users size={15}/> Full Profile
          </Link>
        </div>
      </div>
    </div>
  )
}
