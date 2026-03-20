import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/demo/switch-program
 * Swaps `assigned_program` ↔ `demo_secondary_program` for demo accounts.
 * Only works when the authenticated user has `is_demo = true` and a secondary program set.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_demo, assigned_program, demo_secondary_program')
    .eq('id', session.user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (!profile.is_demo) {
    return NextResponse.json({ error: 'Not a demo account' }, { status: 403 })
  }

  if (!profile.demo_secondary_program) {
    return NextResponse.json({ error: 'No secondary program configured' }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      assigned_program: profile.demo_secondary_program,
      demo_secondary_program: profile.assigned_program,
    })
    .eq('id', session.user.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to switch program' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    new_program: profile.demo_secondary_program,
  })
}
