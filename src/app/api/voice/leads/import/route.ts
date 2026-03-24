import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { scrubBatch, parseCsvLeads } from '@/modules/voice-agent/services/scrubbing'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, supabase: null }
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return { error: 'Forbidden', status: 403, supabase: null }
  return { error: null, status: 200, supabase }
}

// POST /api/voice/leads/import
// Body: { campaign_id?, csv: string } OR multipart form with file
export async function POST(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const contentType = req.headers.get('content-type') ?? ''
  let csvText = ''
  let campaignId: string | null = null

  if (contentType.includes('application/json')) {
    const body = await req.json()
    csvText    = body.csv ?? ''
    campaignId = body.campaign_id ?? null
  } else if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file') as File | null
    csvText    = file ? await file.text() : ''
    campaignId = (form.get('campaign_id') as string | null) ?? null
  } else {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 })
  }

  if (!csvText.trim()) return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 })

  // Parse CSV
  const rawLeads = parseCsvLeads(csvText)
  if (rawLeads.length === 0) return NextResponse.json({ error: 'No leads found in CSV' }, { status: 400 })
  if (rawLeads.length > 5000) return NextResponse.json({ error: 'Max 5,000 leads per import' }, { status: 400 })

  // Load suppression list
  const [{ data: suppressed }, { data: existingLeads }] = await Promise.all([
    supabase.from('voice_suppression_list').select('phone_e164'),
    campaignId
      ? supabase.from('voice_leads').select('phone_e164').eq('campaign_id', campaignId)
      : Promise.resolve({ data: [] }),
  ])

  const suppressionSet   = new Set((suppressed ?? []).map((s: { phone_e164: string }) => s.phone_e164))
  const existingPhoneSet = new Set((existingLeads ?? []).map((l: { phone_e164: string }) => l.phone_e164).filter(Boolean) as string[])

  // Scrub all leads
  const scrubbed = scrubBatch(rawLeads, suppressionSet, existingPhoneSet)

  // Prepare DB records
  const toInsert = scrubbed.map(s => ({
    campaign_id:        campaignId,
    first_name:         s.first_name,
    last_name:          s.last_name,
    business_name:      s.business_name,
    owner_name:         s.owner_name,
    email:              s.email,
    phone_raw:          s.phone_raw,
    phone_e164:         s.phone_e164,
    phone_validated:    s.phone_validated,
    line_type:          s.line_type,
    validation_status:  s.validation_status,
    lead_source:        s.lead_source,
    lead_age_days:      s.lead_age_days,
    geography:          s.geography,
    duplicate_group_id: s.duplicate_group_id,
    is_duplicate:       s.is_duplicate,
    lead_quality_score: s.lead_quality_score,
    lead_priority_tier: s.lead_priority_tier,
    do_not_call:        s.do_not_call,
    metadata:           { ...s.metadata, import_flags: s.flags },
  }))

  // Insert in chunks of 500
  const CHUNK_SIZE = 500
  let inserted = 0
  let errors   = 0

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    const { error: insertErr, count } = await supabase
      .from('voice_leads')
      .insert(chunk)
      .select('id', { count: 'exact' })

    if (insertErr) {
      console.error('[voice/leads/import] Chunk insert error:', insertErr)
      errors += chunk.length
    } else {
      inserted += count ?? chunk.length
    }
  }

  // Update campaign lead count
  if (campaignId && inserted > 0) {
    const { count: totalLeads } = await supabase
      .from('voice_leads')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)

    await supabase
      .from('voice_campaigns')
      .update({ total_leads: totalLeads ?? 0, updated_at: new Date().toISOString() })
      .eq('id', campaignId)
  }

  const suppressed_count = scrubbed.filter(s => s.do_not_call).length
  const duplicate_count  = scrubbed.filter(s => s.is_duplicate).length
  const invalid_count    = scrubbed.filter(s => s.validation_status === 'invalid').length

  return NextResponse.json({
    success: true,
    total:      rawLeads.length,
    inserted,
    errors,
    suppressed: suppressed_count,
    duplicates: duplicate_count,
    invalid:    invalid_count,
  })
}
