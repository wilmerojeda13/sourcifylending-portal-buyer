'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  CalendarPlus,
  Clock3,
  ChevronDown,
  Loader2,
  PhoneMissed,
  PhoneOff,
  Save,
  ThumbsDown,
  ThumbsUp,
  Voicemail,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type UIDisposition = {
  key: string
  label: string
  icon: typeof ThumbsUp
  color: string
  needsFollowUp?: boolean
}

const UI_DISPOSITIONS: readonly UIDisposition[] = [
  { key: 'interested', label: 'Interested', icon: ThumbsUp, color: 'bg-green-600 hover:bg-green-700 text-white' },
  { key: 'appointment_set', label: 'Appointment Set', icon: CalendarPlus, color: 'bg-purple-600 hover:bg-purple-700 text-white' },
  { key: 'demo_no_show', label: 'Demo No Show', icon: PhoneMissed, color: 'bg-slate-700 hover:bg-slate-800 text-white' },
  { key: 'follow_up', label: 'Follow Up', icon: Clock3, color: 'bg-blue-600 hover:bg-blue-700 text-white', needsFollowUp: true },
  { key: 'call_back', label: 'Call Back', icon: Clock3, color: 'bg-cyan-600 hover:bg-cyan-700 text-white', needsFollowUp: true },
  { key: 'voicemail', label: 'Voicemail', icon: Voicemail, color: 'bg-amber-600 hover:bg-amber-700 text-white' },
  { key: 'no_answer', label: 'No Answer', icon: PhoneMissed, color: 'bg-gray-600 hover:bg-gray-700 text-white' },
  { key: 'busy', label: 'Busy', icon: PhoneOff, color: 'bg-slate-700 hover:bg-slate-800 text-white' },
  { key: 'bad_number', label: 'Bad Number', icon: PhoneOff, color: 'bg-orange-700 hover:bg-orange-800 text-white' },
  { key: 'not_interested', label: 'Not Interested', icon: ThumbsDown, color: 'bg-red-500 hover:bg-red-600 text-white' },
  { key: 'dnc', label: 'DNC / Remove', icon: Ban, color: 'bg-red-800 hover:bg-red-900 text-white' },
] as const

export type CRMDispositionFormValue = {
  disposition_key: UIDisposition['key']
  note: string
  follow_up_at: string
}

