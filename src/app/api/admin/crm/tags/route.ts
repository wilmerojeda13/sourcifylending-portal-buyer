import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createCrmTag, listCrmTags } from '@/lib/crm-tags'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    supabase,
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
  }
}

export async function GET() {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tags = await listCrmTags(admin.supabase)
  return NextResponse.json({ tags })
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Tag name is required.' }, { status: 400 })
  }

  try {
    const tag = await createCrmTag(admin.supabase, {
      name: body.name,
      color: body.color ?? null,
      description: body.description ?? null,
      createdByUserId: admin.userId,
      createdByName: admin.userName,
    })
    return NextResponse.json({ tag }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create tag.' },
      { status: 400 },
    )
  }
}
