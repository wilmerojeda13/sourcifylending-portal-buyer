import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getRelationUnavailableMessage, isMissingRelationError, isSchemaDriftError } from '@/lib/supabase-schema'
import {
  getCrmAnalyticsTimeZone,
  getThisMonthRangeInCrmTimeZone,
  getThisWeekRangeInCrmTimeZone,
  getTodayRangeInCrmTimeZone,
} from '@/lib/crm-overview-range'
import { applyVisibleCrmLeadsFilter } from '@/lib/crm-visibility'
import {
  applyCrmLeadsCreatedInRangeFilter,
  applyOpenPipelineLeadFilter,
} from '@/lib/crm-overview-queries'

const CACHE_HEADERS = {
  'Cache-Control': 'no-store',
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
}

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  return profile?.is_admin ? supabase : null
}

export async function GET(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') || 'this_month'
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const now = new Date()
  const crmTimeZone = getCrmAnalyticsTimeZone()
  let rangeStart = getTodayRangeInCrmTimeZone(now, crmTimeZone).from
  let rangeEnd = new Date(now)

  if (range === 'today') {
    const todayRange = getTodayRangeInCrmTimeZone(now, crmTimeZone)
    rangeStart = todayRange.from
    rangeEnd = todayRange.to
  } else if (range === 'this_week') {
    const weekRange = getThisWeekRangeInCrmTimeZone(now, crmTimeZone)
    rangeStart = weekRange.from
    rangeEnd = weekRange.to
  } else if (range === 'custom' && from && to) {
    rangeStart = new Date(from)
    rangeEnd = new Date(to)
    rangeEnd.setDate(rangeEnd.getDate() + 1)
  } else {
    const monthRange = getThisMonthRangeInCrmTimeZone(now, crmTimeZone)
    rangeStart = monthRange.from
    rangeEnd = monthRange.to
  }

  const [callsRes, tasksRes, hotLeadsRes, visibleLeadsRes, leadsInRangeRes, openPipelineRes] = await Promise.all([
    supabase
      .from('crm_calls')
      .select('id, lead_id, call_started_at, call_outcome, duration_seconds, converted_to_client, strategy_call_booked')
      .gte('call_started_at', rangeStart.toISOString())
      .lt('call_started_at', rangeEnd.toISOString())
      .order('call_started_at', { ascending: true })
      .limit(1000),
    supabase
      .from('crm_tasks')
      .select('id, title, task_type, priority, status, due_at, lead_id')
      .neq('status', 'Done')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(50),
    applyVisibleCrmLeadsFilter(
      supabase
        .from('crm_leads')
        .select('id, first_name, last_name, business_name, callback_due_at, latest_call_note, stage, close_probability')
        .eq('lead_temperature', 'hot')
    )
      .order('callback_due_at', { ascending: true, nullsFirst: false })
      .limit(10),
    applyVisibleCrmLeadsFilter(
      supabase
        .from('crm_leads')
        .select('id', { count: 'exact', head: true })
    ),
    applyVisibleCrmLeadsFilter(
      applyCrmLeadsCreatedInRangeFilter(
        supabase
          .from('crm_leads')
          .select('id', { count: 'exact', head: true }),
        rangeStart,
        rangeEnd,
      )
    ),
    applyVisibleCrmLeadsFilter(
      applyOpenPipelineLeadFilter(
        supabase
          .from('crm_leads')
          .select('id', { count: 'exact', head: true }),
      )
    ),
  ])

  const warnings: string[] = []

  if (callsRes.error && !isMissingRelationError(callsRes.error, 'crm_calls')) {
    return NextResponse.json({ error: 'Unable to load CRM analytics right now.' }, { status: 500, headers: NO_STORE_HEADERS })
  }
  if (tasksRes.error && !isMissingRelationError(tasksRes.error, 'crm_tasks')) {
    return NextResponse.json({ error: 'Unable to load CRM analytics right now.' }, { status: 500, headers: NO_STORE_HEADERS })
  }
  if (visibleLeadsRes.error) {
    console.error('crm_leads visibility count unavailable in GET /api/admin/crm/overview', visibleLeadsRes.error)
  }

  if (hotLeadsRes.error && !isSchemaDriftError(hotLeadsRes.error, 'crm_leads')) {
    return NextResponse.json({ error: 'Unable to load CRM analytics right now.' }, { status: 500, headers: NO_STORE_HEADERS })
  }

  if (callsRes.error) {
    console.error('crm_calls unavailable in GET /api/admin/crm/overview', callsRes.error)
    warnings.push(getRelationUnavailableMessage('CRM call analytics'))
  }
  if (tasksRes.error) {
    console.error('crm_tasks unavailable in GET /api/admin/crm/overview', tasksRes.error)
    warnings.push(getRelationUnavailableMessage('CRM task analytics'))
  }
  if (hotLeadsRes.error) {
    console.error('crm_leads sales fields unavailable in GET /api/admin/crm/overview', hotLeadsRes.error)
    warnings.push('Some sales insights are temporarily limited while CRM tracking finishes syncing.')
  }

  const calls = callsRes.error ? [] : (callsRes.data ?? [])
  const tasks = tasksRes.error ? [] : (tasksRes.data ?? [])
  const hotLeads = hotLeadsRes.error ? [] : (hotLeadsRes.data ?? [])
  const activeLeadsCount = visibleLeadsRes.error ? 0 : (visibleLeadsRes.count ?? 0)
  const leadsInRangeCount = leadsInRangeRes.error ? 0 : (leadsInRangeRes.count ?? 0)
  const openPipelineLeadsCount = openPipelineRes.error ? 0 : (openPipelineRes.count ?? 0)
  // NOTE: stageCounts removed from overview - use /api/admin/crm/leads with stage aggregation if needed
  // Keeping response lightweight for fast first paint

  const { from: todayStart, to: tomorrowStart } = getTodayRangeInCrmTimeZone(now, crmTimeZone)
  const { from: weekStart } = getThisWeekRangeInCrmTimeZone(now, crmTimeZone)
  const { from: monthStart } = getThisMonthRangeInCrmTimeZone(now, crmTimeZone)

  const connects = calls.filter((call: any) => ['Interested', 'Appointment Set', 'Booked Call', 'Closed Won'].includes(call.call_outcome)).length
  const bookedCalls = calls.filter((call: any) => call.strategy_call_booked || ['Appointment Set', 'Booked Call'].includes(call.call_outcome)).length
  const closedDeals = calls.filter((call: any) => call.converted_to_client || call.call_outcome === 'Closed Won').length
  const followUpsPending = tasks.length
  const callbacksDueToday = [
    ...tasks.filter((task: any) => task.task_type === 'Callback' && task.due_at && new Date(task.due_at) >= todayStart && new Date(task.due_at) < tomorrowStart),
    ...hotLeads.filter((lead: any) => lead.callback_due_at && new Date(lead.callback_due_at) >= todayStart && new Date(lead.callback_due_at) < tomorrowStart),
  ]

  const callsToday = calls.filter((call: any) => new Date(call.call_started_at) >= todayStart).length
  const callsThisWeek = calls.filter((call: any) => new Date(call.call_started_at) >= weekStart).length
  const callsThisMonth = calls.filter((call: any) => new Date(call.call_started_at) >= monthStart).length
  const avgCallsPerDay = calls.length ? Number((calls.length / Math.max(Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000), 1)).toFixed(1)) : 0
  const avgTalkTimeSeconds = calls.length ? Math.round(calls.reduce((sum, call: any) => sum + (call.duration_seconds || 0), 0) / calls.length) : 0
  // NOTE: SMS metrics removed from overview - fetch from /api/admin/crm/leads/[id] per-lead or dedicated SMS endpoint
  // Keeping response lightweight for fast first paint

  // NOTE: Charts computed client-side or fetched from dedicated analytics endpoint
  // Reducing server payload for fast first paint
  const byOutcome: { label: string; value: number }[] = []

  const byDay: { label: string; value: number }[] = []

  const conversionsOverTime: { label: string; value: number }[] = []

  const conversionBySource: { label: string; total: number; won: number; rate: number }[] = []

  const conversionByAgent: { label: string; total: number; won: number; rate: number }[] = []

  const topHotLeads = hotLeads.map((lead: any) => ({
    id: lead.id,
    name: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
    business_name: lead.business_name,
    callback_due_at: lead.callback_due_at,
    latest_call_note: lead.latest_call_note,
    stage: lead.stage,
    close_probability: lead.close_probability,
  }))

  const scheduledCallbacks = tasks
    .filter(task => task.task_type === 'Callback' && task.status !== 'Done' && task.due_at)
    .slice(0, 20)

  return NextResponse.json({
    range: {
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
      label: range,
    },
    kpis: {
      total_calls_made: calls.length,
      total_connects: connects,
      contact_rate: calls.length ? Number(((connects / calls.length) * 100).toFixed(1)) : 0,
      booked_calls: bookedCalls,
      booked_call_rate: calls.length ? Number(((bookedCalls / calls.length) * 100).toFixed(1)) : 0,
      closed_deals: closedDeals,
      close_rate: calls.length ? Number(((closedDeals / calls.length) * 100).toFixed(1)) : 0,
      follow_ups_pending: followUpsPending,
      callbacks_due_today: callbacksDueToday.length,
      total_leads: leadsInRangeCount,
      active_leads_count: activeLeadsCount,
      open_pipeline_leads: openPipelineLeadsCount,
      hot_leads_count: hotLeads.length,
      calls_today: callsToday,
      calls_this_week: callsThisWeek,
      calls_this_month: callsThisMonth,
      average_calls_per_day: avgCallsPerDay,
      average_talk_time_seconds: avgTalkTimeSeconds,
      // SMS metrics available via dedicated endpoint per-lead or /api/admin/crm/campaign
    },
    // NOTE: Heavy charts and lists moved to dedicated endpoints for on-demand loading
    // This keeps overview fast and lightweight for first paint
    warnings,
  }, { headers: CACHE_HEADERS })
}
