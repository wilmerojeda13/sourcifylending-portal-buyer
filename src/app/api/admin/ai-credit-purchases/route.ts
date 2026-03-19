import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return null
  return { user, supabase }
}

// GET — list all purchase transactions (joined with profile info)
// query params: ?limit=50&offset=0&user_id=xxx
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const userId = searchParams.get('user_id')

  let query = ctx.supabase
    .from('ai_credit_purchase_transactions')
    .select(`
      id,
      user_id,
      ai_credit_pack_id,
      purchased_credits_bucket_id,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      amount_paid,
      credits_added,
      transaction_status,
      adjusted_by,
      adjustment_reason,
      created_at,
      updated_at,
      profiles:user_id (
        full_name,
        email,
        assigned_program
      ),
      ai_credit_packs:ai_credit_pack_id (
        name,
        credits_amount,
        price_usd
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transactions: data ?? [], total: count ?? 0 })
}

// POST — admin manual credit grant or promo
// body: { user_id, credits_amount, source_type: 'admin_grant' | 'promo', reason? }
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { user_id, credits_amount, source_type, reason } = body

  if (!user_id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }
  if (!credits_amount || isNaN(Number(credits_amount)) || Number(credits_amount) <= 0) {
    return NextResponse.json({ error: 'credits_amount must be a positive number' }, { status: 400 })
  }
  if (!source_type || !['admin_grant', 'promo'].includes(source_type)) {
    return NextResponse.json({ error: 'source_type must be admin_grant or promo' }, { status: 400 })
  }

  const credits = Math.round(Number(credits_amount))
  const now = new Date().toISOString()

  // 1. Verify the target user exists
  const { data: targetProfile } = await ctx.supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', user_id)
    .single()

  if (!targetProfile) {
    return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
  }

  // 2. Create purchased credit bucket
  const { data: bucket, error: bucketErr } = await ctx.supabase
    .from('user_purchased_ai_credits')
    .insert({
      user_id,
      credits_purchased: credits,
      credits_used: 0,
      credits_remaining: credits,
      source_type,
      source_reference_id: `admin_grant_by_${ctx.user.id}`,
      purchase_date: now,
      status: 'active',
    })
    .select('id')
    .single()

  if (bucketErr || !bucket) {
    console.error('[ADMIN-GRANT] Failed to create credit bucket:', bucketErr)
    return NextResponse.json({ error: bucketErr?.message ?? 'Failed to create credit bucket' }, { status: 500 })
  }

  // 3. Log the transaction
  const { data: txn, error: txnErr } = await ctx.supabase
    .from('ai_credit_purchase_transactions')
    .insert({
      user_id,
      ai_credit_pack_id: null,
      purchased_credits_bucket_id: bucket.id,
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
      amount_paid: 0,
      credits_added: credits,
      transaction_status: 'completed',
      adjusted_by: ctx.user.id,
      adjustment_reason: reason ?? null,
    })
    .select()
    .single()

  if (txnErr) {
    console.error('[ADMIN-GRANT] Failed to log transaction:', txnErr)
    return NextResponse.json({ error: txnErr.message }, { status: 500 })
  }

  // 4. Notify the user
  const sourceLabel = source_type === 'promo' ? 'promotional' : 'admin'
  await ctx.supabase.from('notifications').insert({
    user_id,
    type: 'system',
    title: '🎁 AI Credits Added to Your Account',
    message: `${credits} AI credits have been added to your account as a ${sourceLabel} grant${reason ? `: "${reason}"` : ''}. They are ready to use immediately.`,
    read: false,
    created_at: now,
  })

  return NextResponse.json({ transaction: txn, bucket_id: bucket.id })
}
