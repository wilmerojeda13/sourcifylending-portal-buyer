import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const {
      user_id,
      program_code,
      setup_fee_total,
      setup_fee_paid,
      recurring_amount,
      next_amount_due,
      next_due_date,
      notes,
    } = await req.json()

    if (!user_id || !program_code) {
      return NextResponse.json({ error: 'user_id and program_code required' }, { status: 400 })
    }

    // Deactivate existing active arrangements
    await supabase
      .from('payment_arrangements')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .eq('is_active', true)

    // Get subscription id
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', user_id)
      .maybeSingle()

    const { data, error } = await supabase
      .from('payment_arrangements')
      .insert({
        user_id,
        subscription_id: sub?.id ?? null,
        program_code,
        setup_fee_total: Number(setup_fee_total) || 0,
        setup_fee_paid: Number(setup_fee_paid) || 0,
        recurring_amount: Number(recurring_amount) || 0,
        next_amount_due: next_amount_due ? Number(next_amount_due) : null,
        next_due_date: next_due_date || null,
        notes: notes || null,
        created_by: user.email,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    // Update subscription billing_status to reflect arrangement
    await supabase
      .from('subscriptions')
      .update({
        billing_status: 'payment_arrangement',
        setup_fee_paid: Number(setup_fee_paid) || 0,
        setup_fee_standard: Number(setup_fee_total) || 0,
        monthly_fee_standard: Number(recurring_amount) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user_id)

    return NextResponse.json({ success: true, arrangement: data })
  } catch (error) {
    console.error('Admin billing arrangement error:', error)
    return NextResponse.json({ error: 'Failed to save arrangement' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, ...updates } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { error } = await supabase
      .from('payment_arrangements')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin billing arrangement PUT error:', error)
    return NextResponse.json({ error: 'Failed to update arrangement' }, { status: 500 })
  }
}
