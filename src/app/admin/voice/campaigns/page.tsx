export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Megaphone, Plus, ChevronLeft } from 'lucide-react'

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  active:    'bg-green-100 text-green-700',
  paused:    'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  archived:  'bg-gray-100 text-gray-400',
}

export default async function CampaignsPage() {
  const supabase = await createServiceClient()

  const { data: campaigns } = await supabase
    .from('voice_campaigns')
    .select('id, name, status, total_leads, total_calls, total_connects, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/voice" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-2">
            <ChevronLeft size={14} /> Voice Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone size={22} className="text-indigo-500" /> Campaigns
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your AI outbound calling campaigns</p>
        </div>
        <Link href="/admin/voice/campaigns/new" className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={16} /> New Campaign
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {(!campaigns || campaigns.length === 0) ? (
          <div className="px-6 py-16 text-center">
            <Megaphone size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No campaigns yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first campaign to start making calls</p>
            <Link href="/admin/voice/campaigns/new" className="mt-4 inline-block btn-primary px-4 py-2 text-sm">
              Create Campaign
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leads</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Calls</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Connects</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/voice/campaigns/${c.id}`} className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-400'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-700 font-medium">{(c.total_leads ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right text-gray-700 font-medium">{(c.total_calls ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right text-gray-700 font-medium">{(c.total_connects ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-gray-400 text-xs">
                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
