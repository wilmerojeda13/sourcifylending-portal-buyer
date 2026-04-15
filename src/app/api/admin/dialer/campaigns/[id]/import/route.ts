import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { validateLead, normalizePhone } from '@/lib/dialer-lead-validator'
import { createIntegrityGateSummary, addRejection, getRejectionStats, RejectionEntry } from '@/lib/dialer-integrity-gate'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase, userId: user.id }
}

interface LeadRow {
  first_name: string
  last_name: string | null
  phone: string
  email: string | null
  business_name: string | null
  notes: string | null
}

// POST /api/admin/dialer/campaigns/[id]/import
// Body: { leads: LeadRow[] }  (pre-parsed by client from CSV)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { leads: LeadRow[] }
  if (!Array.isArray(body.leads) || !body.leads.length) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 })
  }

  // Validate campaign exists
  const { data: campaign } = await admin.supabase
    .from('dialer_campaigns')
    .select('id')
    .eq('id', params.id)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const rejections: RejectionEntry[] = []
  const totalSubmitted = body.leads.length

  // Run Data Integrity Gate validation on all leads
  const validLeads = body.leads.filter(lead => {
    const validation = validateLead({
      first_name: lead.first_name,
      last_name: lead.last_name || undefined,
      phone: lead.phone,
      email: lead.email || undefined,
      business_name: lead.business_name || undefined,
      notes: lead.notes || undefined,
    })

    if (!validation.isValid) {
      const leadId = `${lead.first_name} ${lead.last_name || ''}`.trim()
      addRejection(rejections, leadId, validation.rejectionReason || 'UNKNOWN', validation.rejectionDetail || 'Unknown reason')
      return false
    }
    return true
  })

  const phones = validLeads.map(l => l.phone.trim())

  // Find raw leads that already exist by phone (including DNC status)
  const { data: existing } = await admin.supabase
    .from('dialer_raw_leads')
    .select('id, phone, do_not_call')
    .in('phone', phones)

  const existingByPhone = new Map((existing ?? []).map(r => [r.phone, { id: r.id, isdnc: r.do_not_call }]))

  // Filter out DNC leads
  const toInsert = validLeads.filter(l => {
    const existing = existingByPhone.get(l.phone.trim())
    if (existing && existing.isdnc) {
      const leadId = `${l.first_name} ${l.last_name || ''}`.trim()
      addRejection(rejections, leadId, 'EXISTING_DNC', `Lead is marked Do Not Call`)
      return false
    }
    return !existing // Only insert if doesn't exist at all
  })
  const skipped  = validLeads.length - toInsert.length - rejections.length

  // Insert new raw leads
  let newIds: string[] = []
  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await admin.supabase
      .from('dialer_raw_leads')
      .insert(toInsert.map(l => ({
        first_name:    l.first_name.trim(),
        last_name:     l.last_name?.trim() || null,
        phone:         l.phone.trim(),
        email:         l.email?.trim() || null,
        business_name: l.business_name?.trim() || null,
        notes:         l.notes?.trim() || null,
        stage:         'new',
      })))
      .select('id')
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    newIds = (inserted ?? []).map(r => r.id)
  }

  // Collect ALL raw_lead ids to add to campaign (excluding DNC)
  const existingIds = validLeads
    .filter(l => {
      const existing = existingByPhone.get(l.phone.trim())
      return existing && !existing.isdnc
    })
    .map(l => existingByPhone.get(l.phone.trim())!.id)
  const allRawIds = [...existingIds, ...newIds]

  // Upsert into campaign (duplicate phone in same campaign is silently skipped)
  if (allRawIds.length > 0) {
    const { error: linkErr } = await admin.supabase
      .from('dialer_campaign_leads')
      .upsert(
        allRawIds.map((raw_lead_id, i) => ({
          campaign_id: params.id,
          raw_lead_id,
          status:     'new',
          sort_order:  i,
        })),
        { onConflict: 'campaign_id,raw_lead_id', ignoreDuplicates: true }
      )
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })
  }

  // Build the integrity gate summary
  const summary = createIntegrityGateSummary(totalSubmitted, allRawIds.length, rejections)
  const rejectionStats = getRejectionStats(rejections)

  // Log rejection summary if there were rejections
  if (rejections.length > 0) {
    console.log(`[Dialer Import] Campaign ${params.id} - Data Integrity Gate Summary:`, {
      totalSubmitted,
      successCount: allRawIds.length,
      rejectionCount: rejections.length,
      rejectionStats,
      sampleRejections: rejections.slice(0, 3),
    })
  }

  return NextResponse.json({
    imported:        allRawIds.length,
    new_leads:       newIds.length,
    skipped,
    rejected:        rejections.length,
    rejection_stats: rejectionStats,
    summary_message: summary.summaryMessage,
  })
}
