import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { mergeCrmTags, softDeleteCrmTag, updateCrmTag } from '@/lib/crm-tags'

async function assertAdmin() {
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
  return supabase
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  try {
    if (body.merge_target_id) {
      await mergeCrmTags(supabase, {
        sourceTagId: id,
        targetTagId: body.merge_target_id,
      })
      return NextResponse.json({ ok: true, merged: true })
    }

    const tag = await updateCrmTag(supabase, id, {
      name: body.name,
      color: body.color,
      description: body.description,
    })
    return NextResponse.json({ tag })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update tag.' },
      { status: 400 },
    )
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await softDeleteCrmTag(supabase, id)
  return NextResponse.json({ ok: true })
}
