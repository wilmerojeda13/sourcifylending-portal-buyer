import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  CRM_CONTACT_TAG_ENTITY_TYPE,
  assignCrmTags,
  getTagsForEntities,
  unassignCrmTags,
} from '@/lib/crm-tags'

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

export async function GET(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const entityIds = searchParams.getAll('entity_id')
  if (entityType !== CRM_CONTACT_TAG_ENTITY_TYPE || entityIds.length === 0) {
    return NextResponse.json({ error: 'Only contact tag links are supported.' }, { status: 400 })
  }

  const tagsByEntity = await getTagsForEntities(admin.supabase, CRM_CONTACT_TAG_ENTITY_TYPE, entityIds)
  return NextResponse.json({
    tags_by_entity: Object.fromEntries(tagsByEntity),
  })
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.entity_type || !Array.isArray(body.entity_ids) || !Array.isArray(body.tag_ids)) {
    return NextResponse.json({ error: 'entity_type, entity_ids, and tag_ids are required.' }, { status: 400 })
  }
  if (body.entity_type !== CRM_CONTACT_TAG_ENTITY_TYPE) {
    return NextResponse.json({ error: 'Tags can only be attached to contacts.' }, { status: 400 })
  }

  await assignCrmTags(admin.supabase, {
    entityType: CRM_CONTACT_TAG_ENTITY_TYPE,
    entityIds: body.entity_ids,
    tagIds: body.tag_ids,
    createdByUserId: admin.userId,
    createdByName: admin.userName,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.entity_type || !Array.isArray(body.entity_ids) || !Array.isArray(body.tag_ids)) {
    return NextResponse.json({ error: 'entity_type, entity_ids, and tag_ids are required.' }, { status: 400 })
  }
  if (body.entity_type !== CRM_CONTACT_TAG_ENTITY_TYPE) {
    return NextResponse.json({ error: 'Tags can only be attached to contacts.' }, { status: 400 })
  }

  await unassignCrmTags(admin.supabase, {
    entityType: CRM_CONTACT_TAG_ENTITY_TYPE,
    entityIds: body.entity_ids,
    tagIds: body.tag_ids,
  })

  return NextResponse.json({ ok: true })
}
