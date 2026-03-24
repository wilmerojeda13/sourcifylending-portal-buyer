import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ScrollText, Download } from 'lucide-react'

const DISP_COLOR: Record<string, string> = {
  transferred_live: 'bg-green-100 text-green-700', send_link: 'bg-blue-100 text-blue-700',
  callback_requested: 'bg-indigo-100 text-indigo-700', interested: 'bg-emerald-100 text-emerald-700',
  decision_maker: 'bg-purple-100 text-purple-700', not_interested: 'bg-gray-100 text-gray-500',
  voicemail: 'bg-amber-100 text-amber-700', no_answer: 'bg-gray-100 text-gray-400',
  do_not_call: 'bg-red-100 text-red-600', bad_number: 'bg-red-100 text-red-500',
  wrong_number: 'bg-red-100 text-red-500', gatekeeper: 'bg-yellow-100 text-yellow-700',
  business_closed: 'bg-gray-100 text-gray-500', personal_line: 'bg-orange-100 text-orange-600',
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-600',
  'no-answer': 'bg-gray-100 text-gray-500', busy: 'bg-amber-100 text-amber-700',
  canceled: 'bg-gray-100 text-gray-400',
}

interface Props { searchParams: { page?: string; disposition?: string; campaign_id?: string; status?: string } }

export default async function CallLogsPage({ searchParams }: Props) {
  const supabase = await createServiceClient()
  const page     = Math.max(1, parseInt(searchParams.page ?? '1'))
  const limit    = 50
  const offset   = (page - 1) * limit

  let query = supabase
    .from('voice_calls')
    .select(`*, voice_leads(business_name, owner_name, phone_e164, lead_source), voice_campaigns(name)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (searchParams.disposition) query = query.eq('disposition', searchParams.disposition)
  if (searchParams.campaign_id) query = query.eq('campaign_id', searchParams.campaign_id)
  if (searchParams.status)      query = query.eq('status', searchParams.status)

  const { data: calls, count } = await query
  const { data: campaigns }    = await supabase.from('voice_campaigns').select('id, name').order('name')

  const totalPages = Math.ceil((count ?? 0) / limit)
  const list = calls ?? []

  const qualified = list.filter(c => ['decision_maker','interested','send_link','callback_requested','transferred_live'].includes(c.disposition ?? '')).length
  const connects  = list.filter(c => c.status === 'completed' && (c.duration_seconds ?? 0) > 5).length

  const buildUrl = (params: Record<string, string>) => {
    const p = new URLSearchParams({ ...(searchParams as Record<string, string>), ...params })
    return `/admin/voice/logs?${p}`
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Logs</h1>
          <p className="text-sm text-gray-500 mt-1">{count ?? 0} total calls · {connects} connects · {qualified} qualified</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3">
        <select defaultValue={searchParams.campaign_id ?? ''} onChange={e => { window.location.href = buildUrl({ campaign_id: e.target.value, page: '1' }) }} className="input-field w-44 py-2 text-sm">
          <option value="">All Campaigns</option>
          {(campaigns ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select defaultValue={searchParams.disposition ?? ''} onChange={e => { window.location.href = buildUrl({ disposition: e.target.value, page: '1' }) }} className="input-field w-48 py-2 text-sm">
          <option value="">All Dispositions</option>
          {['transferred_live','send_link','callback_requested','interested','decision_maker','not_interested','voicemail','no_answer','do_not_call','bad_number','wrong_number','gatekeeper','business_closed','personal_line'].map(d => (
            <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select defaultValue={searchParams.status ?? ''} onChange={e => { window.location.href = buildUrl({ status: e.target.value, page: '1' }) }} className="input-field w-36 py-2 text-sm">
          <option value="">All Statuses</option>
          {['completed','failed','no-answer','busy','canceled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {list.length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No calls found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Date/Time','Business','Phone','Campaign','Status','Disposition','Duration',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.map((call) => {
                  const lead = call.voice_leads as Record<string, string> | null
                  const campaign = call.voice_campaigns as Record<string, string> | null
                  const disp = call.disposition as string | null
                  const status = call.status as string
                  return (
                    <tr key={call.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(call.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                        {lead?.business_name || lead?.owner_name || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{call.to_number || lead?.phone_e164 || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{campaign?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {disp ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DISP_COLOR[disp] ?? 'bg-gray-100 text-gray-500'}`}>{disp.replace(/_/g, ' ')}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{call.duration_seconds ? `${call.duration_seconds}s` : '—'}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/voice/calls/${call.id}`} className="text-indigo-600 hover:text-indigo-700 text-xs font-medium">Detail →</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && <Link href={buildUrl({ page: String(page - 1) })} className="btn-secondary px-3 py-1.5 text-sm">← Prev</Link>}
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          {page < totalPages && <Link href={buildUrl({ page: String(page + 1) })} className="btn-secondary px-3 py-1.5 text-sm">Next →</Link>}
        </div>
      )}
    </div>
  )
}
