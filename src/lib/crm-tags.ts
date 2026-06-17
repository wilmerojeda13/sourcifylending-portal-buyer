import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>
const CRM_TAG_QUERY_CHUNK_SIZE = 200

export const CRM_CONTACT_TAG_ENTITY_TYPE = 'lead' as const
export type CRMTagEntityType = typeof CRM_CONTACT_TAG_ENTITY_TYPE
export type CRMTagFilterMode = 'any' | 'all'

export interface CRMTagRecord {
  id: string
  name: string
  slug: string
  color: string
  description: string | null
  created_by_user_id?: string | null
  created_by_name?: string | null
  created_at: string
  updated_at: string
}

export function normalizeCrmTagSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function listCrmTags(supabase: ServiceClient) {
  const { data, error } = await supabase
    .from('crm_tags')
    .select('id, name, slug, color, description, created_by_user_id, created_by_name, created_at, updated_at')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as CRMTagRecord[]
}

export async function createCrmTag(
  supabase: ServiceClient,
  input: {
    name: string
    color?: string | null
    description?: string | null
    createdByUserId?: string | null
    createdByName?: string | null
  },
) {
  const name = input.name.trim()
  const slug = normalizeCrmTagSlug(name)
  if (!name || !slug) {
    throw new Error('Tag name is required.')
  }

  const { data, error } = await supabase
    .from('crm_tags')
    .insert({
      name,
      slug,
      color: input.color?.trim() || 'slate',
      description: input.description?.trim() || null,
      created_by_user_id: input.createdByUserId || null,
      created_by_name: input.createdByName || null,
      updated_at: new Date().toISOString(),
    })
    .select('id, name, slug, color, description, created_by_user_id, created_by_name, created_at, updated_at')
    .single()

  if (error) throw error
  return data as CRMTagRecord
}

export async function updateCrmTag(
  supabase: ServiceClient,
  tagId: string,
  input: {
    name?: string
    color?: string | null
    description?: string | null
  },
) {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (typeof input.name === 'string') {
    const name = input.name.trim()
    const slug = normalizeCrmTagSlug(name)
    if (!name || !slug) {
      throw new Error('Tag name is required.')
    }
    update.name = name
    update.slug = slug
  }
  if ('color' in input) update.color = input.color?.trim() || 'slate'
  if ('description' in input) update.description = input.description?.trim() || null

  const { data, error } = await supabase
    .from('crm_tags')
    .update(update)
    .eq('id', tagId)
    .select('id, name, slug, color, description, created_by_user_id, created_by_name, created_at, updated_at')
    .single()

  if (error) throw error
  return data as CRMTagRecord
}

export async function softDeleteCrmTag(supabase: ServiceClient, tagId: string) {
  const { error } = await supabase
    .from('crm_tags')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', tagId)

  if (error) throw error

  const { error: linkError } = await supabase
    .from('crm_tag_links')
    .delete()
    .eq('tag_id', tagId)

  if (linkError) throw linkError
}

export async function mergeCrmTags(
  supabase: ServiceClient,
  input: {
    sourceTagId: string
    targetTagId: string
  },
) {
  if (input.sourceTagId === input.targetTagId) {
    return
  }

  const { data: links, error: linksError } = await supabase
    .from('crm_tag_links')
    .select('entity_type, entity_id')
    .eq('tag_id', input.sourceTagId)

  if (linksError) throw linksError

  if ((links ?? []).length > 0) {
    const newRows = (links ?? []).map((link) => ({
      tag_id: input.targetTagId,
      entity_type: link.entity_type,
      entity_id: link.entity_id,
    }))

    const { error: insertError } = await supabase
      .from('crm_tag_links')
      .upsert(newRows, { onConflict: 'tag_id,entity_type,entity_id', ignoreDuplicates: true })

    if (insertError) throw insertError
  }

  await softDeleteCrmTag(supabase, input.sourceTagId)
}

