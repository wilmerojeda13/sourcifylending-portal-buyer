import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logMemoryEvent } from '@/lib/ai-memory'

// ─── GET — list approvals for authenticated user ──────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('funding_approvals')
    .select('*')
    .eq('user_id', user.id)
    .order('approval_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ approvals: data })
}

// ─── POST — create a new approval record ─────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    program_type, approval_type, issuer_name, account_name,
    approved_amount, approved_limit, approval_date, status, notes,
    decline_reason, mark_for_reattempt
  } = body

  if (!approval_type?.trim()) return NextResponse.json({ error: 'Outcome type is required' }, { status: 400 })
  if (!issuer_name?.trim())   return NextResponse.json({ error: 'Issuer name is required' }, { status: 400 })
  if (!approval_date)         return NextResponse.json({ error: 'Date is required' }, { status: 400 })
  if (status === 'Declined' && !decline_reason?.trim()) {
    return NextResponse.json({ error: 'Decline reason is required' }, { status: 400 })
  }

  const { data: approval, error } = await supabase
    .from('funding_approvals')
    .insert({
      user_id: user.id,
      program_type: program_type || null,
      approval_type: approval_type.trim(),
      issuer_name: issuer_name.trim(),
      account_name: account_name?.trim() || null,
      approved_amount: approved_amount ? parseFloat(approved_amount) : null,
      approved_limit: approved_limit ? parseFloat(approved_limit) : null,
      approval_date,
      status: status || 'Approved',
      notes: notes?.trim() || null,
      decline_reason: decline_reason?.trim() || null,
      mark_for_reattempt: mark_for_reattempt === true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if ((status || 'Approved') === 'Approved') {
    const amt = approval.approved_limit ?? approval.approved_amount
    logMemoryEvent(user.id, 'funding_approval_logged',
      `Approval logged: ${issuer_name.trim()}`,
      `${approval_type} — ${amt ? `$${Number(amt).toLocaleString()}` : 'amount TBD'}`,
      approval.id
    )
  }

  return NextResponse.json({ approval }, { status: 201 })
}

// ─── PATCH — update an existing approval record OR funding goal ─────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, fundingGoal, ...fields } = body

  // Special case: update funding goal on profile
  if (fundingGoal !== undefined && !id) {
    const goalAmount = fundingGoal ? parseFloat(String(fundingGoal)) : null
    const { data, error } = await supabase
      .from('profiles')
      .update({ funding_goal_amount: goalAmount, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('funding_goal_amount')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ fundingGoal: data?.funding_goal_amount })
  }

  // Update approval record
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const allowed = ['program_type', 'approval_type', 'issuer_name', 'account_name',
    'approved_amount', 'approved_limit', 'approval_date', 'status', 'notes',
    'decline_reason', 'mark_for_reattempt']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key] ?? null
  }

  const { data: approval, error } = await supabase
    .from('funding_approvals')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ approval })
}

// ─── DELETE — remove an approval record ──────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { error } = await supabase
    .from('funding_approvals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
