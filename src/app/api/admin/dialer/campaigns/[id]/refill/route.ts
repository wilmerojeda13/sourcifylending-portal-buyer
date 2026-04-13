import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// How many leads to pull in each backfill batch
const REFILL_BATCH     = 500
// Trigger threshold — refill when fresh leads fall below this
const FRESH_THRESHOLD  = 500
// High priority industries for automatic ingestion
const PRIORITY_INDUSTRIES = [
  'Construction', 'Transportation/Trucking', 'Manufacturing', 'E-commerce',
  'Professional Services', 'Real Estate', 'Healthcare', 'Auto/Automotive'
]

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase, userId: user.id }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaignId = params.id
  const now = new Date().toISOString()
  let scrubbed = 0
  let added    = 0

  // ── Step 1: Scrub data-consistency issue ─────────────────────────────────
  // Any lead with status='new' but last_called_at IS NOT NULL was called but
  // never had its status updated correctly. Move to 'attempted' so it stops
  // polluting the fresh queue count.
  const { count: scrubbedCount } = await admin.supabase
    .from('dialer_campaign_leads')
    .update({ status: 'attempted', updated_at: now }, { count: 'exact' })
    .eq('campaign_id', campaignId)
    .eq('status', 'new')
    .not('last_called_at', 'is', null)

  scrubbed = scrubbedCount ?? 0

  // ── Step 2: Count current fresh leads ────────────────────────────────────
  const { count: freshCount } = await admin.supabase
    .from('dialer_campaign_leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'new')
    .is('last_called_at', null)

  const fresh = freshCount ?? 0

  // ── Step 3: Backfill only when below threshold ───────────────────────────
  // INFINITE FEED: Auto-ingest high-priority leads from entire database
  if (fresh < FRESH_THRESHOLD) {
    // Get all raw_lead_ids already in this campaign to avoid duplicates
    const { data: existingRows } = await admin.supabase
      .from('dialer_campaign_leads')
      .select('raw_lead_id')
      .eq('campaign_id', campaignId)

    const existingSet = new Set((existingRows ?? []).map(r => r.raw_lead_id))

    const needed = FRESH_THRESHOLD - fresh

    // PRIORITY 1: Pull existing high_priority stage leads
    let toAdd: { id: string }[] = []
    
    const { data: priorityCandidates } = await admin.supabase
      .from('dialer_raw_leads')
      .select('id')
      .eq('stage', 'high_priority')
      .eq('is_archived', false)
      .eq('do_not_call', false)
      .is('promoted_to_crm_lead_id', null)
      .is('last_call_at', null)
      .order('created_at', { ascending: true })
      .limit(REFILL_BATCH * 2)

    toAdd = (priorityCandidates ?? [])
      .filter(l => !existingSet.has(l.id))
      .slice(0, needed)

    // PRIORITY 2: If still need more, auto-promote priority industry leads
    if (toAdd.length < needed) {
      const { data: industryCandidates } = await admin.supabase
        .from('dialer_raw_leads')
        .select('id, industry, stage')
        .eq('is_archived', false)
        .eq('do_not_call', false)
        .is('promoted_to_crm_lead_id', null)
        .is('last_call_at', null)
        .not('industry', 'is', null)
        .in('industry', PRIORITY_INDUSTRIES)
        .neq('stage', 'high_priority') // Don't duplicate
        .order('created_at', { ascending: true })
        .limit(REFILL_BATCH * 2)

      const industryAdds = (industryCandidates ?? [])
        .filter(l => !existingSet.has(l.id) && !toAdd.some(a => a.id === l.id))
        .slice(0, needed - toAdd.length)

      // Auto-upgrade these leads to high_priority stage
      if (industryAdds.length > 0) {
        const idsToUpgrade = industryAdds.map(l => l.id)
        await admin.supabase
          .from('dialer_raw_leads')
          .update({ stage: 'high_priority', updated_at: now })
          .in('id', idsToUpgrade)
        
        toAdd.push(...industryAdds)
      }
    }

    // PRIORITY 3: If still need more, scan entire unassigned database
    if (toAdd.length < needed) {
      const { data: allCandidates } = await admin.supabase
        .from('dialer_raw_leads')
        .select('id, industry, email')
        .eq('is_archived', false)
        .eq('do_not_call', false)
        .is('promoted_to_crm_lead_id', null)
        .is('last_call_at', null)
        .order('created_at', { ascending: true })
        .limit(REFILL_BATCH * 3)

      const remainingAdds = (allCandidates ?? [])
        .filter(l => {
          if (existingSet.has(l.id)) return false
          if (toAdd.some(a => a.id === l.id)) return false
          // Filter for leads with professional emails or priority industries
          const hasPriorityIndustry = l.industry && PRIORITY_INDUSTRIES.includes(l.industry)
          const hasEmail = l.email && l.email.includes('@') && !l.email.match(/@(gmail|yahoo|hotmail|outlook)\.com$/i)
          return hasPriorityIndustry || hasEmail
        })
        .slice(0, needed - toAdd.length)

      toAdd.push(...remainingAdds)
    }

    if (toAdd.length > 0) {
      // Append after existing leads
      const { data: maxRow } = await admin.supabase
        .from('dialer_campaign_leads')
        .select('sort_order')
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()
      const baseSort = (maxRow?.sort_order ?? 0) + 1

      const rows = toAdd.map((l, i) => ({
        campaign_id: campaignId,
        raw_lead_id: l.id,
        sort_order:  baseSort + i,
      }))

      const { error: insertErr } = await admin.supabase
        .from('dialer_campaign_leads')
        .upsert(rows, { onConflict: 'campaign_id,raw_lead_id', ignoreDuplicates: true })

      if (!insertErr) added = toAdd.length
      else console.error('[Refill] Insert error:', insertErr.message)
    }
  }

  return NextResponse.json({
    ok:             true,
    scrubbed,
    added,
    fresh_remaining: fresh + added,
    was_below_threshold: fresh < FRESH_THRESHOLD,
  })
}
