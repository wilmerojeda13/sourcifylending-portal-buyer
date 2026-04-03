import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('business_credit_profile')
    .select('*')
    .eq('user_id', context.activeBusinessId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}

export async function PATCH(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const body = await req.json()
  const allowed = [
    'duns_number', 'duns_status', 'duns_date',
    'experian_status', 'experian_date', 'experian_score',
    'equifax_status', 'equifax_date', 'equifax_score',
    'nav_status', 'nav_date',
    'paydex_score', 'paydex_date',
    'intelliscore', 'intelliscore_date',
    'notes',
  ]

  const updates: Record<string, unknown> = { user_id: context.activeBusinessId, updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] ?? null
  }

  const { data, error } = await supabase
    .from('business_credit_profile')
    .upsert(updates, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
