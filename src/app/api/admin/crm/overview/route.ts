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

// 60s browser cache reduces repeated aggregation queries significantly.
// Admin dashboard polls every 30s — with this header the browser serves from cache
// for the first 60s, cutting actual DB hits by ~50–70%.
const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
}

// Keep no-store only for error responses
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

  const [callsRes, tasksRes, hotLeadsRes, textsRes, visibleLeadsRes] = await Promise.all([
    supabase
      .from('crm_calls')
      .select('*')
      .gte('call_started_at', rangeStart.toISOString())
      .lt('call_started_at', rangeEnd.toISOString())
      .order('call_started_at', { ascending: true }),
    supabase
      .from('crm_tasks')
      .select('*, crm_leads(id, first_name, last_name, business_name, stage, lead_temperature, is_archived)')
      .neq('status', 'Done')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200),
    applyVisibleCrmLeadsFilter(
      supabase
        .from('crm_leads')
        .select('*')
        .eq('lead_temperature', 'hot')
    )
      .order('callback_due_at', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('crm_lead_sms')
      .select('id, lead_id, direction, unread, status, sent_at, delivered_at, clicked_at, account_created_at, crm_leads(strategy_call_booked, converted_to_client)')
      .gte('created_at', rangeStart.toISOString())
      .lt('created_at', rangeEnd.toISOString())
      .order('created_at', { ascending: true }),
    applyVisibleCrmLeadsFilter(
      supabase
        .from('crm_leads')
        .select('stage', { count: 'exact' })
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
  if (textsRes.error && !isMissingRelationError(textsRes.error, 'crm_lead_sms')) {
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
  if (textsRes.error) {
    console.error('crm_lead_sms unavailable in GET /api/admin/crm/overview', textsRes.error)
    warnings.push(getRelationUnavailableMessage('CRM SMS analytics'))
  }

  const calls = callsRes.error ? [] : (callsRes.data ?? [])
  const allTasks = tasksRes.error ? [] : (tasksRes.data ?? [])
  const tasks = allTasks.filter(task => {
    const lead = task.crm_leads as { is_archived?: boolean } | null
    return lead !== null && lead?.is_archived !== true
  })
  const hotLeads = hotLeadsRes.error ? [] : (hotLeadsRes.data ?? [])
  const texts = textsRes.error ? [] : (textsRes.data ?? [])
  const totalLeadsCount = visibleLeadsRes.error ? 0 : (visibleLeadsRes.count ?? 0)
  const stageCounts = (visibleLeadsRes.error ? [] : (visibleLeadsRes.data ?? [])).reduce<Record<string, number>>((acc, lead) => {
    const s = (lead as { stage?: string }).stage || 'Unknown'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  const { from: todayStart, to: tomorrowStart } = getTodayRangeInCrmTimeZone(now, crmTimeZone)
  const { from: weekStart } = getThisWeekRangeInCrmTimeZone(now, crmTimeZone)
  const { from: monthStart } = getThisMonthRangeInCrmTimeZone(now, crmTimeZone)

  const connects = calls.filter(call => ['Interested', 'Appointment Set', 'Booked Call', 'Closed Won'].includes(call.call_outcome)).length
  const bookedCalls = calls.filter(call => call.strategy_call_booked || ['Appointment Set', 'Booked Call'].includes(call.call_outcome)).length
  const closedDeals = calls.filter(call => call.converted_to_client || call.call_outcome === 'Closed Won').length
  const followUpsPending = tasks.filter(task => task.status !== 'Done').length
  const callbacksDueToday = [
    ...tasks.filter(task => task.task_type === 'Callback' && task.status !== 'Done' && task.due_at && new Date(task.due_at) >= todayStart && new Date(task.due_at) < tomorrowStart),
    ...hotLeads.filter(lead => lead.callback_due_at && new Date(lead.callback_due_at) >= todayStart && new Date(lead.callback_due_at) < tomorrowStart),
  ]

  const callsToday = calls.filter(call => new Date(call.call_started_at) >= todayStart).length
  const callsThisWeek = calls.filter(call => new Date(call.call_started_at) >= weekStart).length
  const callsThisMonth = calls.filter(call => new Date(call.call_started_at) >= monthStart).length
  const avgCallsPerDay = calls.length ? Number((calls.length / Math.max(Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000), 1)).toFixed(1)) : 0
  const avgTalkTimeSeconds = calls.length ? Math.round(calls.reduce((sum, call) => sum + (call.duration_seconds || 0), 0) / calls.length) : 0
  const outboundTexts = texts.filter(text => (text.direction ?? 'outbound') === 'outbound')
  const inboundTexts = texts.filter(text => text.direction === 'inbound')
  const textsSent = outboundTexts.filter(text => text.sent_at).length
  const textsDelivered = outboundTexts.filter(text => text.delivered_at || ['delivered', 'clicked', 'account_created'].includes(text.status)).length
  const textsClicked = outboundTexts.filter(text => text.clicked_at || ['clicked', 'account_created'].includes(text.status)).length
  const inboundReplies = inboundTexts.length
  const unreadConversations = new Set(inboundTexts.filter(text => Boolean(text.unread)).map(text => text.lead_id).filter(Boolean)).size
  const textedLeadIds = new Set(outboundTexts.map(text => text.lead_id).filter(Boolean))
  const repliedLeadIds = new Set(inboundTexts.map(text => text.lead_id).filter(Boolean))
  const textSignupLeadIds = new Set(outboundTexts.filter(text => text.account_created_at || text.status === 'account_created').map(text => text.lead_id).filter(Boolean))
  const textBookedLeadIds = new Set(
    outboundTexts
      .filter(text => Boolean((text.crm_leads as { strategy_call_booked?: boolean } | null)?.strategy_call_booked))
      .map(text => text.lead_id)
      .filter(Boolean)
  )
  const textPaidLeadIds = new Set(
    outboundTexts
      .filter(text => Boolean((text.crm_leads as { converted_to_client?: boolean } | null)?.converted_to_client))
      .map(text => text.lead_id)
      .filter(Boolean)
  )

  const byOutcome = Object.entries(
    calls.reduce<Record<string, number>>((acc, call) => {
      acc[call.call_outcome || 'Unknown'] = (acc[call.call_outcome || 'Unknown'] || 0) + 1
      return acc
    }, {})
  ).map(([label, value]) => ({ label, value }))

  const byDay = Object.entries(
    calls.reduce<Record<string, number>>((acc, call) => {
      const key = new Date(call.call_started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  ).map(([label, value]) => ({ label, value }))

  const conversionsOverTime = Object.entries(
    calls
      .filter(call => call.converted_to_client || call.call_outcome === 'Closed Won')
      .reduce<Record<string, number>>((acc, call) => {
        const key = new Date(call.call_started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})
  ).map(([label, value]) => ({ label, value }))

  const conversionBySource = Object.entries(
    calls.reduce<Record<string, { total: number; won: number }>>((acc, call) => {
      const key = call.source || 'Unknown'
      if (!acc[key]) acc[key] = { total: 0, won: 0 }
      acc[key].total += 1
      if (call.converted_to_client || call.call_outcome === 'Closed Won') acc[key].won += 1
      return acc
    }, {})
  ).map(([label, stats]) => ({
    label,
    total: stats.total,
    won: stats.won,
    rate: stats.total ? Number(((stats.won / stats.total) * 100).toFixed(1)) : 0,
  }))

  const conversionByAgent = Object.entries(
    calls.reduce<Record<string, { total: number; won: number }>>((acc, call) => {
      const key = call.agent_name || 'Unknown'
      if (!acc[key]) acc[key] = { total: 0, won: 0 }
      acc[key].total += 1
      if (call.converted_to_client || call.call_outcome === 'Closed Won') acc[key].won += 1
      return acc
    }, {})
  ).map(([label, stats]) => ({
    label,
    total: stats.total,
    won: stats.won,
    rate: stats.total ? Number(((stats.won / stats.total) * 100).toFixed(1)) : 0,
  }))

  const topHotLeads = hotLeads.map(lead => ({
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
      total_leads: totalLeadsCount,
      hot_leads_count: hotLeads.length,
      calls_today: callsToday,
      calls_this_week: callsThisWeek,
      calls_this_month: callsThisMonth,
      average_calls_per_day: avgCallsPerDay,
      average_talk_time_seconds: avgTalkTimeSeconds,
      texts_sent: textsSent,
      texts_delivered: textsDelivered,
      text_click_rate: textsSent ? Number(((textsClicked / textsSent) * 100).toFixed(1)) : 0,
      inbound_replies: inboundReplies,
      text_reply_rate: textedLeadIds.size ? Number(((repliedLeadIds.size / textedLeadIds.size) * 100).toFixed(1)) : 0,
      unread_text_conversations: unreadConversations,
      leads_texted: textedLeadIds.size,
      text_to_signup_conversion: textedLeadIds.size ? Number(((textSignupLeadIds.size / textedLeadIds.size) * 100).toFixed(1)) : 0,
      text_to_booked_demo_conversion: textedLeadIds.size ? Number(((textBookedLeadIds.size / textedLeadIds.size) * 100).toFixed(1)) : 0,
      text_to_paid_client_conversion: textedLeadIds.size ? Number(((textPaidLeadIds.size / textedLeadIds.size) * 100).toFixed(1)) : 0,
    },
    charts: {
      call_volume_over_time: byDay,
      outcomes_breakdown: byOutcome,
      conversions_over_time: conversionsOverTime,
      conversion_by_source: conversionBySource,
      conversion_by_agent: conversionByAgent,
    },
    stage_counts: stageCounts,
    lists: {
      top_hot_leads: topHotLeads,
      scheduled_callbacks: scheduledCallbacks,
      overdue_tasks: tasks.filter(task => task.status !== 'Done' && task.due_at && new Date(task.due_at) < now).slice(0, 20),
      leads_with_no_recent_activity: hotLeads.filter(lead => !lead.last_contacted_at || new Date(lead.last_contacted_at) < weekStart).slice(0, 20),
    },
    warnings,
  }, { headers: CACHE_HEADERS })
}
