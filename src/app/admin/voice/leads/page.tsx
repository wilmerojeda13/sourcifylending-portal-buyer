'use client'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Upload, Phone, X, Loader2, Filter, Users } from 'lucide-react'

const SCORE_COLOR = (s: number) => s >= 70 ? 'bg-green-100 text-green-700' : s >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
const TIER_COLOR = (t: number) => t === 1 ? 'bg-indigo-100 text-indigo-700' : t === 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
const DISP_COLOR: Record<string, string> = {
  transferred_live: 'bg-green-100 text-green-700', send_link: 'bg-blue-100 text-blue-700',
  callback_requested: 'bg-indigo-100 text-indigo-700', interested: 'bg-emerald-100 text-emerald-700',
  not_interested: 'bg-gray-100 text-gray-500', voicemail: 'bg-amber-100 text-amber-700',
  no_answer: 'bg-gray-100 text-gray-400', do_not_call: 'bg-red-100 text-red-600',
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Record<string, unknown>[]>([])
  const [campaigns, setCampaigns] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importCampaign, setImportCampaign] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null)
  const [dialingId, setDialingId] = useState<string | null>(null)
  const [filters, setFilters] = useState({ campaign_id: '', tier: '', source: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (filters.campaign_id) params.set('campaign_id', filters.campaign_id)
    if (filters.tier)        params.set('tier', filters.tier)
    if (filters.source)      params.set('source', filters.source)
    const r = await fetch(`/api/voice/leads?${params}`)
    if (r.ok) { const d = await r.json(); setLeads(d.leads); setTotal(d.total) }
    setLoading(false)
  }, [page, filters])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/voice/campaigns').then(r => r.json()).then(d => setCampaigns(d.campaigns ?? []))
  }, [])

  const handleImport = async () => {
    if (!csvText.trim()) { toast.error('Paste CSV data first'); return }
    setImporting(true)
    const r = await fetch('/api/voice/leads/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText, campaign_id: importCampaign || null }),
    })
    const d = await r.json()
    if (r.ok) {
      setImportResult(d)
      toast.success(`Imported ${d.inserted} leads`)
      setCsvText('')
      load()
    } else {
      toast.error(d.error)
    }
    setImporting(false)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvText(ev.target?.result as string)
    reader.readAsText(file)
  }

  const handleDial = async (leadId: string, campaignId: string | null) => {
    setDialingId(leadId)
    const r = await fetch('/api/voice/dial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, campaign_id: campaignId }),
    })
    const d = await r.json()
    if (r.ok) { toast.success('Call initiated!'); load() } else toast.error(d.error)
    setDialingId(null)
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Lists</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} total leads</p>
        </div>
        <button onClick={() => { setShowImport(true); setImportResult(null) }} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <Upload size={16} /> Import Leads
        </button>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Import Leads from CSV</h2>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {importResult ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="font-semibold text-green-800 mb-2">Import Complete</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[['Total Parsed', importResult.total], ['Inserted', importResult.inserted], ['Duplicates', importResult.duplicates], ['Suppressed', importResult.suppressed], ['Invalid Phone', importResult.invalid], ['Errors', importResult.errors]].map(([l, v]) => (
                      <div key={l as string} className="flex justify-between"><span className="text-gray-600">{l}</span><span className="font-bold">{v}</span></div>
                    ))}
                  </div>
                </div>
                <button onClick={() => setShowImport(false)} className="btn-primary w-full py-2.5">Done</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label">Assign to Campaign (optional)</label>
                  <select value={importCampaign} onChange={e => setImportCampaign(e.target.value)} className="input-field">
                    <option value="">No Campaign</option>
                    {campaigns.map(c => <option key={c.id as string} value={c.id as string}>{c.name as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Upload CSV File</label>
                  <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                </div>
                <div>
                  <label className="label">Or Paste CSV Data</label>
                  <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={8} placeholder="first_name,last_name,business_name,phone,email,lead_source,geography&#10;Jane,Smith,Acme LLC,5551234567,jane@acme.com,purchased,FL" className="input-field font-mono text-xs" />
                  <p className="text-xs text-gray-400 mt-1">Required headers: phone. Optional: first_name, last_name, business_name, owner_name, email, lead_source, geography, lead_age_days</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowImport(false)} className="btn-secondary flex-1 py-2.5">Cancel</button>
                  <button onClick={handleImport} disabled={importing || !csvText.trim()} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
                    {importing ? <><Loader2 size={16} className="animate-spin" /> Importing…</> : <><Upload size={16} /> Import</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <Filter size={16} className="text-gray-400" />
        <select value={filters.campaign_id} onChange={e => { setFilters(f => ({ ...f, campaign_id: e.target.value })); setPage(1) }} className="input-field w-44 py-2 text-sm">
          <option value="">All Campaigns</option>
          {campaigns.map(c => <option key={c.id as string} value={c.id as string}>{c.name as string}</option>)}
        </select>
        <select value={filters.tier} onChange={e => { setFilters(f => ({ ...f, tier: e.target.value })); setPage(1) }} className="input-field w-32 py-2 text-sm">
          <option value="">All Tiers</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
        <select value={filters.source} onChange={e => { setFilters(f => ({ ...f, source: e.target.value })); setPage(1) }} className="input-field w-36 py-2 text-sm">
          <option value="">All Sources</option>
          <option value="purchased">Purchased</option>
          <option value="facebook">Facebook</option>
          <option value="inbound">Inbound</option>
          <option value="other">Other</option>
        </select>
        {(filters.campaign_id || filters.tier || filters.source) && (
          <button onClick={() => { setFilters({ campaign_id: '', tier: '', source: '' }); setPage(1) }} className="text-xs text-red-500 hover:text-red-700">Clear filters</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading leads…</div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No leads found</p>
            <p className="text-sm text-gray-400 mt-1">Import a CSV to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Business', 'Owner', 'Phone', 'Source', 'Score', 'Tier', 'Attempts', 'Last Disposition', 'Action'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leads.map(lead => {
                  const isDnc = lead.do_not_call as boolean
                  const disp = lead.last_disposition as string | null
                  return (
                    <tr key={lead.id as string} className={isDnc ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                        {isDnc && <span className="text-[9px] font-bold text-red-500 mr-1">DNC</span>}
                        {(lead.business_name as string) || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{(lead.owner_name as string) || '—'}</td>
                      <td className={`px-4 py-3 font-mono text-xs ${isDnc ? 'line-through text-gray-400' : 'text-gray-700'}`}>{(lead.phone_e164 as string) || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{lead.lead_source as string}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SCORE_COLOR(lead.lead_quality_score as number)}`}>
                          {lead.lead_quality_score as number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TIER_COLOR(lead.lead_priority_tier as number)}`}>T{lead.lead_priority_tier as number}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-center">{lead.call_attempt_count as number}</td>
                      <td className="px-4 py-3">
                        {disp ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DISP_COLOR[disp] ?? 'bg-gray-100 text-gray-500'}`}>{disp.replace(/_/g, ' ')}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {!isDnc && lead.phone_e164 && (
                          <button
                            onClick={() => handleDial(lead.id as string, lead.campaign_id as string | null)}
                            disabled={dialingId === (lead.id as string)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                          >
                            {dialingId === (lead.id as string) ? <Loader2 size={12} className="animate-spin" /> : <Phone size={12} />} Dial
                          </button>
                        )}
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
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40">← Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  )
}
