import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PRIORITY_INDUSTRIES, inferIndustryFromCompany } from '@/lib/dialer-industry'

const AUTO_REFILL_BATCH = 200
const AUTO_REFILL_THRESHOLD = 10

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

  // ── Step 3: Auto-backfill when the queue is low ──────────────────────────
  if (fresh < AUTO_REFILL_THRESHOLD) {
    const [{ data: campaignRows }, { data: allCampaignRows }] = await Promise.all([
      admin.supabase
        .from('dialer_campaign_leads')
        .select('raw_lead_id')
        .eq('campaign_id', campaignId),
      admin.supabase
        .from('dialer_campaign_leads')
        .select('raw_lead_id')
        .range(0, 999999),
    ])

    const currentCampaignSet = new Set((campaignRows ?? []).map(r => r.raw_lead_id))
    const assignedSet = new Set((allCampaignRows ?? []).map(r => r.raw_lead_id))

    const { data: candidateRows, error: candidateErr } = await admin.supabase
      .from('dialer_raw_leads')
      .select('id, industry, business_name, created_at, stage')
      .eq('is_archived', false)
      .eq('do_not_call', false)
      .is('promoted_to_crm_lead_id', null)
      .is('last_call_at', null)
      .order('created_at', { ascending: true })
      .range(0, 5999)

    if (candidateErr) {
      console.error('[Refill] Candidate query error:', candidateErr.message)
      return NextResponse.json({ error: candidateErr.message }, { status: 500 })
    }

    const highPriorityCandidates = (candidateRows ?? [])
      .filter(row => {
        const industry = row.industry?.trim() || inferIndustryFromCompany(row.business_name)
        return Boolean(industry && PRIORITY_INDUSTRIES.includes(industry))
      })
      .filter(row => !currentCampaignSet.has(row.id) && !assignedSet.has(row.id))
      .slice(0, AUTO_REFILL_BATCH)

    if (highPriorityCandidates.length > 0) {
      const candidateIds = highPriorityCandidates.map(row => row.id)
      await admin.supabase
        .from('dialer_raw_leads')
        .update({ stage: 'high_priority', updated_at: now })
        .in('id', candidateIds)

      const { data: maxRow } = await admin.supabase
        .from('dialer_campaign_leads')
        .select('sort_order')
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const baseSort = (maxRow?.sort_order ?? 0) + 1

      const rows = highPriorityCandidates.map((l, i) => ({
        campaign_id: campaignId,
        raw_lead_id: l.id,
        sort_order: baseSort + i,
      }))

      const { error: insertErr } = await admin.supabase
        .from('dialer_campaign_leads')
        .upsert(rows, { onConflict: 'campaign_id,raw_lead_id', ignoreDuplicates: true })

      if (!insertErr) added = rows.length
      else console.error('[Refill] Insert error:', insertErr.message)
    }
  }

  return NextResponse.json({
    ok:             true,
    scrubbed,
    added,
    fresh_remaining: fresh + added,
    was_below_threshold: fresh < AUTO_REFILL_THRESHOLD,
  })
}
