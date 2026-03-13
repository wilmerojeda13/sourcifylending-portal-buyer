import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// ── GET /api/admin/ai-maintenance ─────────────────────────────────────────────
// Returns current maintenance mode status and note
export async function GET() {
  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ai_maintenance')
      .single()

    if (error || !data) {
      // Row doesn't exist yet — return defaults
      return NextResponse.json({ enabled: false, note: '' })
    }

    const val = data.value as { enabled?: boolean; note?: string }
    return NextResponse.json({
      enabled: val.enabled ?? false,
      note: val.note ?? '',
    })
  } catch (err) {
    console.error('GET /api/admin/ai-maintenance error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ── PATCH /api/admin/ai-maintenance ───────────────────────────────────────────
// Body: { enabled?: boolean, note?: string }
export async function PATCH(req: NextRequest) {
  try {
    // Auth check — must be an admin
    const userSupabase = await createClient()
    const { data: { user } } = await userSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await userSupabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { enabled, note } = body as { enabled?: boolean; note?: string }

    const supabase = await createServiceClient()

    // Upsert the row
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        {
          key: 'ai_maintenance',
          value: {
            enabled: enabled ?? false,
            note: note ?? '',
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      )

    if (error) {
      console.error('PATCH /api/admin/ai-maintenance DB error:', error)
      return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 })
    }

    console.log(
      `[AI-MAINTENANCE] Admin ${user.email} set maintenance_mode=${enabled ?? false}. Note: "${note ?? ''}"`
    )

    return NextResponse.json({ success: true, enabled: enabled ?? false, note: note ?? '' })
  } catch (err) {
    console.error('PATCH /api/admin/ai-maintenance error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
