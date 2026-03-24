import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// GET /api/voice/analytics
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [
    { count: totalCampaigns },
    { count: totalLeads },
    { count: totalCalls },
    { data: callStats },
    { data: dispositionStats },
    { data: sourceStats },
    { data: dailyCalls },
  ] = await Promise.all([
    supabase.from('voice_campaigns').select('id', { count: 'exact', head: true }),
    supabase.from('voice_leads').select('id', { count: 'exact', head: true }),
    supabase.from('voice_calls').select('id', { count: 'exact', head: true }),
    supabase.from('voice_calls').select('status, duration_seconds, disposition'),
    supabase.from('voice_calls').select('disposition').not('disposition', 'is', null),
    supabase.from('voice_leads').select('lead_source, lead_quality_score'),
    supabase.from('voice_calls')
      .select('created_at, status, disposition, duration_seconds')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true }),
  ])

  const calls = callStats ?? []
  const totalConnects   = calls.filter(c => c.status === 'completed' && (c.duration_seconds ?? 0) > 5).length
  const totalQualified  = calls.filter(c => ['decision_maker','interested','send_link','callback_requested','transferred_live'].includes(c.disposition ?? '')).length
  const totalTransfers  = calls.filter(c => c.disposition === 'transferred_live').length
  const totalLinkSends  = calls.filter(c => c.disposition === 'send_link').length
  const totalOptOuts    = calls.filter(c => c.disposition === 'do_not_call').length

  const connectRate     = calls.length > 0 ? Math.round((totalConnects  / calls.length) * 100) : 0
  const qualRate        = calls.length > 0 ? Math.round((totalQualified / calls.length) * 100) : 0

  // Disposition breakdown
  const callsByDisposition: Record<string, number> = {}
  for (const c of (dispositionStats ?? [])) {
    if (c.disposition) callsByDisposition[c.disposition] = (callsByDisposition[c.disposition] ?? 0) + 1
  }

  // Source breakdown (avg score)
  const sourceGroups: Record<string, number[]> = {}
  for (const l of (sourceStats ?? [])) {
    if (!sourceGroups[l.lead_source]) sourceGroups[l.lead_source] = []
    sourceGroups[l.lead_source].push(l.lead_quality_score ?? 50)
  }
  const callsBySource: Record<string, number> = {}
  const sourceAvgScores: Record<string, number> = {}
  for (const [src, scores] of Object.entries(sourceGroups)) {
    callsBySource[src]    = scores.length
    sourceAvgScores[src]  = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  const bestSource  = Object.entries(sourceAvgScores).sort((a, b) => b[1] - a[1])[0]?.[0]  ?? null
  const worstSource = Object.entries(sourceAvgScores).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null

  // Daily call breakdown (last 30 days)
  const dailyMap: Record<string, { count: number; connects: number }> = {}
  for (const c of (dailyCalls ?? [])) {
    const day = c.created_at.slice(0, 10)
    if (!dailyMap[day]) dailyMap[day] = { count: 0, connects: 0 }
    dailyMap[day].count++
    if (c.status === 'completed' && (c.duration_seconds ?? 0) > 5) dailyMap[day].connects++
  }
  const dailyCallsArr = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    total_campaigns:     totalCampaigns ?? 0,
    total_leads:         totalLeads     ?? 0,
    total_calls:         totalCalls     ?? 0,
    total_connects:      totalConnects,
    total_qualified:     totalQualified,
    total_transfers:     totalTransfers,
    total_link_sends:    totalLinkSends,
    total_opt_outs:      totalOptOuts,
    connect_rate:        connectRate,
    qualification_rate:  qualRate,
    best_source:         bestSource,
    worst_source:        worstSource,
    calls_by_disposition: callsByDisposition,
    calls_by_source:     callsBySource,
    daily_calls:         dailyCallsArr,
  })
}
