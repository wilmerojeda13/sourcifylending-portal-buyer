import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PhoneCall, Users, Megaphone, CheckCircle, TrendingUp, ShieldOff, ArrowRight, Activity } from 'lucide-react'

export default async function VoiceDashboard() {
  const supabase = await createServiceClient()

  const [
    { count: totalCampaigns },
    { count: totalLeads },
    { count: totalCalls },
    { count: activeCalls },
    { count: qualifiedCalls },
    { count: dnc },
    { data: recentCalls },
    { data: activeCampaigns },
  ] = await Promise.all([
    supabase.from('voice_campaigns').select('id', { count: 'exact', head: true }),
    supabase.from('voice_leads').select('id', { count: 'exact', head: true }).eq('do_not_call', false),
    supabase.from('voice_calls').select('id', { count: 'exact', head: true }),
    supabase.from('voice_calls').select('id', { count: 'exact', head: true }).in('status', ['initiated','ringing','in-progress']),
    supabase.from('voice_calls').select('id', { count: 'exact', head: true }).in('disposition', ['decision_maker','interested','send_link','callback_requested','transferred_live']),
    supabase.from('voice_suppression_list').select('id', { count: 'exact', head: true }),
    supabase.from('voice_calls').select('id, status, disposition, duration_seconds, created_at, to_number, voice_leads(business_name, owner_name)').order('created_at', { ascending: false }).limit(8),
    supabase.from('voice_campaigns').select('id, name, status, total_leads, total_calls, total_connects').eq('status', 'active').limit(5),
  ])

  const connectRate = (totalCalls ?? 0) > 0 ? Math.round(((qualifiedCalls ?? 0) / (totalCalls ?? 1)) * 100) : 0

  const stats = [
    { label: 'Active Campaigns', value: totalCampaigns ?? 0, icon: Megaphone,   color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Total Leads',      value: totalLeads     ?? 0, icon: Users,       color: 'text-blue-600',   bg: 'bg-blue-50'   },
    { label: 'Total Calls',      value: totalCalls     ?? 0, icon: PhoneCall,   color: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'Live Now',         value: activeCalls    ?? 0, icon: Activity,    color: 'text-red-600',    bg: 'bg-red-50'    },
    { label: 'Qualified',        value: qualifiedCalls ?? 0, icon: CheckCircle, color: 'text-emerald-600',bg: 'bg-emerald-50'},
    { label: 'Qualify Rate',     value: `${connectRate}%`,  icon: TrendingUp,  color: 'text-amber-600',  bg: 'bg-amber-50'  },
  ]

  const dispositionColor: Record<string, string> = {
    transferred_live:   'bg-green-100 text-green-700',
    send_link:          'bg-blue-100 text-blue-700',
    callback_requested: 'bg-indigo-100 text-indigo-700',
    interested:         'bg-emerald-100 text-emerald-700',
    decision_maker:     'bg-purple-100 text-purple-700',
    not_interested:     'bg-gray-100 text-gray-500',
    voicemail:          'bg-amber-100 text-amber-700',
    no_answer:          'bg-gray-100 text-gray-400',
    do_not_call:        'bg-red-100 text-red-600',
    bad_number:         'bg-red-100 text-red-500',
    wrong_number:       'bg-red-100 text-red-500',
    gatekeeper:         'bg-yellow-100 text-yellow-700',
    business_closed:    'bg-gray-100 text-gray-500',
    personal_line:      'bg-orange-100 text-orange-600',
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voice Campaign Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">AI-powered outbound calling for SourcifyLending</p>
        </div>
        <Link href="/admin/voice/campaigns/new" className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <Megaphone size={16} /> New Campaign
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 px-4 py-4 shadow-sm">
            <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>
              <Icon size={16} className={color} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Campaigns */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Megaphone size={16} className="text-indigo-500" /> Active Campaigns
            </h2>
            <Link href="/admin/voice/campaigns" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(activeCampaigns ?? []).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No active campaigns</p>
                <Link href="/admin/voice/campaigns/new" className="mt-3 inline-block text-sm text-indigo-600 font-medium">
                  Create your first campaign →
                </Link>
              </div>
            ) : (activeCampaigns ?? []).map((c) => (
              <Link key={c.id} href={`/admin/voice/campaigns/${c.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.total_leads} leads · {c.total_calls} calls · {c.total_connects} connects</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">ACTIVE</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Calls */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <PhoneCall size={16} className="text-green-500" /> Recent Calls
            </h2>
            <Link href="/admin/voice/logs" className="text-xs text-green-600 hover:text-green-700 font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(recentCalls ?? []).length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No calls yet</div>
            ) : (recentCalls ?? []).map((call: Record<string, unknown>) => {
              const lead = call.voice_leads as Record<string, string> | null
              const disp = (call.disposition as string | null) ?? 'pending'
              return (
                <div key={call.id as string} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {lead?.business_name ?? lead?.owner_name ?? (call.to_number as string) ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(call.created_at as string).toLocaleString()} · {call.duration_seconds ? `${call.duration_seconds}s` : '—'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${dispositionColor[disp] ?? 'bg-gray-100 text-gray-500'}`}>
                    {disp.replace(/_/g, ' ')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/admin/voice/campaigns/new', label: 'New Campaign',       icon: Megaphone,  color: 'bg-indigo-600' },
            { href: '/admin/voice/leads',         label: 'Import Leads',       icon: Users,      color: 'bg-blue-600'   },
            { href: '/admin/voice/live',          label: 'Monitor Live Calls', icon: Activity,   color: 'bg-red-600'    },
            { href: '/admin/voice/suppression',   label: 'Suppression List',   icon: ShieldOff,  color: 'bg-amber-600'  },
          ].map(({ href, label, icon: Icon, color }) => (
            <Link key={href} href={href} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group">
              <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center shrink-0`}>
                <Icon size={14} className="text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
              <ArrowRight size={14} className="text-gray-300 group-hover:text-gray-400 ml-auto" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
