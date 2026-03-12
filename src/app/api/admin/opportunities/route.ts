import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return null
  return supabase
}

// GET — list all opportunities (admin sees all including inactive)
export async function GET() {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('account_opportunities')
    .select('*')
    .order('program')
    .order('priority_score', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ opportunities: data })
}

// POST — create a new opportunity
export async function POST(req: NextRequest) {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, program, stage, category, reports_to, terms, pg_required, description, learn_more_url, apply_url, priority_score, is_active, notes } = body

  if (!name || !program || !stage || !category) {
    return NextResponse.json({ error: 'name, program, stage, and category are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('account_opportunities')
    .insert({
      name, program, stage, category,
      reports_to: reports_to || null,
      terms: terms || null,
      pg_required: pg_required || 'yes',
      description: description || null,
      learn_more_url: learn_more_url || null,
      apply_url: apply_url || null,
      priority_score: priority_score ?? 50,
      is_active: is_active ?? true,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ opportunity: data }, { status: 201 })
}

// PUT — update an opportunity
export async function PUT(req: NextRequest) {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('account_opportunities')
    .update(fields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ opportunity: data })
}

// DELETE — soft-delete (set is_active = false) or hard delete
export async function DELETE(req: NextRequest) {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const hard = searchParams.get('hard') === 'true'

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  if (hard) {
    const { error } = await supabase.from('account_opportunities').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  }

  // Soft delete
  const { data, error } = await supabase
    .from('account_opportunities')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ opportunity: data })
}
