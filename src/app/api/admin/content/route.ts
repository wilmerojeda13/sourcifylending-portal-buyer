import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  fetchContentSnapshot,
  generatePriorityDrafts,
  importContentMetrics,
  refreshDerivedContentAttribution,
  syncTopicIdeasFromSignals,
  updateContentWorkflow,
  CONTENT_METRIC_SOURCES,
  CONTENT_ROUTE_GROUPS,
  CONTENT_WORKFLOW_STATUSES,
} from '@/lib/content-engine'
import type { ContentWorkflowStatus, ContentRouteGroup, ContentMetricSource } from '@/lib/content-engine-types'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { user: null, supabase: null }

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { user: null, supabase: null }

  return { user, supabase }
}

export async function GET() {
  try {
    const admin = await requireAdmin()
    if (!admin.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const snapshot = await fetchContentSnapshot()
    return NextResponse.json(snapshot)
  } catch (error) {
    console.error('[admin/content] GET failed', error)
    return NextResponse.json({ error: 'Unable to load content engine.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin()
    if (!admin.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as
      | { action: 'sync_sources' }
      | { action: 'seed_priority_pages' }
      | { action: 'refresh_attribution' }
      | { action: 'update_status'; pageId: string; workflowStatus: ContentWorkflowStatus }
      | {
          action: 'import_metrics'
          rows: Array<{
            pageSlug: string
            routeGroup: ContentRouteGroup
            metricDate: string
            source: ContentMetricSource
            impressions?: number
            clicks?: number
            averagePosition?: number
            aiCitations?: number
            indexedStatus?: string
            leads?: number
            signups?: number
            bookedCalls?: number
            paidClients?: number
            metadata?: Record<string, unknown>
          }>
        }

    if (body.action === 'sync_sources') {
      const result = await syncTopicIdeasFromSignals()
      return NextResponse.json(result)
    }

    if (body.action === 'seed_priority_pages') {
      const result = await generatePriorityDrafts(admin.user.id)
      return NextResponse.json(result)
    }

    if (body.action === 'refresh_attribution') {
      const result = await refreshDerivedContentAttribution()
      return NextResponse.json(result)
    }

    if (body.action === 'update_status') {
      const page = await updateContentWorkflow({
        pageId: body.pageId,
        workflowStatus: body.workflowStatus,
        createdBy: admin.user.id,
      })
      return NextResponse.json({ page })
    }

    if (body.action === 'import_metrics') {
      const result = await importContentMetrics({
        rows: body.rows,
        createdBy: admin.user.id,
      })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    console.error('[admin/content] POST failed', error)
    return NextResponse.json({ error: 'Unable to update content engine.' }, { status: 500 })
  }
}
