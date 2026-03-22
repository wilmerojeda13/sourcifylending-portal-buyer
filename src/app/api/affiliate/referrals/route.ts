import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: affiliate } = await supabase
      .from('affiliates').select('id').eq('user_id', user.id).single()
    if (!affiliate) return NextResponse.json({ error: 'Not an affiliate' }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = 20
    const offset = (page - 1) * limit

    const { data, count } = await supabase
      .from('affiliate_referrals')
      .select('*', { count: 'exact' })
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    return NextResponse.json({ referrals: data ?? [], total: count ?? 0, page, limit })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
