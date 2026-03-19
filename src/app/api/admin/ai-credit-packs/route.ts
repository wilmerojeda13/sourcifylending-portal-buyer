import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return null
  return { user, supabase }
}

// GET — list all credit packs
export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from('ai_credit_packs')
    .select('*')
    .order('display_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packs: data ?? [] })
}

// POST — create a new credit pack
// body: { name, description?, credits_amount, price_usd, stripe_price_id?, display_order? }
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, description, credits_amount, price_usd, stripe_price_id, display_order } = body

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (credits_amount == null || isNaN(Number(credits_amount))) {
    return NextResponse.json({ error: 'credits_amount required' }, { status: 400 })
  }
  if (price_usd == null || isNaN(Number(price_usd))) {
    return NextResponse.json({ error: 'price_usd required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await ctx.supabase
    .from('ai_credit_packs')
    .insert({
      name,
      description: description ?? null,
      credits_amount: Number(credits_amount),
      price_usd: Number(price_usd),
      stripe_price_id: stripe_price_id ?? null,
      display_order: display_order ?? 99,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pack: data })
}

// PATCH — update an existing pack
// body: { id, name?, description?, credits_amount?, price_usd?, stripe_price_id?, is_active?, display_order? }
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['name', 'description', 'credits_amount', 'price_usd', 'stripe_price_id', 'is_active', 'display_order']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key]
  }

  const { data, error } = await ctx.supabase
    .from('ai_credit_packs')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pack: data })
}

// DELETE — soft-delete (deactivate) a pack
export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await ctx.supabase
    .from('ai_credit_packs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
