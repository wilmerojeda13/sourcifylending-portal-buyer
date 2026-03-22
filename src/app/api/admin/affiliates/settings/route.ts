import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!data?.is_admin) return null
  return { user, supabase }
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const { data } = await supabase.from('affiliate_settings').select('*').order('program_type')
  return NextResponse.json({ settings: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const { program_type, ...updates } = await req.json()
  if (!program_type) return NextResponse.json({ error: 'program_type required' }, { status: 400 })

  const allowed = ['setup_commission_percent', 'recurring_commission_percent', 'setup_hold_days', 'recurring_hold_days', 'minimum_payout_threshold', 'setup_commissions_enabled', 'recurring_commissions_enabled']
  const update: Record<string, unknown> = {}
  for (const key of allowed) { if (key in updates) update[key] = updates[key] }

  const { data, error } = await supabase.from('affiliate_settings').update(update).eq('program_type', program_type).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ settings: data })
}
