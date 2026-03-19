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
      amount,
      payment_date,
      payment_source,
      payment_type,
      notes,
      stripe_customer_id,
      stripe_invoice_id,
      stripe_payment_intent_id,
    } = await req.json()

    if (!user_id || !amount || !payment_source) {
      return NextResponse.json({ error: 'user_id, amount, and payment_source required' }, { status: 400 })
    }

    // Get subscription id
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, setup_fee_paid')
      .eq('user_id', user_id)
      .maybeSingle()

    const { data, error } = await supabase
      .from('payment_records')
      .insert({
        user_id,
        subscription_id: sub?.id ?? null,
        amount: Number(amount),
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        payment_source,
        payment_type: payment_type || 'other',
        notes: notes || null,
        stripe_customer_id: stripe_customer_id || null,
        stripe_invoice_id: stripe_invoice_id || null,
        stripe_payment_intent_id: stripe_payment_intent_id || null,
        logged_by: user.email,
      })
      .select()
      .single()

    if (error) throw error

    // Update setup_fee_paid on subscriptions if setup payment type
    if (sub && (payment_type === 'setup_fee' || payment_type === 'partial_setup' || payment_type === 'balance_payment')) {
      const newPaid = Number(sub.setup_fee_paid || 0) + Number(amount)
      await supabase
        .from('subscriptions')
        .update({ setup_fee_paid: newPaid, updated_at: new Date().toISOString() })
        .eq('user_id', user_id)

      // Also update arrangement if exists
      await supabase
        .from('payment_arrangements')
        .update({
          setup_fee_paid: newPaid,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user_id)
        .eq('is_active', true)
    }

    return NextResponse.json({ success: true, record: data })
  } catch (error) {
    console.error('Admin billing payment-record error:', error)
    return NextResponse.json({ error: 'Failed to log payment' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { error } = await supabase.from('payment_records').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin billing payment-record DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 })
  }
}
