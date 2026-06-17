'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Headphones,
  Megaphone,
  Phone,
  TrendingUp,
  Upload,
} from 'lucide-react'

type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived'

interface Campaign {
  id: string
  name: string
  status: CampaignStatus
  lead_count: number
  status_counts: Record<string, number>
}

function normalizeCampaign(input: Partial<Campaign> & { id: string; name?: string }) {
  return {
    ...input,
    name: input.name ?? 'Untitled campaign',
    status: input.status ?? 'paused',
    lead_count: Number(input.lead_count) || 0,
    status_counts: input.status_counts && typeof input.status_counts === 'object'
      ? input.status_counts
      : {},
  } as Campaign
}

interface AnalyticsResponse {
  today?: {
    dials: number
    connects: number
    interested: number
    qualified: number
    promoted: number
    contact_rate: number
    qualified_rate: number
  }
}

interface AgentStatus {
  status: 'active' | 'paused' | 'error'
  lastScrub: string | null
  totalPriorityLeads: number
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  detail: string
  icon: React.ElementType
  tone: string
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#101827] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.16)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-sm text-gray-400">{detail}</p>
        </div>
        <div className={`rounded-lg border p-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.12)] ${tone}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

export default function DialerHomeClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetch('/api/admin/dialer/campaigns').then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Failed to load campaigns')
        return (json.campaigns ?? []).map(normalizeCampaign)
      }),
      fetch('/api/admin/dialer/analytics').then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Failed to load analytics')
        return json
      }),
      fetch('/api/admin/dialer/agent-status').then(async res => {
        if (!res.ok) return null
        const json = await res.json()
        return json as AgentStatus
      }).catch(() => null),
    ])
      .then(([campaignData, analyticsData, agentData]) => {
        if (cancelled) return
        setCampaigns(campaignData)
        setAnalytics(analyticsData)
        setAgentStatus(agentData)
      })
      .catch(() => {
        if (cancelled) return
        setCampaigns([])
        setAnalytics(null)
        setAgentStatus(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const activeCampaigns = useMemo(
    () => campaigns.filter(campaign => campaign.status === 'active'),
    [campaigns]
  )

  const queueReady = useMemo(
    () => campaigns.reduce((sum, campaign) => sum
      + (campaign.status_counts?.new ?? 0)
      + (campaign.status_counts?.attempted ?? 0)
      + (campaign.status_counts?.callback ?? 0)
      + (campaign.status_counts?.follow_up ?? 0), 0),
    [campaigns]
  )

  const readyForCrm = useMemo(
    () => campaigns.reduce((sum, campaign) => sum
      + (campaign.status_counts?.qualified ?? 0)
      + (campaign.status_counts?.promoted ?? 0), 0),
    [campaigns]
  )

  const callbacksDue = useMemo(
    () => campaigns.reduce((sum, campaign) => sum + (campaign.status_counts?.callback ?? 0), 0),
    [campaigns]
  )

  const primaryActions = [
    {
      href: '/admin/dialer/campaigns',
      label: 'Open Campaigns',
      copy: 'Manage live campaigns, queue depth, and campaign progress.',
      icon: Megaphone,
      borderAccent: 'border-l-sky-400/70',
      iconAccent: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
      tag: 'Operations',
      tagClass: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    },
    {
      href: activeCampaigns[0]?.id ? `/admin/dialer/queue?campaign_id=${activeCampaigns[0].id}` : '/admin/dialer/campaigns',
      label: 'Start Dialing',
      copy: 'Work the live queue and move qualified leads toward CRM.',
      icon: Headphones,
      borderAccent: 'border-l-emerald-400/70',
      iconAccent: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
      tag: 'Live Queue',
      tagClass: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    },
    {
      href: '/admin/dialer/import',
      label: 'Import Leads',
      copy: 'Bring in fresh raw leads without changing CRM records.',
      icon: Upload,
      borderAccent: 'border-l-amber-400/70',
      iconAccent: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
      tag: 'Fresh List',
      tagClass: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    },
    {
      href: '/admin/dialer/analytics',
      label: 'Open Analytics',
      copy: 'Review campaign performance, funnel movement, and outcomes.',
      icon: BarChart3,
      borderAccent: 'border-l-fuchsia-400/70',
      iconAccent: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200',
      tag: 'Reporting',
      tagClass: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200',
    },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-lg border border-gray-800 bg-[#111827] p-6 shadow-[0_22px_60px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-300">Dialer Operations</p>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">
              Keep moving
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">Keep the queue moving without leaving the dialer.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
            Campaigns stay operational here. Analytics lives in its own workspace, and CRM only takes over after qualification.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {primaryActions.map(action => {
              const Icon = action.icon
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`rounded-lg border border-gray-800 border-l-2 bg-[#0b1220] p-4 transition-colors hover:border-gray-700 hover:bg-[#0e1627] ${action.borderAccent}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg border p-2 ${action.iconAccent}`}>
                        <Icon size={16} />
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${action.tagClass}`}>
                        {action.tag}
                      </span>
                    </div>
                    <ArrowRight size={16} className="text-gray-600" />
                  </div>
                  <h2 className="mt-4 text-base font-semibold text-white">{action.label}</h2>
                  <p className="mt-1 text-sm text-gray-400">{action.copy}</p>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="rounded-lg border border-gray-800 bg-[#0b111d] p-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Today</p>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-emerald-400/15 bg-[#101827] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Campaigns live</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{activeCampaigns.length}</p>
                </div>
                <Megaphone size={18} className="text-emerald-300" />
              </div>
            </div>
            <div className="rounded-lg border border-sky-400/15 bg-[#101827] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Queue ready</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{queueReady.toLocaleString()}</p>
                </div>
                <Phone size={18} className="text-sky-300" />
              </div>
            </div>
            <div className="rounded-lg border border-amber-400/15 bg-[#101827] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Callbacks pending</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{callbacksDue.toLocaleString()}</p>
                </div>
                <Clock size={18} className="text-amber-300" />
              </div>
            </div>
            <div className="rounded-lg border border-fuchsia-400/15 bg-[#101827] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">CRM ready</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{readyForCrm.toLocaleString()}</p>
                </div>
                <CheckCircle2 size={18} className="text-fuchsia-300" />
              </div>
            </div>
            <div className="rounded-lg border border-indigo-400/15 bg-[#101827] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Automated Agent</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {agentStatus ? agentStatus.totalPriorityLeads.toLocaleString() : '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {agentStatus
                      ? `Status: ${agentStatus.status} · Last: ${agentStatus.lastScrub ? new Date(agentStatus.lastScrub).toLocaleTimeString() : 'Never'}`
                      : 'Agent status unavailable'}
                  </p>
                </div>
                <Bot size={18} className={agentStatus?.status === 'active' ? 'text-indigo-300' : 'text-gray-500'} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Total Dials"
          value={analytics?.today?.dials ?? 0}
          detail="Current day"
          icon={Phone}
          tone="border-sky-400/20 bg-sky-400/10 text-sky-200"
        />
        <MetricCard
          label="Connect Rate"
          value={`${analytics?.today?.contact_rate ?? 0}%`}
          detail={`${analytics?.today?.connects ?? 0} live connects`}
          icon={TrendingUp}
          tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
        />
        <MetricCard
          label="Qualified"
          value={analytics?.today?.qualified ?? 0}
          detail={`${analytics?.today?.qualified_rate ?? 0}% of dials`}
          icon={CheckCircle2}
          tone="border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200"
        />
        <MetricCard
          label="To CRM"
          value={analytics?.today?.promoted ?? 0}
          detail="Promoted from the dialer today"
          icon={BarChart3}
          tone="border-amber-400/20 bg-amber-400/10 text-amber-200"
        />
      </div>

      <section className="mt-6 rounded-lg border border-gray-800 bg-[#111827] p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Active Campaigns</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Operational view</h2>
          </div>
          <Link
            href="/admin/dialer/analytics"
            className="text-sm font-medium text-emerald-300 transition-colors hover:text-emerald-200"
          >
            View full reporting
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {activeCampaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-800 px-6 py-12 text-center">
              <p className="text-base font-medium text-white">No active campaigns</p>
              <p className="mt-2 text-sm text-gray-400">Create or resume a campaign to start dialing.</p>
            </div>
          ) : (
            activeCampaigns.slice(0, 4).map(campaign => {
              const counts = campaign.status_counts ?? {}
              const queued = (counts.new ?? 0)
                + (counts.attempted ?? 0)
                + (counts.callback ?? 0)
                + (counts.follow_up ?? 0)
              const completed = campaign.lead_count > 0
                ? campaign.lead_count - queued
                : 0
              const progress = campaign.lead_count > 0
                ? Math.round((completed / campaign.lead_count) * 100)
                : 0

              return (
                <Link
                  key={campaign.id}
                  href={`/admin/dialer/campaigns/${campaign.id}`}
                  className="block rounded-lg border border-gray-800 bg-[#0b1220] p-4 transition-colors hover:border-gray-700 hover:bg-[#0e1627]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-white">{campaign.name}</h3>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-medium text-emerald-300">
                          {campaign.status}
                        </span>
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-200">
                          {queued.toLocaleString()} ready
                        </span>
                        <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200">
                          {(counts.qualified ?? 0)} qualified
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="shrink-0 text-gray-600" />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Leads</p>
                      <p className="mt-1 text-lg font-semibold text-white">{(campaign.lead_count ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Completed</p>
                      <p className="mt-1 text-lg font-semibold text-white">{completed.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Progress</p>
                      <p className="mt-1 text-lg font-semibold text-white">{progress}%</p>
                    </div>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
