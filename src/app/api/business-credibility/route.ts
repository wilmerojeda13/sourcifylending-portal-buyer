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
    .from('business_credibility_checklist')
    .select('*')
    .eq('user_id', context.activeBusinessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function PATCH(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const { item_key, is_complete, notes } = await req.json()
  if (!item_key) return NextResponse.json({ error: 'item_key required' }, { status: 400 })

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('business_credibility_checklist')
    .upsert({
      user_id: context.activeBusinessId,
      item_key,
      is_complete: is_complete ?? false,
      completed_at: is_complete ? now : null,
      notes: notes ?? null,
      updated_at: now,
    }, { onConflict: 'user_id,item_key' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
