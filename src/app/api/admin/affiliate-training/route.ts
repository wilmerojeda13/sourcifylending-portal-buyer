import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data: video, error } = await supabase
    .from('affiliate_training_videos')
    .insert({
      title:        body.title?.trim(),
      description:  body.description?.trim() ?? '',
      duration:     body.duration?.trim() ?? '',
      category:     body.category,
      embed_url:    body.embed_url?.trim() ?? '',
      is_published: body.is_published ?? false,
      sort_order:   body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ video })
}

export async function PATCH(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (fields.title        !== undefined) update.title        = fields.title?.trim()
  if (fields.description  !== undefined) update.description  = fields.description?.trim()
  if (fields.duration     !== undefined) update.duration     = fields.duration?.trim()
  if (fields.category     !== undefined) update.category     = fields.category
  if (fields.embed_url    !== undefined) update.embed_url    = fields.embed_url?.trim()
  if (fields.is_published !== undefined) update.is_published = fields.is_published
  if (fields.sort_order   !== undefined) update.sort_order   = fields.sort_order

  const { data: video, error } = await supabase
    .from('affiliate_training_videos')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ video })
}

export async function DELETE(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('affiliate_training_videos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
