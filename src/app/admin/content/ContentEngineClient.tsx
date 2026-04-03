'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  DollarSign,
  FileSearch,
  Link2,
  RefreshCw,
  Rocket,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import {
  getContentMotion,
  getContentRouteLabel,
} from '@/lib/content-engine-types'
import type {
  ContentIdea,
  ContentMetricRecord,
  ContentPageRecord,
  ContentSnapshot,
  ContentUpdateRecord,
  ContentWorkflowStatus,
} from '@/lib/content-engine-types'

interface Props {
  initialSnapshot: ContentSnapshot
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function StatusButton({
  label,
  status,
  pageId,
  onUpdate,
}: {
  label: string
  status: ContentWorkflowStatus
  pageId: string
  onUpdate: (pageId: string, status: ContentWorkflowStatus) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onUpdate(pageId, status)}
      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-green-300 hover:text-green-700"
    >
      {label}
    </button>
  )
}

export default function ContentEngineClient({ initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [isPending, startTransition] = useTransition()

  const latestMetricsByPage = useMemo(() => {
    const map = new Map<string, ContentMetricRecord>()
    for (const row of snapshot.metrics) {
      const current = map.get(row.page_id)
      if (!current || row.metric_date > current.metric_date) {
        map.set(row.page_id, row)
      }
    }
    return map
  }, [snapshot.metrics])

  const partnerPerformanceByPage = useMemo(() => {
    return new Map(
      snapshot.dashboards.partnerRecruitment.topPartnerPages.map((page) => [page.pageId, page]),
    )
  }, [snapshot.dashboards.partnerRecruitment.topPartnerPages])

  const stats = useMemo(() => {
    const published = snapshot.pages.filter((page) => page.workflow_status === 'published').length
    const review = snapshot.pages.filter((page) => page.workflow_status === 'review').length
    const refresh = snapshot.pages.filter((page) => page.workflow_status === 'needs_refresh').length

    const metricTotals = snapshot.metrics.reduce((acc, row) => {
      acc.impressions += row.impressions ?? 0
      acc.clicks += row.clicks ?? 0
      acc.aiCitations += row.ai_citations ?? 0
      acc.leads += row.leads ?? 0
      acc.signups += row.signups ?? 0
      acc.bookedCalls += row.booked_calls ?? 0
      acc.paidClients += row.paid_clients ?? 0
      return acc
    }, {
      impressions: 0,
      clicks: 0,
      aiCitations: 0,
      leads: 0,
      signups: 0,
      bookedCalls: 0,
      paidClients: 0,
    })

    return {
      totalPages: snapshot.pages.length,
      published,
      review,
      refresh,
      topicIdeas: snapshot.topicIdeas.length,
      ...metricTotals,
    }
  }, [snapshot])

  const dashboards = snapshot.dashboards

  async function refreshSnapshot() {
    const response = await fetch('/api/admin/content', { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Unable to refresh content engine.')
    setSnapshot(payload)
  }

  function runAction(body: Record<string, unknown>, successMessage: string) {
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Request failed.')
        await refreshSnapshot()
        toast.success(successMessage)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Request failed.')
      }
    })
  }

  const refreshQueue = snapshot.pages.filter((page) => page.workflow_status === 'needs_refresh' || (page.refresh_due_at && page.refresh_due_at <= new Date().toISOString()))

  if (snapshot.schemaMissing) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Content engine tables are not in Supabase yet. The UI is wired, but the DB schema needs to be applied before this workspace can load data.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">SEO Content Engine</h1>
          <p className="mt-1 text-sm text-gray-500">
            Topic clustering, draft generation, publish workflow, freshness control, and reporting for both client acquisition and partner recruitment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAction({ action: 'sync_sources' }, 'Topic signals synced.')}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm"
          >
            <FileSearch size={16} />
            Sync Signals
          </button>
          <button
            type="button"
            onClick={() => runAction({ action: 'seed_priority_pages' }, 'Priority drafts generated.')}
            className="inline-flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            <Sparkles size={16} />
            Generate Priority Drafts
          </button>
          <button
            type="button"
            onClick={() => runAction({ action: 'refresh_attribution' }, 'Attribution refreshed.')}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm"
          >
            <RefreshCw size={16} />
            Refresh Attribution
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { label: 'Pages', value: stats.totalPages, icon: FileSearch },
          { label: 'Published', value: stats.published, icon: Rocket },
          { label: 'In Review', value: stats.review, icon: CheckCircle2 },
          { label: 'Needs Refresh', value: stats.refresh, icon: Clock3 },
          { label: 'Topic Ideas', value: stats.topicIdeas, icon: Bot },
          { label: 'Revenue', value: formatCurrency(dashboards.revenue.attributedRevenue), icon: DollarSign },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-3xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
            <Icon size={16} className="mb-2 text-green-600" />
            <div className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? formatNumber(value) : value}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">SEO Performance</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Impressions', formatNumber(dashboards.visibility.impressions)],
              ['Clicks', formatNumber(dashboards.visibility.clicks)],
              ['CTR', formatPercent(dashboards.visibility.ctr)],
              ['Avg Position', dashboards.visibility.averagePosition?.toFixed(2) ?? 'N/A'],
              ['Indexed', `${dashboards.visibility.indexedPages}/${stats.totalPages}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                <div className="font-semibold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {dashboards.visibility.topPages.slice(0, 5).map((page) => (
              <div key={page.pageId} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{page.title}</div>
                  <div className="text-xs text-gray-500">{page.canonicalPath}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{formatNumber(page.clicks)} clicks</div>
                  <div>{formatPercent(page.ctr)} CTR</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">AI Search Performance</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['AI Citations', formatNumber(dashboards.aiVisibility.aiCitations)],
              ['AI-driven Clicks', formatNumber(dashboards.aiVisibility.aiDrivenClicks)],
              ['Top Cited Pages', formatNumber(dashboards.aiVisibility.topCitedPages.length)],
              ['12-Point Trend', formatNumber(dashboards.aiVisibility.citationTrend.length)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                <div className="font-semibold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {dashboards.aiVisibility.topCitedPages.slice(0, 5).map((page) => (
              <div key={page.pageId} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{page.title}</div>
                  <div className="text-xs text-gray-500">{page.canonicalPath}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{formatNumber(page.aiCitations)} citations</div>
                  <div>{formatNumber(page.aiDrivenClicks)} AI clicks</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Conversion Performance</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Portal Clicks', formatNumber(dashboards.conversions.portalClicks)],
              ['Get Started', formatNumber(dashboards.conversions.getStartedSubmissions)],
              ['Signups', formatNumber(dashboards.conversions.signups)],
              ['Booked Calls', formatNumber(dashboards.conversions.bookedCalls)],
              ['Paid Clients', formatNumber(dashboards.conversions.paidClients)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                <div className="font-semibold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {dashboards.conversions.topConversionPages.slice(0, 5).map((page) => (
              <div key={page.pageId} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{page.title}</div>
                  <div className="text-xs text-gray-500">{page.canonicalPath}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{formatNumber(page.portalClicks)} portal clicks</div>
                  <div>{formatNumber(page.signups)} signups</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Revenue Attribution</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Revenue', formatCurrency(dashboards.revenue.attributedRevenue)],
              ['Paid Clients', formatNumber(dashboards.revenue.paidClients)],
              ['Top Topic Clusters', formatNumber(dashboards.revenue.revenueByTopicCluster.length)],
              ['Industry Pages', formatNumber(dashboards.revenue.revenueByIndustryPage.length)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                <div className="font-semibold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {dashboards.revenue.revenueByPage.slice(0, 5).map((page) => (
              <div key={page.pageId} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{page.title}</div>
                  <div className="text-xs text-gray-500">{page.canonicalPath}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{formatCurrency(page.revenue)}</div>
                  <div>{formatNumber(page.paidClients)} clients</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-gray-900">Content Pipeline</h2>
              <p className="text-xs text-gray-500">Drafts, workflow state, quality, and live performance snapshots.</p>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {snapshot.pages.map((page: ContentPageRecord) => {
              const metrics = latestMetricsByPage.get(page.id)
              const motion = getContentMotion(page.route_group)
              const partnerSummary = partnerPerformanceByPage.get(page.id)
              return (
                <div key={page.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                          {getContentRouteLabel(page.route_group)}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                          motion === 'partner_recruitment'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-cyan-50 text-cyan-700'
                        }`}>
                          {motion === 'partner_recruitment' ? 'Partner' : 'Client'}
                        </span>
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-green-700">
                          {page.workflow_status.replace(/_/g, ' ')}
                        </span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                          Quality {page.quality_score ?? 0}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-gray-900">{page.h1}</h3>
                      <p className="mt-1 text-sm text-gray-600">{page.hero_summary}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                        <span>{page.canonical_path}</span>
                        <span>{page.target_keywords?.slice(0, 3).join(' · ')}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusButton label="Review" status="review" pageId={page.id} onUpdate={(pageId, status) => runAction({ action: 'update_status', pageId, workflowStatus: status }, 'Page updated.')} />
                      <StatusButton label="Approve" status="approved" pageId={page.id} onUpdate={(pageId, status) => runAction({ action: 'update_status', pageId, workflowStatus: status }, 'Page updated.')} />
                      <StatusButton label="Publish" status="published" pageId={page.id} onUpdate={(pageId, status) => runAction({ action: 'update_status', pageId, workflowStatus: status }, 'Page published.')} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <div className="font-semibold text-gray-900">{formatNumber(metrics?.impressions ?? 0)}</div>
                      Impressions
                    </div>
                    <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <div className="font-semibold text-gray-900">{formatNumber(metrics?.clicks ?? 0)}</div>
                      Clicks
                    </div>
                    <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <div className="font-semibold text-gray-900">{formatNumber((metrics?.leads ?? 0) + (metrics?.signups ?? 0))}</div>
                      Leads + Signups
                    </div>
                    <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <div className="font-semibold text-gray-900">{formatNumber((metrics?.booked_calls ?? 0) + (metrics?.paid_clients ?? 0))}</div>
                      Calls + Clients
                    </div>
                  </div>

                  {motion === 'partner_recruitment' && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <div className="font-semibold text-emerald-950">{formatNumber(partnerSummary?.partnerApplications ?? 0)}</div>
                        Applications
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <div className="font-semibold text-emerald-950">{formatNumber(partnerSummary?.approvedPartners ?? 0)}</div>
                        Approved
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <div className="font-semibold text-emerald-950">{formatNumber(partnerSummary?.activePartners ?? 0)}</div>
                        Active
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <div className="font-semibold text-emerald-950">{formatCurrency(partnerSummary?.partnerGeneratedRevenue ?? 0)}</div>
                        Partner Revenue
                      </div>
                    </div>
                  )}

                  {page.workflow_status === 'published' && (
                    <Link
                      href={page.canonical_path}
                      className="inline-flex text-sm font-medium text-green-600 hover:text-green-700"
                    >
                      Open live page →
                    </Link>
                  )}
                </div>
              )
            })}
            {snapshot.pages.length === 0 && (
              <div className="px-5 py-8 text-sm text-gray-500">
                No content pages yet. Generate the priority batch first.
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Refresh Queue</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {refreshQueue.length > 0 ? refreshQueue.map((page) => (
                <div key={page.id} className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <div className="font-semibold">{page.h1}</div>
                  <div className="mt-1 text-xs text-amber-700">{page.canonical_path}</div>
                </div>
              )) : (
                <p className="text-sm text-gray-500">No pages are currently queued for refresh.</p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Topic Signals</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {snapshot.topicIdeas.slice(0, 8).map((idea: ContentIdea) => (
                <div key={idea.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-gray-900">{idea.topic}</p>
                    <span className="text-xs font-semibold text-gray-500">{idea.priority_score ?? 0}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{idea.source_type.replace(/_/g, ' ')} · {idea.cluster_key}</p>
                  {idea.evidence_excerpt && (
                    <p className="mt-2 text-sm text-gray-600">{idea.evidence_excerpt}</p>
                  )}
                </div>
              ))}
              {snapshot.topicIdeas.length === 0 && (
                <p className="text-sm text-gray-500">Run signal sync to collect topic ideas from CRM, support, analyzer, and SMS activity.</p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Recent Updates</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {snapshot.updates.slice(0, 8).map((update: ContentUpdateRecord) => (
                <div key={update.id} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                  <div className="font-medium text-gray-900">{update.summary}</div>
                  <div className="mt-1 text-xs text-gray-500">{new Date(update.created_at).toLocaleString()}</div>
                </div>
              ))}
              {snapshot.updates.length === 0 && (
                <p className="text-sm text-gray-500">No content updates logged yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Rocket size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Partner Recruitment Performance</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              ['Applications', formatNumber(dashboards.partnerRecruitment.partnerApplications)],
              ['Approved Partners', formatNumber(dashboards.partnerRecruitment.approvedPartners)],
              ['Active Partners', formatNumber(dashboards.partnerRecruitment.activePartners)],
              ['Partner Signups', formatNumber(dashboards.partnerRecruitment.partnerGeneratedSignups)],
              ['Paid Clients', formatNumber(dashboards.partnerRecruitment.partnerGeneratedPaidClients)],
              ['Partner Revenue', formatCurrency(dashboards.partnerRecruitment.partnerGeneratedRevenue)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                <div className="font-semibold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {dashboards.partnerRecruitment.topPartnerPages.slice(0, 5).map((page) => (
              <div key={page.pageId} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{page.title}</div>
                  <div className="text-xs text-gray-500">{page.canonicalPath}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{formatNumber(page.partnerApplications)} applications</div>
                  <div>{formatCurrency(page.partnerGeneratedRevenue)} revenue</div>
                </div>
              </div>
            ))}
            {dashboards.partnerRecruitment.topPartnerPages.length === 0 && (
              <p className="text-sm text-gray-500">Partner recruitment pages will appear here once attribution and partner applications start landing.</p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Revenue by Topic Cluster</h2>
          <div className="mt-4 space-y-3">
            {dashboards.revenue.revenueByTopicCluster.slice(0, 6).map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-gray-900">{row.label}</div>
                  <div className="text-xs text-gray-500">{formatNumber(row.signups)} signups · {formatNumber(row.paidClients)} clients</div>
                </div>
                <div className="font-semibold text-gray-900">{formatCurrency(row.revenue)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Revenue by Industry Page</h2>
          <div className="mt-4 space-y-3">
            {dashboards.revenue.revenueByIndustryPage.slice(0, 6).map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-gray-900">{row.label}</div>
                  <div className="text-xs text-gray-500">{formatNumber(row.leads)} leads · {formatNumber(row.paidClients)} clients</div>
                </div>
                <div className="font-semibold text-gray-900">{formatCurrency(row.revenue)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {isPending && (
        <div className="text-sm text-gray-500">Updating content engine…</div>
      )}
    </div>
  )
}
