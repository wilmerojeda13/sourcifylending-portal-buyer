'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, RefreshCw, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Notion data: Disposition → CRM stage ─────────────────────────────────────
const STAGE_LABEL: Record<string, string> = {
  demo_held:     'Demo Held',
  follow_up:     'Follow Up',
  active_client: 'Active Client',
}

const STAGE_COLOR: Record<string, string> = {
  demo_held:     'bg-indigo-500/20 text-indigo-300',
  follow_up:     'bg-amber-500/20 text-amber-300',
  active_client: 'bg-teal-500/20 text-teal-300',
}

type LeadRow = {
  first_name: string
  business_name: string
  phone: string
  notion_disposition: string
  stage: string
  follow_up_at?: string
}

const LEADS: LeadRow[] = [
  // Contract Out → demo_held
  { first_name: 'Billy Berringer',     business_name: "Berringer's Elegant Floors And Remodeling", phone: '(417) 840-3743', notion_disposition: 'Contract Out',   stage: 'demo_held' },
  { first_name: 'Sebastian Wiggins',   business_name: 'Wiggins 1 Contracting LLC',                phone: '(312) 415-5125', notion_disposition: 'Contract Out',   stage: 'demo_held' },

  // Demo Held → demo_held
  { first_name: 'Anthony Watson',      business_name: 'LAD Enterprise Inc',                       phone: '+1 (973) 392-6647', notion_disposition: 'Demo Held', stage: 'demo_held' },
  { first_name: 'Ave Torrens',         business_name: 'Packaging Corporation of America, PCA',    phone: '(484) 268-4065', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Carlos Ferguson',     business_name: 'C&D Concrete',                             phone: '(720) 296-3521', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Deron Guillory',      business_name: 'DG Hotshots',                              phone: '(832) 202-9324', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Frank Lewis',         business_name: 'Chadworth Homes',                          phone: '(404) 707-0839', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Gabino Armas',        business_name: 'La Estrella Landscape & maintenance',      phone: '(510) 468-1388', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Isaac Thomas',        business_name: 'Artisan Carpentry',                        phone: '(402) 432-0390', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Ismael Garrido',      business_name: 'Timba Construction LLC',                   phone: '(407) 676-4209', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Jaír Bustos',         business_name: 'Sophisticated tree services',              phone: '(707) 329-5247', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Jose Figueroa',       business_name: 'CAL ERA LANDSCAPING',                      phone: '(530) 300-0453', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Kurjuan Kirkpatrick', business_name: 'Sentel Construction & Remodeling, LLC',   phone: '(240) 455-2268', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Kyle Bayer',          business_name: 'Kne Customs',                              phone: '(414) 313-5618', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Lee Hill',            business_name: 'Hilltop transportation',                   phone: '(440) 317-1623', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Manuel Rubio',        business_name: 'Manny Construction',                       phone: '(760) 235-2035', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Maria Gonzalez',      business_name: 'MG Realty Partners',                       phone: '(786) 555-0202', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Martin Leon',         business_name: 'Garden Worx',                              phone: '(626) 383-5682', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Mitchell Derouens',   business_name: "Mitchells Lawn & Tree Care",               phone: '(214) 728-9342', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Perry Clarke',        business_name: 'Phantom Cruiser Logistics LLC',            phone: '(213) 926-7155', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Peter Bernard',       business_name: 'Bernard Construction Group Inc.',          phone: '(407) 383-0149', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Qwanchivalous Edwards', business_name: 'Villa World Construction LLC',           phone: '(773) 996-4475', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Terry',               business_name: 'Paradise Builders',                        phone: '(757) 679-6223', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Tony D D',            business_name: 'TAD Construction',                         phone: '(313) 920-9365', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Uriel Salazar',       business_name: 'Uriel professional services',              phone: '(209) 561-7568', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Uziya D Irizarry',    business_name: 'Uzis Contracting LLC',                    phone: '(718) 576-0426', notion_disposition: 'Demo Held',   stage: 'demo_held' },
  { first_name: 'Vladimir Torrealba',  business_name: 'Sisglobal restoration llc',               phone: '(407) 680-5930', notion_disposition: 'Demo Held',   stage: 'demo_held' },

  // Demo No-Show → follow_up
  { first_name: 'Corey Howard',        business_name: 'Big jakes que',                            phone: '(229) 520-2463', notion_disposition: 'Demo No-Show', stage: 'follow_up' },
  { first_name: 'Paul Gonzalez',       business_name: 'Seamless Floor Restoration',               phone: '(323) 359-1021', notion_disposition: 'Demo No-Show', stage: 'follow_up' },

  // Follow Up → follow_up
  { first_name: 'Darrin Jennings',     business_name: 'AKD Financing LLC',                       phone: '(908) 337-8635', notion_disposition: 'Follow Up',   stage: 'follow_up' },
  { first_name: 'Egal Warsame',        business_name: 'Centurylink Transport',                    phone: '(206) 557-2821', notion_disposition: 'Follow Up',   stage: 'follow_up' },
  { first_name: 'Habibou Maiga',       business_name: 'Smart business system LLC',               phone: '(973) 820-8620', notion_disposition: 'Follow Up',   stage: 'follow_up' },
  { first_name: 'Kevin Odom',          business_name: 'The Odom Group Inc.',                      phone: '(404) 599-3667', notion_disposition: 'Follow Up',   stage: 'follow_up', follow_up_at: '2026-09-01' },
]

