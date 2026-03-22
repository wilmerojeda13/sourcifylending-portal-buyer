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
  const type = searchParams.get('type') || 'commissions'
  const status = searchParams.get('status')

  if (type === 'commissions') {
    let query = supabase
      .from('affiliate_commissions')
      .select('*, affiliates(name, email, referral_code), affiliate_referrals(lead_name, lead_email)')
      .order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data } = await query

    const rows = (data ?? []).map(c => [
      c.affiliates?.name,
      c.affiliates?.email,
      c.affiliates?.referral_code,
      c.affiliate_referrals?.lead_name,
      c.affiliate_referrals?.lead_email,
      c.program_type,
      c.commission_type,
      (c.gross_amount / 100).toFixed(2),
      c.commission_percent,
      (c.commission_amount / 100).toFixed(2),
      c.status,
      c.available_at ? new Date(c.available_at).toLocaleDateString() : '',
      c.paid_at ? new Date(c.paid_at).toLocaleDateString() : '',
    ])

    const header = 'Affiliate Name,Affiliate Email,Referral Code,Client Name,Client Email,Program,Type,Gross Amount,Commission %,Commission Amount,Status,Available Date,Paid Date\n'
    const csv = header + rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=commissions-export-${new Date().toISOString().split('T')[0]}.csv`,
      },
    })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
