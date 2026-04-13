import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isBlacklistedIndustry, inferIndustryFromCompany } from '@/lib/dialer-industry'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase, userId: user.id }
}

// GET: list campaign leads with raw lead data merged in
// Query params:
//   status=<str>    filter by campaign lead status
//   dialable=1      only dialable statuses (new/attempted/callback/follow_up)
//   ids_only=1      return only [{id}] for the current filter (for bulk select-all)
//   page=<int>      0-indexed page number (default 0), ignored when dialable=1 or ids_only=1
//   limit=<int>     page size (default 100, max 500), ignored when dialable=1 or ids_only=1
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp       = new URL(req.url).searchParams
  const status   = sp.get('status')
  const dialable = sp.get('dialable') === '1'
  const idsOnly  = sp.get('ids_only') === '1'
  const page     = Math.max(0, parseInt(sp.get('page') ?? '0', 10))
  const limit    = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '100', 10)))

  // For ids_only or dialable: return all matching IDs/leads (no page cap)
  if (idsOnly) {
    let q = admin.supabase
      .from('dialer_campaign_leads')
      .select('id')
      .eq('campaign_id', params.id)
      .range(0, 999999)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ids: (data ?? []).map(r => r.id) })
  }

  // Special case: high_priority filter looks at raw lead stage, not campaign status
  // CRITICAL: Must exclude leads already called (last_called_at IS NULL) to prevent rehashing
  if (status === 'high_priority') {
    const { data, error } = await admin.supabase
      .from('dialer_campaign_leads')
      .select(`
        id, campaign_id, raw_lead_id, status, last_call_outcome, last_called_at,
        callback_due_at, follow_up_at, notes, sort_order, added_at, updated_at,
        raw_lead:dialer_raw_leads!inner(
          id, first_name, last_name, phone, phone_e164, email, business_name, notes, industry,
          do_not_call, is_archived, promoted_to_crm_lead_id,
          likely_timezone, timezone_confidence, call_window_status, blocked_until_label,
          source, created_at, stage
        )
      `)
      .eq('campaign_id', params.id)
      .eq('raw_lead.stage', 'high_priority')
      .is('last_called_at', null)   // STRICT: once called, never rehashed
      .order('sort_order', { ascending: true })
      .range(0, 999999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const leads = (data ?? []).filter(l => {
      const raw = (l as unknown as { raw_lead?: { do_not_call?: boolean; is_archived?: boolean; industry?: string | null; business_name?: string | null } }).raw_lead
      if (!raw || raw.do_not_call || raw.is_archived) return false
      if (isBlacklistedIndustry({ industry: raw.industry, business_name: raw.business_name })) return false
      return true
    })
    return NextResponse.json({ leads, total: leads.length })
  }

  if (dialable) {
    // Queue: return all dialable leads (no pagination — dialer works through them sequentially)
    const { data, error } = await admin.supabase
      .from('dialer_campaign_leads')
      .select(`
        id, campaign_id, raw_lead_id, status, last_call_outcome, last_called_at,
        callback_due_at, follow_up_at, notes, sort_order, added_at, updated_at,
        raw_lead:dialer_raw_leads(
          id, first_name, last_name, phone, phone_e164, email, business_name, notes, industry,
          do_not_call, is_archived, promoted_to_crm_lead_id,
          likely_timezone, timezone_confidence, call_window_status, blocked_until_label,
          source, created_at
        )
      `)
      .eq('campaign_id', params.id)
      .eq('status', 'new')
      .is('last_called_at', null)   // STRICT: once called, never rehashed
      .order('sort_order', { ascending: true })
      .range(0, 999999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const seenPhones = new Set<string>()
    const leads = (data ?? []).filter(l => {
      const raw = (l as unknown as { raw_lead?: { do_not_call?: boolean; is_archived?: boolean; industry?: string | null; business_name?: string | null; phone?: string | null; phone_e164?: string | null } }).raw_lead
      if (!raw || raw.do_not_call || raw.is_archived) return false
      if (isBlacklistedIndustry({ industry: raw.industry, business_name: raw.business_name })) return false
      // DISTINCT ON phone: never surface the same number twice in one queue fetch
      const phone = raw.phone_e164 ?? raw.phone
      if (phone) {
        if (seenPhones.has(phone)) return false
        seenPhones.add(phone)
      }
      return true
    }).map(l => {
      const raw = (l as unknown as { raw_lead?: { industry?: string | null; business_name?: string | null } }).raw_lead
      if (raw && !raw.industry && raw.business_name) {
        raw.industry = inferIndustryFromCompany(raw.business_name)
      }
      return l
    })
    return NextResponse.json({ leads, total: leads.length })
  }

  // Paginated list for campaign detail view
  const from = page * limit
  const to   = from + limit - 1

  // Count total matching rows (lightweight — no row data)
  let countQ = admin.supabase
    .from('dialer_campaign_leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', params.id)
  if (status) countQ = countQ.eq('status', status)
  const { count: total } = await countQ

  // Fetch the current page
  let query = admin.supabase
    .from('dialer_campaign_leads')
    .select(`
      id, campaign_id, raw_lead_id, status, last_call_outcome, last_called_at,
      callback_due_at, follow_up_at, notes, sort_order, added_at, updated_at,
      raw_lead:dialer_raw_leads(
        id, first_name, last_name, phone, phone_e164, email, business_name, notes, industry,
        do_not_call, is_archived, promoted_to_crm_lead_id,
        likely_timezone, timezone_confidence, call_window_status, blocked_until_label,
        source, created_at
      )
    `)
    .eq('campaign_id', params.id)
    .order('sort_order', { ascending: true })
    .order('added_at',   { ascending: true })
    .range(from, to)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ leads: data ?? [], total: total ?? 0, page, limit })
}

// POST: add raw leads into this campaign
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { raw_lead_ids: string[] }
  if (!Array.isArray(body.raw_lead_ids) || body.raw_lead_ids.length === 0) {
    return NextResponse.json({ error: 'raw_lead_ids required' }, { status: 400 })
  }

  const rows = body.raw_lead_ids.map((id, i) => ({
    campaign_id: params.id,
    raw_lead_id: id,
    sort_order:  i,
  }))

  // upsert so duplicates are ignored
  const { error } = await admin.supabase
    .from('dialer_campaign_leads')
    .upsert(rows, { onConflict: 'campaign_id,raw_lead_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, added: rows.length })
}

// PATCH: bulk action on campaign leads (body: { action, lead_ids })
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { action: 'remove' | 'reset'; lead_ids: string[] }
  if (!Array.isArray(body.lead_ids) || !body.lead_ids.length) {
    return NextResponse.json({ error: 'lead_ids required' }, { status: 400 })
  }

  const ids = body.lead_ids

  if (body.action === 'remove') {
    const { error } = await admin.supabase
      .from('dialer_campaign_leads')
      .delete()
      .in('id', ids)
      .eq('campaign_id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body.action === 'reset') {
    const { error } = await admin.supabase
      .from('dialer_campaign_leads')
      .update({ status: 'new', last_call_outcome: null, last_called_at: null })
      .in('id', ids)
      .eq('campaign_id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, updated: ids.length })
}

// DELETE: remove a raw lead from campaign (body: { raw_lead_id })
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { raw_lead_id: string }
  const { error } = await admin.supabase
    .from('dialer_campaign_leads')
    .delete()
    .eq('campaign_id', params.id)
    .eq('raw_lead_id', body.raw_lead_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
