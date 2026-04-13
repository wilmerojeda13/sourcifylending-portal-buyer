import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// How many leads to pull in each backfill batch
const REFILL_BATCH     = 100
// Trigger threshold — refill when fresh leads fall below this
const FRESH_THRESHOLD  = 50

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
  if (fresh < FRESH_THRESHOLD) {
    // Get all raw_lead_ids already in this campaign to avoid duplicates
    const { data: existingRows } = await admin.supabase
      .from('dialer_campaign_leads')
      .select('raw_lead_id')
      .eq('campaign_id', campaignId)

    const existingSet = new Set((existingRows ?? []).map(r => r.raw_lead_id))

    // Pull fresh high_priority raw leads never called globally
    const { data: candidates } = await admin.supabase
      .from('dialer_raw_leads')
      .select('id')
      .eq('stage', 'high_priority')
      .eq('is_archived', false)
      .eq('do_not_call', false)
      .is('promoted_to_crm_lead_id', null)
      .is('last_call_at', null)
      .order('created_at', { ascending: true })
      .limit(REFILL_BATCH + 50) // fetch extra to cover those already in campaign

    const toAdd = (candidates ?? [])
      .filter(l => !existingSet.has(l.id))
      .slice(0, REFILL_BATCH)

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
