'use client'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { ShieldOff, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'

const REASON_COLOR: Record<string, string> = {
  opted_out: 'bg-red-100 text-red-600', wrong_number: 'bg-orange-100 text-orange-600',
  bad_number: 'bg-red-100 text-red-500', manual: 'bg-gray-100 text-gray-500',
  do_not_call: 'bg-red-100 text-red-700',
}

export default function SuppressionPage() {
  const [list, setList] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [phones, setPhones] = useState('')
  const [reason, setReason] = useState('manual')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/voice/suppression?page=${page}&limit=100`)
    if (r.ok) { const d = await r.json(); setList(d.suppressed ?? []); setTotal(d.total ?? 0) }
    setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    const nums = phones.split('\n').map(s => s.trim()).filter(Boolean)
    if (nums.length === 0) { toast.error('Enter at least one phone number'); return }
    setAdding(true)
    const r = await fetch('/api/voice/suppression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: nums, reason }),
    })
    const d = await r.json()
    if (r.ok) {
      toast.success(`Added ${d.inserted} number${d.inserted !== 1 ? 's' : ''} to suppression list`)
      setPhones('')
      load()
    } else {
      toast.error(d.error)
    }
    setAdding(false)
  }

  const handleRemove = async (id: string) => {
    setRemovingId(id)
    const r = await fetch('/api/voice/suppression', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (r.ok) { toast.success('Removed from suppression list'); load() } else toast.error('Failed to remove')
    setRemovingId(null)
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Suppression List</h1>
        <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} suppressed number{total !== 1 ? 's' : ''}</p>
      </div>

      {/* Compliance banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
        <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 text-sm">Internal Do-Not-Call List</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            Numbers on this list will never be dialed. Numbers are added automatically when a lead opts out, provides a wrong/bad number, or when you add them manually. You are responsible for maintaining this list in compliance with applicable laws.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add form */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Plus size={16} className="text-indigo-500" /> Add Numbers</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Phone Numbers (one per line)</label>
              <textarea value={phones} onChange={e => setPhones(e.target.value)} rows={6} placeholder="+15551234567&#10;+15559876543&#10;..." className="input-field font-mono text-xs" />
            </div>
            <div>
              <label className="label">Reason</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="input-field">
                <option value="manual">Manual</option>
                <option value="opted_out">Opted Out</option>
                <option value="wrong_number">Wrong Number</option>
                <option value="bad_number">Bad Number</option>
                <option value="do_not_call">Do Not Call</option>
              </select>
            </div>
            <button onClick={handleAdd} disabled={adding} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
              {adding ? <><Loader2 size={15} className="animate-spin" /> Adding…</> : <><ShieldOff size={15} /> Add to Suppression List</>}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-12 text-center">
              <ShieldOff size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No suppressed numbers</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Phone', 'Reason', 'Source', 'Added', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {list.map(item => (
                    <tr key={item.id as string} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm text-gray-800">{item.phone_e164 as string}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${REASON_COLOR[item.reason as string] ?? 'bg-gray-100 text-gray-500'}`}>
                          {(item.reason as string).replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 truncate max-w-xs">{(item.source as string) || 'manual'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(item.added_at as string).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleRemove(item.id as string)} disabled={removingId === (item.id as string)} className="text-red-400 hover:text-red-600 disabled:opacity-50">
                          {removingId === (item.id as string) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
