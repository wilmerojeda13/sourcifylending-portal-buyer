'use client'
import { useRouter, useSearchParams } from 'next/navigation'

interface Campaign { id: string; name: string }

export default function LogsFilterBar({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter()
  const params = useSearchParams()

  const update = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString())
    if (value) p.set(key, value); else p.delete(key)
    p.set('page', '1')
    router.push(`/admin/voice/logs?${p}`)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3">
      <select
        defaultValue={params.get('campaign_id') ?? ''}
        onChange={e => update('campaign_id', e.target.value)}
        className="input-field w-44 py-2 text-sm"
      >
        <option value="">All Campaigns</option>
        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select
        defaultValue={params.get('disposition') ?? ''}
        onChange={e => update('disposition', e.target.value)}
        className="input-field w-48 py-2 text-sm"
      >
        <option value="">All Dispositions</option>
        {['transferred_live','send_link','callback_requested','interested','decision_maker','not_interested','voicemail','no_answer','do_not_call','bad_number','wrong_number','gatekeeper','business_closed','personal_line'].map(d => (
          <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>
        ))}
      </select>
      <select
        defaultValue={params.get('status') ?? ''}
        onChange={e => update('status', e.target.value)}
        className="input-field w-36 py-2 text-sm"
      >
        <option value="">All Statuses</option>
        {['completed','failed','no-answer','busy','canceled'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  )
}
