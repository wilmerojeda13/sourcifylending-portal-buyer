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
  const limit = 25
  const offset = (page - 1) * limit

  let query = supabase
    .from('affiliate_payouts')
    .select('*, affiliates(id, name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (affiliateId) query = query.eq('affiliate_id', affiliateId)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ payouts: data ?? [], total: count ?? 0, page, limit })
}
