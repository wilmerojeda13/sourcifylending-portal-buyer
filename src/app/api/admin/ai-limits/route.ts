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

// GET — list all program limits
export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from('ai_program_limits')
    .select('*')
    .order('program')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ limits: data })
}

// PATCH — update a program's limits
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { program, monthly_credits, daily_credit_cap, max_requests_per_hour, max_heavy_actions_per_day, is_active } = body

  if (!program) return NextResponse.json({ error: 'program required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (monthly_credits !== undefined) updates.monthly_credits = monthly_credits
  if (daily_credit_cap !== undefined) updates.daily_credit_cap = daily_credit_cap
  if (max_requests_per_hour !== undefined) updates.max_requests_per_hour = max_requests_per_hour
  if (max_heavy_actions_per_day !== undefined) updates.max_heavy_actions_per_day = max_heavy_actions_per_day
  if (is_active !== undefined) updates.is_active = is_active

  const { data, error } = await ctx.supabase
    .from('ai_program_limits')
    .update(updates)
    .eq('program', program)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ limit: data })
}
