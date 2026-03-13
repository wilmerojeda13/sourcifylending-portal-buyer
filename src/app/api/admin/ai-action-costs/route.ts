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

// GET — list all action costs
export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from('ai_action_costs')
    .select('*')
    .order('credit_cost', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ costs: data })
}

// PATCH — update an action's credit cost
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action_type, credit_cost, is_heavy, is_active, description } = body

  if (!action_type) return NextResponse.json({ error: 'action_type required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (credit_cost !== undefined) updates.credit_cost = credit_cost
  if (is_heavy !== undefined) updates.is_heavy = is_heavy
  if (is_active !== undefined) updates.is_active = is_active
  if (description !== undefined) updates.description = description

  const { data, error } = await ctx.supabase
    .from('ai_action_costs')
    .update(updates)
    .eq('action_type', action_type)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cost: data })
}
