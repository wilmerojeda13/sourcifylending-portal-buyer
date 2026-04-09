import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  bulkArchiveLeads,
  bulkAssignLeadOwner,
  bulkAssignTags,
  bulkAssignTasks,
  bulkCompleteTasks,
  bulkDeleteLeads,
  bulkDeleteTasks,
  bulkDispositionLeads,
  bulkRemoveTags,
  bulkUpdateLeadStage,
  bulkUpdateTaskDueDate,
} from '@/lib/crm-bulk-actions'
import { CRM_CONTACT_TAG_ENTITY_TYPE } from '@/lib/crm-tags'

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

function jsonResult(result: {
  processedIds: string[]
  failedIds: string[]
  failedCount: number
  partial: boolean
  errors: string[]
}, message: string) {
  return NextResponse.json(
    {
      count: result.processedIds.length,
      message,
      ...result,
    },
    { status: result.partial ? 207 : 200 },
  )
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const action = body.action as string | undefined
  const module = body.module as string | undefined
  const ids = Array.isArray(body.ids) ? body.ids : []

  if (action === 'archive' && !module) {
    const filter = body.filter as string | undefined
    let query = admin.supabase
      .from('crm_leads')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('is_archived', false)

    if (filter === 'closed_lost') query = query.eq('stage', 'closed_lost')
    else if (filter === 'dnc') query = query.eq('do_not_call', true)
    else return NextResponse.json({ error: 'Unknown filter' }, { status: 400 })

    const { error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: '✓', message: 'archived — refresh to see updated count' })
  }

  if (action === 'delete_archived' && !module) {
    const { error } = await admin.supabase
      .from('crm_leads')
      .delete()
      .eq('is_archived', true)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: '✓', message: 'archived leads permanently deleted' })
  }

  if (!action || !module || ids.length === 0) {
    return NextResponse.json({ error: 'module, action, and ids are required.' }, { status: 400 })
  }

  try {
    if (module === 'leads') {
      if (action === 'delete') {
        return jsonResult(
          await bulkDeleteLeads(admin.supabase, {
            ids,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} lead selection processed for delete`,
        )
      }
      if (action === 'archive') {
        return jsonResult(
          await bulkArchiveLeads(admin.supabase, {
            ids,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} lead selection processed for archive`,
        )
      }
      if (action === 'update_stage') {
        if (!body.stage) {
          return NextResponse.json({ error: 'stage is required.' }, { status: 400 })
        }
        return jsonResult(
          await bulkUpdateLeadStage(admin.supabase, {
            ids,
            stage: body.stage,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} lead selection processed for stage change`,
        )
      }
      if (action === 'assign_owner') {
        return jsonResult(
          await bulkAssignLeadOwner(admin.supabase, {
            ids,
            ownerUserId: body.owner_user_id ?? null,
            ownerName: body.owner_name ?? null,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} lead selection processed for assignment`,
        )
      }
      if (action === 'add_tags') {
        return jsonResult(
          await bulkAssignTags(admin.supabase, {
            entityType: CRM_CONTACT_TAG_ENTITY_TYPE,
            entityIds: ids,
            tagIds: body.tag_ids ?? [],
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} lead selection processed for tag add`,
        )
      }
      if (action === 'remove_tags') {
        return jsonResult(
          await bulkRemoveTags(admin.supabase, {
            entityType: CRM_CONTACT_TAG_ENTITY_TYPE,
            entityIds: ids,
            tagIds: body.tag_ids ?? [],
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} lead selection processed for tag removal`,
        )
      }
      if (action === 'disposition') {
        if (!body.disposition_key) {
          return NextResponse.json({ error: 'disposition_key is required.' }, { status: 400 })
        }
        return jsonResult(
          await bulkDispositionLeads(admin.supabase, {
            ids,
            dispositionKey: body.disposition_key,
            note: body.note ?? null,
            followUpAt: body.follow_up_at ?? null,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} lead selection processed for disposition`,
        )
      }
    }

    if (module === 'tasks') {
      if (action === 'complete') {
        return jsonResult(
          await bulkCompleteTasks(admin.supabase, {
            ids,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} task selection processed for complete`,
        )
      }
      if (action === 'delete') {
        return jsonResult(
          await bulkDeleteTasks(admin.supabase, {
            ids,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} task selection processed for delete`,
        )
      }
      if (action === 'assign_owner') {
        return jsonResult(
          await bulkAssignTasks(admin.supabase, {
            ids,
            ownerUserId: body.owner_user_id ?? null,
            ownerName: body.owner_name ?? null,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} task selection processed for assignment`,
        )
      }
      if (action === 'change_due_date') {
        return jsonResult(
          await bulkUpdateTaskDueDate(admin.supabase, {
            ids,
            dueAt: body.due_at ?? null,
            actorUserId: admin.userId,
            actorName: admin.userName,
          }),
          `${ids.length} task selection processed for due date change`,
        )
      }
    }

    return NextResponse.json({ error: 'Unknown module/action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk action failed.' },
      { status: 500 },
    )
  }
}
