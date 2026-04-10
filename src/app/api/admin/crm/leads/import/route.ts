import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

interface ImportRow {
  first_name: string
  last_name?: string
  phone: string
  email?: string
  business_name?: string
  stage?: string
  program_interest?: string
  source?: string
  notes?: string
}

const VALID_STAGES = ['new','contacted','qualified','demo_scheduled','closed_won','closed_lost']
const VALID_PROGRAMS = ['program_a','program_b','program_c']
const VALID_SOURCES = ['manual','analyzer','affiliate','facebook','purchased','referral','inbound','other']

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
}

// POST /api/admin/crm/leads/import
// Body: { leads: ImportRow[] }
export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leads } = await req.json() as { leads: ImportRow[] }
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 })
  }

  // Fetch existing phones to dedupe (from dialer_raw_leads)
  const { data: existing } = await supabase
    .from('dialer_raw_leads')
    .select('phone')
  const existingPhones = new Set((existing ?? []).map((r: { phone: string }) => normalizePhone(r.phone)))

  const toInsert: Record<string, unknown>[] = []
  const skipped: string[] = []
  const invalid: string[] = []

  for (const row of leads) {
    if (!row.first_name?.trim() || !row.phone?.trim()) {
      invalid.push(`${row.first_name ?? '?'} — missing name or phone`)
      continue
    }
    const normPhone = normalizePhone(row.phone.trim())
    if (existingPhones.has(normPhone)) {
      skipped.push(`${row.first_name} ${row.last_name ?? ''} (${row.phone})`)
      continue
    }
    existingPhones.add(normPhone) // prevent dupes within the batch

    toInsert.push({
      first_name:       row.first_name.trim(),
      last_name:        row.last_name?.trim() ?? '',
      phone:            row.phone.trim(),
      email:            row.email?.trim() || null,
      business_name:    row.business_name?.trim() || null,
      source:           VALID_SOURCES.includes(row.source ?? '') ? row.source : 'manual',
      notes:            row.notes?.trim() || null,
      original_import_payload: { stage: row.stage, program_interest: row.program_interest },
    })
  }

  // Batch insert in groups of 200
  let inserted = 0
  const BATCH = 200
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('dialer_raw_leads').insert(batch)
    if (error) {
      return NextResponse.json({
        error: `Batch insert failed at row ${i}: ${error.message}`,
        inserted,
        skipped: skipped.length,
        invalid: invalid.length,
      }, { status: 500 })
    }
    inserted += batch.length
  }

  return NextResponse.json({
    inserted,
    skipped: skipped.length,
    skipped_samples: skipped.slice(0, 5),
    invalid: invalid.length,
    invalid_samples: invalid.slice(0, 5),
  })
}
