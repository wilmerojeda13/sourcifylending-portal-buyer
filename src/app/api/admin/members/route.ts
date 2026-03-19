import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null, supabase: null }
  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return { error: 'Forbidden', status: 403, user: null, supabase: null }
  return { error: null, status: 200, user, supabase }
}

// ─── POST — create a new member ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const { full_name, email, password, assigned_program, account_state = 'prospect' } = body

  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!password || password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: (full_name ?? '').trim() },
  })

  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })

  await supabase.from('profiles').insert({
    id: newUser.user.id,
    email: email.trim(),
    full_name: (full_name ?? '').trim(),
    subscription_status: 'inactive',
    account_state,
    assigned_program: assigned_program || null,
    progress_percentage: 0,
    nsf_flag: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  return NextResponse.json({
    success: true,
    member: {
      id: newUser.user.id,
      full_name: (full_name ?? '').trim(),
      email: email.trim(),
      business_name: null,
      subscription_status: 'inactive',
      assigned_program: assigned_program || null,
      current_stage: null,
      progress: 0,
      last_activity: null,
      funding_total: 0,
      health_status: 'good',
      portal_blocked: false,
      is_demo: false,
      created_at: new Date().toISOString(),
    },
  }, { status: 201 })
}

// ─── DELETE — delete a member ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { error, status, user, supabase } = await requireAdmin()
  if (error || !supabase || !user) return NextResponse.json({ error }, { status })

  const { user_id } = await req.json()
  if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  if (user_id === user.id) return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })

  // Delete profile first (avoids FK issues), then auth user
  await supabase.from('profiles').delete().eq('id', user_id)
  const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
