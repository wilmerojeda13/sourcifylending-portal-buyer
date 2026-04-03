import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('business_tradelines')
    .select('*')
    .eq('user_id', context.activeBusinessId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tradelines: data || [] })
}

export async function POST(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const body = await req.json()
  const { creditor_name, account_type, credit_limit, balance, payment_status, date_opened, reporting_bureaus, notes } = body

  if (!creditor_name?.trim()) return NextResponse.json({ error: 'Creditor name required' }, { status: 400 })
  if (!account_type?.trim()) return NextResponse.json({ error: 'Account type required' }, { status: 400 })

  const { data, error } = await supabase
    .from('business_tradelines')
    .insert({
      user_id: context.activeBusinessId,
      creditor_name: creditor_name.trim(),
      account_type: account_type.trim(),
      credit_limit: credit_limit ? parseFloat(credit_limit) : null,
      balance: balance ? parseFloat(balance) : null,
      payment_status: payment_status || 'current',
      date_opened: date_opened || null,
      reporting_bureaus: reporting_bureaus || [],
      notes: notes?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tradeline: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { error } = await supabase
    .from('business_tradelines')
    .delete()
    .eq('id', id)
    .eq('user_id', context.activeBusinessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
