import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'

// ─── GET — current profile data for settings form ────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, email, business_name, entity_type, industry, phone')
    .eq('id', context.activeBusinessId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    profile: {
      full_name: profile?.full_name ?? '',
      email: user.email ?? '',           // auth email is authoritative
      business_name: profile?.business_name ?? '',
      entity_type: profile?.entity_type ?? '',
      industry: profile?.industry ?? '',
      phone: (profile as Record<string, unknown>)?.phone ?? '',
    }
  })
}

// ─── PATCH — update profile fields ───────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Only these fields are allowed via client self-service
  const allowed = ['full_name', 'business_name', 'entity_type', 'industry', 'phone'] as const
  type AllowedKey = typeof allowed[number]
  const updates: Partial<Record<AllowedKey, string>> = {}

  for (const key of allowed) {
    if (key in body && typeof body[key] === 'string') {
      updates[key] = body[key].trim()
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  // Validate full_name not blank
  if ('full_name' in updates && !updates.full_name) {
    return NextResponse.json({ error: 'Name cannot be blank' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', context.activeBusinessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If email change requested, route through Supabase Auth
  if (body.email && body.email !== user.email) {
    const newEmail = (body.email as string).trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ error: 'Invalid email address', profileUpdated: true }, { status: 400 })
    }
    const { error: authErr } = await supabase.auth.updateUser({ email: newEmail })
    if (authErr) {
      return NextResponse.json({ error: authErr.message, profileUpdated: true }, { status: 400 })
    }
    return NextResponse.json({ success: true, emailChangeRequested: true })
  }

  return NextResponse.json({ success: true })
}
