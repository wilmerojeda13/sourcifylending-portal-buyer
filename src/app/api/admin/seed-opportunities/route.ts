import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_OPPORTUNITIES } from '@/lib/default-opportunities'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return null
  return supabase
}

/**
 * POST /api/admin/seed-opportunities
 * Body: { mode: 'import' | 'sync' }
 *
 * import — inserts only opportunities that don't already exist (deduped by name+program+stage)
 * sync   — upserts all default opportunities, updating any changed fields (deduped by name+program+stage)
 */
export async function POST(req: NextRequest) {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { mode } = await req.json() as { mode: 'import' | 'sync' }
  if (mode !== 'import' && mode !== 'sync') {
    return NextResponse.json({ error: 'mode must be "import" or "sync"' }, { status: 400 })
  }

  try {
    if (mode === 'import') {
      // Fetch existing (name, program, stage) combos
      const { data: existing } = await supabase
        .from('account_opportunities')
        .select('name, program, stage')

      const existingKeys = new Set(
        (existing || []).map((r) => `${r.name}||${r.program}||${r.stage}`)
      )

      const toInsert = DEFAULT_OPPORTUNITIES.filter(
        (o) => !existingKeys.has(`${o.name}||${o.program}||${o.stage}`)
      )

      if (toInsert.length === 0) {
        return NextResponse.json({ inserted: 0, message: 'All opportunities already exist — nothing to import.' })
      }

      const { data, error } = await supabase
        .from('account_opportunities')
        .insert(toInsert)
        .select('id')

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({
        inserted: data?.length ?? 0,
        skipped: existingKeys.size,
        message: `Imported ${data?.length ?? 0} new opportunities. Skipped ${existingKeys.size} that already existed.`,
      })
    }

    // sync — upsert all, deduped by (name, program, stage)
    // Supabase upsert with onConflict requires a unique constraint on these columns
    const { data, error } = await supabase
      .from('account_opportunities')
      .upsert(DEFAULT_OPPORTUNITIES, {
        onConflict: 'name,program,stage',
        ignoreDuplicates: false,
      })
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      upserted: data?.length ?? 0,
      message: `Synced ${data?.length ?? 0} opportunities (inserted or updated).`,
    })
  } catch (err) {
    console.error('Seed opportunities error:', err)
    return NextResponse.json({ error: 'Failed to seed opportunities' }, { status: 500 })
  }
}
