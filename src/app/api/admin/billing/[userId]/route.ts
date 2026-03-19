import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PROGRAM_INFO } from '@/lib/stripe'
import type { ProgramId } from '@/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId } = params

    const [profileRes, subRes, arrangementRes, recordsRes] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, email, assigned_program, subscription_status, account_state')
        .eq('id', userId).single(),
      supabase.from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('payment_arrangements')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('payment_records')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ])

    const program = profileRes.data?.assigned_program as ProgramId | null
    const programInfo = program ? PROGRAM_INFO[program] : null

    // Calculate total paid from payment records
    const totalPaid = (recordsRes.data ?? []).reduce(
      (sum: number, r: { amount: number }) => sum + Number(r.amount), 0
    )

    return NextResponse.json({
      profile: profileRes.data,
      subscription: subRes.data,
      arrangement: arrangementRes.data,
      payment_records: recordsRes.data ?? [],
      program_info: programInfo,
      total_paid: totalPaid,
    })
  } catch (error) {
    console.error('Admin billing GET error:', error)
    return NextResponse.json({ error: 'Failed to load billing data' }, { status: 500 })
  }
}