type ResultMap = Record<string, 'updated' | 'not_found' | 'error' | 'pending'>

export default function RestageClient() {
  const [applied, setApplied]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [results, setResults]   = useState<ResultMap>({})
  const [summary, setSummary]   = useState<{ updated: number; notFound: number; errors: number } | null>(null)

  async function applyAll() {
    setLoading(true)
    const pending: ResultMap = {}
    for (const l of LEADS) pending[l.phone] = 'pending'
    setResults(pending)

    try {
      const res = await fetch('/api/admin/crm/restage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: LEADS.map(l => ({
            phone: l.phone,
            stage: l.stage,
            first_name: l.first_name,
            ...(l.follow_up_at ? { follow_up_at: l.follow_up_at } : {}),
          })),
        }),
      })
      const json = await res.json()
      const map: ResultMap = {}
      for (const r of json.results ?? []) {
        map[r.phone] = r.status
      }
      setResults(map)
      setSummary({ updated: json.updated, notFound: json.notFound, errors: json.errors })
      setApplied(true)
      toast.success(`${json.updated} leads re-staged`)
    } catch {
      toast.error('Failed to apply restage')
    } finally {
      setLoading(false)
    }
  }

  const disposition_groups = [
    { label: 'Contract Out → Demo Held', keys: LEADS.filter(l => l.notion_disposition === 'Contract Out') },
    { label: 'Demo Held → Demo Held',    keys: LEADS.filter(l => l.notion_disposition === 'Demo Held') },
    { label: 'Demo No-Show → Follow Up', keys: LEADS.filter(l => l.notion_disposition === 'Demo No-Show') },
    { label: 'Follow Up → Follow Up',    keys: LEADS.filter(l => l.notion_disposition === 'Follow Up') },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/crm" className="text-gray-400 hover:text-white flex items-center gap-1 text-sm">
            <ChevronLeft size={16}/> CRM
          </Link>
          <span className="text-gray-700">/</span>
          <h1 className="text-lg font-semibold">Re-stage from Notion</h1>
        </div>

        {!applied ? (
          <button
            onClick={applyAll}
            disabled={loading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
            Apply All {LEADS.length} Updates
          </button>
        ) : summary && (
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-green-400"><CheckCircle2 size={15}/> {summary.updated} updated</span>
            {summary.notFound > 0 && <span className="flex items-center gap-1.5 text-amber-400"><AlertCircle size={15}/> {summary.notFound} not found</span>}
            {summary.errors > 0  && <span className="flex items-center gap-1.5 text-red-400"><XCircle size={15}/> {summary.errors} errors</span>}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="bg-blue-950/40 border-b border-blue-900/30 px-6 py-3 text-sm text-blue-300">
        Sourced from Notion Deals Pipeline. Matched to portal leads by phone number. These {LEADS.length} contacts have dispositions other than "New Lead".
      </div>

      {/* Groups */}
      <div className="px-6 py-6 space-y-8 max-w-4xl">
        {disposition_groups.map(group => (
          <div key={group.label}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{group.label}</h2>
            <div className="space-y-2">
              {group.keys.map(lead => {
                const status = results[lead.phone]
                return (
                  <div key={lead.phone} className={cn(
                    'flex items-center justify-between px-4 py-3 rounded-xl border transition-colors',
                    status === 'updated'   ? 'bg-green-950/30 border-green-900/40' :
                    status === 'not_found' ? 'bg-amber-950/30 border-amber-900/40' :
                    status === 'error'     ? 'bg-red-950/30 border-red-900/40' :
                    status === 'pending'   ? 'bg-gray-800/50 border-gray-700/50 animate-pulse' :
                    'bg-gray-900 border-gray-800'
                  )}>
                    <div>
                      <p className="font-medium text-sm text-white">{lead.first_name}</p>
                      <p className="text-xs text-gray-500">{lead.business_name} · {lead.phone}</p>
                      {lead.follow_up_at && (
                        <p className="text-xs text-amber-400 mt-0.5">Follow-up: {lead.follow_up_at}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', STAGE_COLOR[lead.stage])}>
                        {STAGE_LABEL[lead.stage]}
                      </span>
                      {status === 'updated'   && <CheckCircle2 size={16} className="text-green-400"/>}
                      {status === 'not_found' && <AlertCircle size={16} className="text-amber-400"/>}
                      {status === 'error'     && <XCircle size={16} className="text-red-400"/>}
                      {status === 'pending'   && <Loader2 size={16} className="text-gray-400 animate-spin"/>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
