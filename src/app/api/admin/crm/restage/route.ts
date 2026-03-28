import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leads: incoming } = await req.json() as {
    leads: Array<{
      phone: string; email?: string; stage: string
      first_name?: string; last_name?: string
      business_name?: string; source?: string; notes?: string
      follow_up_at?: string
    }>
  }

  // Fetch all leads for matching
  const { data: allLeads } = await supabase
    .from('crm_leads')
    .select('id, phone, email, first_name, last_name, stage')
    .limit(10000)

  if (!allLeads) return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })

  const phoneIndex = new Map<string, typeof allLeads[number]>()
  const emailIndex = new Map<string, typeof allLeads[number]>()
  const nameIndex  = new Map<string, typeof allLeads[number]>()

  for (const lead of allLeads) {
    const p = normalizePhone(lead.phone ?? '')
    if (p) phoneIndex.set(p, lead)
    const e = (lead.email ?? '').toLowerCase().trim()
    if (e) emailIndex.set(e, lead)
    const n = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.toLowerCase().trim().replace(/\s+/g, ' ')
    if (n) nameIndex.set(n, lead)
  }

  type Result = { name: string; stage: string; status: string; match_by?: string }
  const results: Result[] = []

  for (const item of incoming) {
    const normPhone = normalizePhone(item.phone)
    const normEmail = (item.email ?? '').toLowerCase().trim()
    const normName  = (item.first_name ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

    const matchByPhone = phoneIndex.get(normPhone)
    const matchByEmail = normEmail ? emailIndex.get(normEmail) : undefined
    const matchByName  = normName  ? nameIndex.get(normName)   : undefined
    const match = matchByPhone ?? matchByEmail ?? matchByName
    const matchBy = matchByPhone ? 'phone' : matchByEmail ? 'email' : matchByName ? 'name' : undefined

    const now = new Date().toISOString()

    if (match) {
      // Update existing lead
      const update: Record<string, unknown> = { stage: item.stage, updated_at: now }
      if (item.follow_up_at) update.follow_up_at = item.follow_up_at
      await supabase.from('crm_leads').update(update).eq('id', match.id)
      results.push({ name: item.first_name ?? '', stage: item.stage, status: 'updated', match_by: matchBy })
    } else {
      // Split "First Last" display name into parts
      const parts = (item.first_name ?? '').trim().split(/\s+/)
      const firstName = parts[0] ?? ''
      const lastName  = parts.slice(1).join(' ')

      const insert: Record<string, unknown> = {
        first_name:   firstName,
        last_name:    lastName,
        phone:        item.phone,
        email:        item.email ?? null,
        business_name: item.business_name ?? null,
        stage:        item.stage,
        source:       item.source ?? 'notion_import',
        notes:        item.notes ?? null,
        follow_up_at: item.follow_up_at ?? null,
        do_not_call:  false,
        is_archived:  false,
        created_at:   now,
        updated_at:   now,
      }
      const { error } = await supabase.from('crm_leads').insert(insert)
      results.push({ name: item.first_name ?? '', stage: item.stage, status: error ? 'error' : 'created' })
    }
  }

  const updated = results.filter(r => r.status === 'updated').length
  const created = results.filter(r => r.status === 'created').length
  const errors  = results.filter(r => r.status === 'error').length

  return NextResponse.json({ results, updated, created, errors })
}
