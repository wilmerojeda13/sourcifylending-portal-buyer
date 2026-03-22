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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const [{ data: affiliate }, { data: referrals }, { data: commissions }, { data: flags }, { count: clicks }] = await Promise.all([
    supabase.from('affiliates').select('*').eq('id', params.id).single(),
    supabase.from('affiliate_referrals').select('*').eq('affiliate_id', params.id).order('created_at', { ascending: false }),
    supabase.from('affiliate_commissions').select('*').eq('affiliate_id', params.id).order('created_at', { ascending: false }),
    supabase.from('affiliate_flags').select('*').eq('affiliate_id', params.id).order('created_at', { ascending: false }),
    supabase.from('affiliate_clicks').select('id', { count: 'exact', head: true }).eq('affiliate_id', params.id),
  ])

  return NextResponse.json({ affiliate, referrals: referrals ?? [], commissions: commissions ?? [], flags: flags ?? [], total_clicks: clicks ?? 0 })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const body = await req.json()
  const allowed = ['status', 'admin_notes', 'has_free_program_b_access', 'qualification_start_date', 'tier']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { data, error } = await supabase.from('affiliates').update(update).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ affiliate: data })
}
