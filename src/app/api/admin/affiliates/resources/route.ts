import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!data?.is_admin) return null
  return { user, supabase }
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin
  const { data } = await supabase.from('affiliate_resource_content').select('*').order('sort_order')
  return NextResponse.json({ resources: data ?? [] })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const { title, slug, content, category, status, sort_order } = await req.json()
  const { data, error } = await supabase.from('affiliate_resource_content')
    .insert({ title, slug, content, category, status: status || 'published', sort_order: sort_order || 0 })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ resource: data })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin

  const { id, ...updates } = await req.json()
  const allowed = ['title', 'slug', 'content', 'category', 'status', 'sort_order']
  const update: Record<string, unknown> = {}
  for (const key of allowed) { if (key in updates) update[key] = updates[key] }

  const { data, error } = await supabase.from('affiliate_resource_content').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ resource: data })
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase } = admin
  const { id } = await req.json()
  await supabase.from('affiliate_resource_content').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
