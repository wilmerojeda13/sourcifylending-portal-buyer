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

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'

  const { data } = await supabase
    .from('affiliate_flags')
    .select('*, affiliates(name, email, referral_code), affiliate_referrals(lead_name, lead_email)')
    .eq('status', status)
    .order('created_at', { ascending: false })

  return NextResponse.json({ flags: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase, user } = admin

  const { id, status, admin_notes } = await req.json()
  const { data, error } = await supabase
    .from('affiliate_flags')
    .update({ status, admin_notes, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ flag: data })
}
