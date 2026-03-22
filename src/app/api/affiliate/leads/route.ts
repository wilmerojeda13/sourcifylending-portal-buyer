import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function getAffiliate() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, email, name, referral_code, status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!affiliate || affiliate.status === 'suspended') return null
  return { user, affiliate, supabase }
}

export async function GET(req: NextRequest) {
  const ctx = await getAffiliate()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { affiliate, supabase } = ctx

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 25
  const offset = (page - 1) * limit

  let query = supabase
    .from('affiliate_leads')
    .select('*', { count: 'exact' })
    .eq('affiliate_id', affiliate.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, limit })
}

export async function POST(req: NextRequest) {
  const ctx = await getAffiliate()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { affiliate, supabase } = ctx

  const body = await req.json()
  const { full_name, email, phone, business_name, notes, deal_type } = body

  if (!full_name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Full name and email are required' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.trim())) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const validDealTypes = ['referral_only', 'affiliate_closed']
  if (deal_type && !validDealTypes.includes(deal_type)) {
    return NextResponse.json({ error: 'Invalid deal type' }, { status: 400 })
  }

  const normalizedEmail = email.trim().toLowerCase()

  // Block if email already has a platform account
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingProfile) {
    return NextResponse.json({ error: 'This email already has an account on the platform.' }, { status: 409 })
  }

  // Block duplicate within this affiliate's leads
  const { data: existingLead } = await supabase
    .from('affiliate_leads')
    .select('id, status')
    .eq('affiliate_id', affiliate.id)
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingLead) {
    return NextResponse.json({
      error: 'You already have a lead with this email address.',
      existing: existingLead,
    }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('affiliate_leads')
    .insert({
      affiliate_id: affiliate.id,
      full_name: full_name.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || null,
      business_name: business_name?.trim() || null,
      notes: notes?.trim() || null,
      deal_type: deal_type || 'referral_only',
      status: 'lead_created',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ lead: data })
}
