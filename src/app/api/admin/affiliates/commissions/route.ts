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
  const page = parseInt(searchParams.get('page') || '1')
  const status = searchParams.get('status')
  const affiliateId = searchParams.get('affiliate_id')
  const program = searchParams.get('program')
  const limit = 25
  const offset = (page - 1) * limit

  let query = supabase
    .from('affiliate_commissions')
    .select('*, affiliates(name, email, referral_code), affiliate_referrals(lead_name, lead_email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (affiliateId) query = query.eq('affiliate_id', affiliateId)
  if (program) query = query.eq('program_type', program)

  const { data, count } = await query
  return NextResponse.json({ commissions: data ?? [], total: count ?? 0, page, limit })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const { id, status, action } = await req.json()
  if (!id || !action) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const update: Record<string, unknown> = { status }
  if (action === 'approve') { update.status = 'approved'; update.approved_at = new Date().toISOString() }
  if (action === 'pay') { update.status = 'paid'; update.paid_at = new Date().toISOString() }
  if (action === 'reverse') { update.status = 'reversed'; update.reversed_at = new Date().toISOString(); update.reversal_reason = 'Admin manual reversal' }

  const { data, error } = await supabase.from('affiliate_commissions').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ commission: data })
}