export async function assignCrmTags(
  supabase: ServiceClient,
  input: {
    tagIds: string[]
    entityType: CRMTagEntityType
    entityIds: string[]
    createdByUserId?: string | null
    createdByName?: string | null
  },
) {
  if (input.tagIds.length === 0 || input.entityIds.length === 0) return

  const rows = input.entityIds.flatMap((entityId) =>
    input.tagIds.map((tagId) => ({
      tag_id: tagId,
      entity_type: input.entityType,
      entity_id: entityId,
      created_by_user_id: input.createdByUserId || null,
      created_by_name: input.createdByName || null,
    })),
  )

  const { error } = await supabase
    .from('crm_tag_links')
    .upsert(rows, { onConflict: 'tag_id,entity_type,entity_id', ignoreDuplicates: true })

  if (error) throw error

  await syncLeadTagTextArray(supabase, input.entityIds)
}

export async function unassignCrmTags(
  supabase: ServiceClient,
  input: {
    tagIds: string[]
    entityType: CRMTagEntityType
    entityIds: string[]
  },
) {
  if (input.tagIds.length === 0 || input.entityIds.length === 0) return

  const { error } = await supabase
    .from('crm_tag_links')
    .delete()
    .eq('entity_type', input.entityType)
    .in('entity_id', input.entityIds)
    .in('tag_id', input.tagIds)

  if (error) throw error

  await syncLeadTagTextArray(supabase, input.entityIds)
}

export async function getTagsForEntities(
  supabase: ServiceClient,
  entityType: CRMTagEntityType,
  entityIds: string[],
) {
  if (entityIds.length === 0) {
    return new Map<string, CRMTagRecord[]>()
  }
  const linkRows: Array<{ entity_id: string; tag_id: string }> = []

  for (let index = 0; index < entityIds.length; index += CRM_TAG_QUERY_CHUNK_SIZE) {
    const chunk = entityIds.slice(index, index + CRM_TAG_QUERY_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('crm_tag_links')
      .select('entity_id, tag_id')
      .eq('entity_type', entityType)
      .in('entity_id', chunk)

    if (error) throw error
    linkRows.push(...((data ?? []) as Array<{ entity_id: string; tag_id: string }>))
  }

  const tagIds = Array.from(new Set(linkRows.map((row) => row.tag_id).filter(Boolean)))
  const tagsById = new Map<string, CRMTagRecord>()

  for (let index = 0; index < tagIds.length; index += CRM_TAG_QUERY_CHUNK_SIZE) {
    const chunk = tagIds.slice(index, index + CRM_TAG_QUERY_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('crm_tags')
      .select('id, name, slug, color, description, created_by_user_id, created_by_name, created_at, updated_at')
      .is('deleted_at', null)
      .in('id', chunk)

    if (error) throw error
    for (const tag of (data ?? []) as CRMTagRecord[]) {
      tagsById.set(tag.id, tag)
    }
  }

  const result = new Map<string, CRMTagRecord[]>()
  for (const row of linkRows) {
    const tag = tagsById.get(row.tag_id)
    if (!tag) continue
    const existing = result.get(row.entity_id) ?? []
    existing.push(tag)
    result.set(row.entity_id, existing)
  }

  for (const [entityId, tags] of Array.from(result.entries())) {
    result.set(entityId, tags.sort((left, right) => left.name.localeCompare(right.name)))
  }

  return result
}

export async function syncLeadTagTextArray(supabase: ServiceClient, leadIds: string[]) {
  if (leadIds.length === 0) return

  const tagMap = await getTagsForEntities(supabase, 'lead', leadIds)
  const updates = leadIds.map((leadId) => ({
    id: leadId,
    tags: (tagMap.get(leadId) ?? []).map((tag) => tag.name),
  }))

  if (updates.length === 0) return

  const { error } = await supabase.from('crm_leads').upsert(updates, { onConflict: 'id' })
  if (error) throw error
}

export function matchesCrmTagFilters(
  assignedTagIds: Iterable<string>,
  input: {
    includeTagIds?: string[]
    excludeTagIds?: string[]
    mode?: CRMTagFilterMode
  },
) {
  const includeTagIds = input.includeTagIds ?? []
  const excludeTagIds = input.excludeTagIds ?? []
  const mode = input.mode ?? 'any'
  const assigned = new Set(assignedTagIds)

  const matchesInclude = includeTagIds.length === 0
    ? true
    : mode === 'all'
      ? includeTagIds.every((tagId) => assigned.has(tagId))
      : includeTagIds.some((tagId) => assigned.has(tagId))

  const matchesExclude = excludeTagIds.every((tagId) => !assigned.has(tagId))
  return matchesInclude && matchesExclude
}
