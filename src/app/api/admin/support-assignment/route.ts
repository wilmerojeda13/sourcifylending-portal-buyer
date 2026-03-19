import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// ─── PATCH /api/admin/support-assignment ──────────────────────────────────────
// Body: { client_user_id, assigned_to_name, support_notes }
export async function PATCH(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json() as {
      client_user_id: string
      assigned_to_name?: string | null
      support_notes?: string | null
    }

    const { client_user_id, assigned_to_name, support_notes } = body
    if (!client_user_id) return NextResponse.json({ error: 'client_user_id required' }, { status: 400 })

    const { data: assignment, error } = await supabase
      .from('support_assignments')
      .upsert(
        {
          client_user_id,
          assigned_to_name: assigned_to_name ?? null,
          support_notes: support_notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_user_id' }
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ assignment })
  } catch (error) {
    console.error('PATCH support-assignment error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
