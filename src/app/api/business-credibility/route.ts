import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('business_credibility_checklist')
    .select('*')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { item_key, is_complete, notes } = await req.json()
  if (!item_key) return NextResponse.json({ error: 'item_key required' }, { status: 400 })

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('business_credibility_checklist')
    .upsert({
      user_id: user.id,
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
