'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { 
  Headphones, Upload, PhoneCall, Clock, CheckCircle2, ArrowUpRight, BarChart3, Phone, TrendingUp, MessageSquare 
} from 'lucide-react'

function StatCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
          <p className="mt-0.5 text-xs text-gray-500">{detail}</p>
        </div>
        <div className="rounded-lg bg-orange-50 p-2 text-orange-600">
          <Icon size={16} />
        </div>
      </div>
    </div>
  )
}

export default function DialerHomeClient() {
  const [analytics, setAnalytics] = useState<any>(null)
  
  useEffect(() => {
    fetch('/api/admin/crm/overview?range=today')
      .then(r => r.json())
      .then(data => setAnalytics(data))
      .catch(() => setAnalytics(null))
  }, [])

  const cards = [
    {
      href: '/admin/dialer/queue',
      label: 'Start Dialing',
      desc: 'Launch the power dialer and call through your raw leads queue',
      icon: Headphones,
      color: 'bg-orange-600',
      primary: true,
    },
    {
      href: '/admin/dialer/import',
      label: 'Import Raw Leads',
      desc: 'Upload CSV of new leads into the dialer (not CRM)',
      icon: Upload,
      color: 'bg-blue-600',
    },
    {
      href: '/admin/dialer/callbacks',
      label: 'Callbacks',
      desc: 'Raw leads with scheduled callbacks and follow-ups',
      icon: Clock,
      color: 'bg-amber-600',
    },
    {
      href: '/admin/dialer/qualified',
      label: 'Ready to Promote',
      desc: 'Qualified raw leads ready to promote to CRM',
      icon: CheckCircle2,
      color: 'bg-green-600',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Dialer Workspace</h1>
              <p className="text-sm text-gray-500 mt-1">
                Raw leads only. Promote qualified leads to CRM when ready.
              </p>
            </div>
            <a
              href="/admin/crm"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open CRM <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map(({ href, label, desc, icon: Icon, color, primary }) => (
            <Link
              key={href}
              href={href}
              className={`
                bg-white rounded-xl border p-6 transition-all group
                ${primary 
                  ? 'border-orange-300 shadow-md hover:shadow-lg hover:border-orange-400' 
                  : 'border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300'
                }
              `}
            >
              <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center mb-4`}>
                <Icon size={24} className="text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700">
                {label}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{desc}</p>
            </Link>
          ))}
        </div>

        {/* Call Analytics */}
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Today's Activity</h2>
            <span className="text-xs text-gray-400">Call metrics from raw leads</span>
          </div>
          
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard 
              label="Total Calls" 
              value={analytics?.kpis?.total_calls_made ?? 0} 
              detail={`${analytics?.kpis?.calls_today ?? 0} today`} 
              icon={Phone} 
            />
            <StatCard 
              label="Contact Rate" 
              value={`${analytics?.kpis?.contact_rate ?? 0}%`} 
              detail={`${analytics?.kpis?.total_connects ?? 0} connects`} 
              icon={TrendingUp} 
            />
            <StatCard 
              label="Callbacks Due" 
              value={analytics?.kpis?.callbacks_due_today ?? 0} 
              detail="In dialer queue" 
              icon={Clock} 
            />
            <StatCard 
              label="Avg Talk Time" 
              value={`${Math.floor((analytics?.kpis?.average_talk_time_seconds ?? 0) / 60)}m`} 
              detail="Per connected call" 
              icon={PhoneCall} 
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard 
              label="Texts Sent" 
              value={analytics?.kpis?.texts_sent ?? 0} 
              detail={`${analytics?.kpis?.leads_texted ?? 0} leads`} 
              icon={MessageSquare} 
            />
            <StatCard 
              label="Text Delivery" 
              value={`${analytics?.kpis?.text_click_rate ?? 0}%`} 
              detail={`${analytics?.kpis?.texts_delivered ?? 0} delivered`} 
              icon={CheckCircle2} 
            />
            <StatCard 
              label="Inbound Replies" 
              value={analytics?.kpis?.inbound_replies ?? 0} 
              detail={`${analytics?.kpis?.text_reply_rate ?? 0}% reply rate`} 
              icon={TrendingUp} 
            />
            <StatCard 
              label="Unread Texts" 
              value={analytics?.kpis?.unread_text_conversations ?? 0} 
              detail="Need response" 
              icon={MessageSquare} 
            />
          </div>
        </div>

        {/* Stats hint */}
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <BarChart3 size={16} />
            <span>Leads stay in dialer until promoted. CRM only shows promoted leads.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
