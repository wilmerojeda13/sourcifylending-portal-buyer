import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateReferralCode } from '@/lib/affiliates'

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
  const search = searchParams.get('search')
  const limit = 20
  const offset = (page - 1) * limit

  let query = supabase
    .from('affiliates')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,referral_code.ilike.%${search}%`)

  const { data, count } = await query

  // For each affiliate get active referral count and total commissions
  const enriched = await Promise.all((data ?? []).map(async (aff) => {
    const [{ count: activeCount }, { data: commData }] = await Promise.all([
      supabase.from('affiliate_referrals').select('id', { count: 'exact', head: true })
        .eq('affiliate_id', aff.id).eq('referral_status', 'active').eq('subscription_active', true),
      supabase.from('affiliate_commissions').select('commission_amount, status').eq('affiliate_id', aff.id),
    ])
    const totalEarned = (commData ?? []).filter(c => c.status !== 'reversed').reduce((s, c) => s + c.commission_amount, 0)
    const pendingPayout = (commData ?? []).filter(c => c.status === 'approved').reduce((s, c) => s + c.commission_amount, 0)
    return { ...aff, active_referrals: activeCount ?? 0, total_earned: totalEarned, pending_payout: pendingPayout }
  }))

  return NextResponse.json({ affiliates: enriched, total: count ?? 0, page, limit })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const { name, email, notes } = await req.json()
  if (!name || !email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 })

  // Generate unique referral code
  let referralCode = generateReferralCode(name)
  const { data: existing } = await supabase.from('affiliates').select('id').eq('referral_code', referralCode).maybeSingle()
  if (existing) referralCode = generateReferralCode(name) + Math.random().toString(36).substring(2, 4).toUpperCase()

  // Create auth user if not exists
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name, role: 'affiliate' },
  })

  let userId: string | null = null
  if (!authError && authUser?.user) {
    userId = authUser.user.id
  } else {
    // User might already exist — find by email
    const { data: users } = await supabase.auth.admin.listUsers()
    const found = users?.users?.find(u => u.email === email)
    if (found) userId = found.id
  }

  // Rule 4: detect if this person is already an existing client
  // (they have a subscription record tied to their user account)
  let isExistingClient = false
  if (userId) {
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    if (existingSub) isExistingClient = true
  }

  const { data: affiliate, error } = await supabase
    .from('affiliates')
    .insert({
      name,
      email,
      referral_code: referralCode,
      user_id: userId,
      notes,
      is_existing_client: isExistingClient,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ affiliate, is_existing_client: isExistingClient })
}