export default function CRMDispositionForm({
  initialDispositionKey,
  initialNote = '',
  initialFollowUpAt = '',
  onSubmit,
  submitting = false,
  error = null,
  lastDisposition,
  compact = false,
}: {
  initialDispositionKey?: UIDisposition['key'] | null
  initialNote?: string
  initialFollowUpAt?: string
  onSubmit: (value: CRMDispositionFormValue) => Promise<void>
  submitting?: boolean
  error?: string | null
  lastDisposition?: {
    label: string
    by?: string | null
    at?: string | null
    note?: string | null
    followUpAt?: string | null
  } | null
  compact?: boolean
}) {
  const [selectedKey, setSelectedKey] = useState<UIDisposition['key'] | null>(initialDispositionKey ?? null)
  const [note, setNote] = useState(initialNote)
  const [followUpAt, setFollowUpAt] = useState(initialFollowUpAt)

  useEffect(() => {
    setSelectedKey(initialDispositionKey ?? null)
  }, [initialDispositionKey])

  useEffect(() => {
    setNote(initialNote)
  }, [initialNote])

  useEffect(() => {
    setFollowUpAt(initialFollowUpAt)
  }, [initialFollowUpAt])

  // Clear follow-up date when switching to a disposition that doesn't need it
  // This prevents stale form state from breaking saves
  const handleDispositionSelect = (key: UIDisposition['key']) => {
    const disposition = UI_DISPOSITIONS.find((d) => d.key === key)
    // If switching TO a disposition that needs follow-up, keep the current value
    // If switching AWAY from a disposition that needs follow-up, clear it
    // Otherwise (non-follow-up dispositions), clear the follow-up field
    if (disposition?.needsFollowUp) {
      // Keep existing follow-up if there is one, otherwise don't change
    } else {
      // Clear follow-up for non-follow-up dispositions
      setFollowUpAt('')
    }
    setSelectedKey(key)
  }

  const selectedDisposition = useMemo(
    () => UI_DISPOSITIONS.find((item) => item.key === selectedKey) ?? null,
    [selectedKey],
  )

  async function handleSubmit() {
    if (!selectedDisposition) return
    await onSubmit({
      disposition_key: selectedDisposition.key,
      note,
      follow_up_at: followUpAt,
    })
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {lastDisposition && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900/60">
          <div className="font-semibold text-gray-900 dark:text-white">{lastDisposition.label}</div>
          <div className="mt-1 text-xs text-gray-500">
            {[lastDisposition.by, lastDisposition.at].filter(Boolean).join(' • ')}
          </div>
          {lastDisposition.note && <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{lastDisposition.note}</div>}
          {lastDisposition.followUpAt && (
            <div className="mt-1 text-xs font-medium text-blue-600">Follow-up: {lastDisposition.followUpAt}</div>
          )}
        </div>
      )}

      <div className={cn('grid gap-1.5', compact ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5')}>
        {UI_DISPOSITIONS.map((disposition) => {
          const Icon = disposition.icon
          return (
            <button
              key={disposition.key}
              type="button"
              onClick={() => handleDispositionSelect(disposition.key)}
              className={cn(
                'rounded-xl px-2.5 py-2 text-xs font-semibold transition-all',
                disposition.color,
                selectedKey === disposition.key ? 'ring-2 ring-offset-1 ring-green-400' : '',
              )}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Icon size={13} />
                <span>{disposition.label}</span>
              </div>
            </button>
          )
        })}
      </div>

      <details className="rounded-xl border border-gray-200 bg-gray-50 md:hidden dark:border-gray-800 dark:bg-gray-900/60">
        <summary className="flex list-none items-center justify-between gap-3 px-3 py-2.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Call note</p>
            <p className="mt-0.5 text-xs text-gray-500">Collapsed by default</p>
          </div>
          <ChevronDown size={14} className="text-gray-400" />
        </summary>
        <div className="border-t border-gray-200 px-3 pb-3 pt-3 dark:border-gray-800">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="input-field min-h-[72px] text-sm"
            placeholder="Add context for the timeline and follow-up."
          />
        </div>
      </details>
      <div className="space-y-2 hidden md:block">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="input-field min-h-[72px] text-sm"
          placeholder="Add context for the timeline and follow-up."
        />
      </div>

      <details className="rounded-xl border border-gray-200 bg-gray-50 md:hidden dark:border-gray-800 dark:bg-gray-900/60">
        <summary className="flex list-none items-center justify-between gap-3 px-3 py-2.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Follow-up</p>
            <p className="mt-0.5 text-xs text-gray-500">Collapsed by default</p>
          </div>
          {selectedDisposition?.needsFollowUp && <span className="text-[11px] font-semibold text-red-500">Required</span>}
        </summary>
        <div className="border-t border-gray-200 px-3 pb-3 pt-3 dark:border-gray-800">
          <input
            type="datetime-local"
            value={followUpAt}
            onChange={(event) => setFollowUpAt(event.target.value)}
            className={cn(
              'input-field text-sm',
              selectedDisposition?.needsFollowUp && !followUpAt ? 'border-red-300 focus:border-red-400' : '',
            )}
          />
        </div>
      </details>
      <div className="space-y-2 hidden md:block">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Follow-up date/time</label>
          {selectedDisposition?.needsFollowUp && <span className="text-[11px] font-semibold text-red-500">Required</span>}
        </div>
        <input
          type="datetime-local"
          value={followUpAt}
          onChange={(event) => setFollowUpAt(event.target.value)}
          className={cn(
            'input-field text-sm',
            selectedDisposition?.needsFollowUp && !followUpAt ? 'border-red-300 focus:border-red-400' : '',
          )}
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selectedDisposition || submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Set disposition
      </button>
    </div>
  )
}
