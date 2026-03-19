import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const VALID_PROGRAMS = ['program_a', 'program_b', 'program_c']

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { user: null, supabase: null, error: 'Unauthorized' }
  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return { user: null, supabase: null, error: 'Forbidden' }
  return { user, supabase, error: null }
}

// ─── GET — fetch all memberships for a user ───────────────────────────────────
export async function GET(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status: 403 })

  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const { data, error: dbErr } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ memberships: data ?? [] })
}

// ─── POST — add a membership for a user ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const { user, supabase, error } = await requireAdmin()
  if (error || !supabase || !user) return NextResponse.json({ error }, { status: 403 })

  const { user_id, program_code, notes } = await req.json()

  if (!user_id || !program_code) {
    return NextResponse.json({ error: 'user_id and program_code required' }, { status: 400 })
  }
  if (!VALID_PROGRAMS.includes(program_code)) {
    return NextResponse.json({ error: 'Invalid program_code' }, { status: 400 })
  }

  // Upsert membership (re-activates if previously removed)
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .upsert({
      user_id,
      program_code,
      status: 'active',
      activated_at: new Date().toISOString(),
      activated_by: user.email,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,program_code' })
    .select()
    .single()

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  // Update profiles.assigned_program if this is program_a or program_b
  // For dual enrollment, track the "primary" program (the first non-C program)
  if (program_code !== 'program_c') {
    // Check if they already have a non-C program as primary
    const { data: profile } = await supabase
      .from('profiles')
      .select('assigned_program')
      .eq('id', user_id)
      .single()

    // Only update assigned_program if they don't have one yet, or if we're explicitly setting it
    if (!profile?.assigned_program) {
      await supabase
        .from('profiles')
        .update({ assigned_program: program_code, updated_at: new Date().toISOString() })
        .eq('id', user_id)
    }
  }

  // Log to payment_records as a note (no-op, just tracking)
  return NextResponse.json({ success: true, membership })
}

// ─── PATCH — update membership status (activate/deactivate) ──────────────────
export async function PATCH(req: NextRequest) {
  const { user, supabase, error } = await requireAdmin()
  if (error || !supabase || !user) return NextResponse.json({ error }, { status: 403 })

  const { user_id, program_code, status } = await req.json()

  if (!user_id || !program_code || !status) {
    return NextResponse.json({ error: 'user_id, program_code, and status required' }, { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('memberships')
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...(status === 'active' ? { activated_at: new Date().toISOString(), activated_by: user.email } : {}),
      ...(status === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {}),
    })
    .eq('user_id', user_id)
    .eq('program_code', program_code)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// ─── DELETE — remove a membership ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status: 403 })

  const { user_id, program_code } = await req.json()
  if (!user_id || !program_code) {
    return NextResponse.json({ error: 'user_id and program_code required' }, { status: 400 })
  }

  // Soft-delete: set status to cancelled
  const { error: delErr } = await supabase
    .from('memberships')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)
    .eq('program_code', program_code)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // If removing a primary program, check if we should update assigned_program
  if (program_code !== 'program_c') {
    const { data: remaining } = await supabase
      .from('memberships')
      .select('program_code')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .neq('program_code', 'program_c')

    const newPrimary = remaining?.[0]?.program_code ?? null
    await supabase
      .from('profiles')
      .update({ assigned_program: newPrimary, updated_at: new Date().toISOString() })
      .eq('id', user_id)
  }

  return NextResponse.json({ success: true })
}
