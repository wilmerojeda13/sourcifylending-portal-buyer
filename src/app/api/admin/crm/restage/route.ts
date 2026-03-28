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
    leads: Array<{ phone: string; email?: string; stage: string; first_name?: string; follow_up_at?: string }>
  }

  // Fetch all leads (up to 10k)
  const { data: allLeads } = await supabase
    .from('crm_leads')
    .select('id, phone, email, first_name, last_name, stage')
    .limit(10000)

  if (!allLeads) return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })

  // Build indexes: phone, email, and full name
  const phoneIndex = new Map<string, typeof allLeads[number]>()
  const emailIndex = new Map<string, typeof allLeads[number]>()
  const nameIndex  = new Map<string, typeof allLeads[number]>()

  for (const lead of allLeads) {
    const phone = normalizePhone(lead.phone ?? '')
    if (phone) phoneIndex.set(phone, lead)
    const email = (lead.email ?? '').toLowerCase().trim()
    if (email) emailIndex.set(email, lead)
    const fullName = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.toLowerCase().trim().replace(/\s+/g, ' ')
    if (fullName) nameIndex.set(fullName, lead)
  }

  type Result = {
    phone: string; email?: string; first_name?: string; stage: string
    status: string; match_by?: string; id?: string; prev_stage?: string
  }
  const results: Result[] = []

  for (const item of incoming) {
    const normalizedPhone = normalizePhone(item.phone)
    const normalizedEmail = (item.email ?? '').toLowerCase().trim()
    // first_name field in client holds full display name e.g. "Billy Berringer"
    const normalizedName  = (item.first_name ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

    const matchByPhone = phoneIndex.get(normalizedPhone)
    const matchByEmail = normalizedEmail ? emailIndex.get(normalizedEmail) : undefined
    const matchByName  = normalizedName  ? nameIndex.get(normalizedName)   : undefined
    const match = matchByPhone ?? matchByEmail ?? matchByName
    const matchBy = matchByPhone ? 'phone' : matchByEmail ? 'email' : matchByName ? 'name' : undefined

    if (!match) {
      results.push({ phone: item.phone, email: item.email, first_name: item.first_name, stage: item.stage, status: 'not_found' })
      continue
    }

    const update: Record<string, unknown> = {
      stage: item.stage,
      updated_at: new Date().toISOString(),
    }
    if (item.follow_up_at) update.follow_up_at = item.follow_up_at

    const { error } = await supabase
      .from('crm_leads')
      .update(update)
      .eq('id', match.id)

    results.push({
      phone: item.phone,
      email: item.email,
      first_name: item.first_name ?? match.first_name,
      stage: item.stage,
      status: error ? 'error' : 'updated',
      match_by: matchBy,
      id: match.id,
      prev_stage: match.stage,
    })
  }

  const updated = results.filter(r => r.status === 'updated').length
  const notFound = results.filter(r => r.status === 'not_found').length
  const errors = results.filter(r => r.status === 'error').length

  return NextResponse.json({ results, updated, notFound, errors })
}
