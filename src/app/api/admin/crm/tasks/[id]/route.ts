import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CRM_TASK_PRIORITIES, CRM_TASK_STATUSES, CRM_TASK_TYPES } from '@/lib/crm'

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
    userName: profile.full_name || profile.email || 'Admin',
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  if (body.priority && !CRM_TASK_PRIORITIES.includes(body.priority)) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
  }
  if (body.status && !CRM_TASK_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (body.task_type && !CRM_TASK_TYPES.includes(body.task_type)) {
    return NextResponse.json({ error: 'Invalid task type' }, { status: 400 })
  }

  const allowed = [
    'title',
    'description',
    'task_type',
    'priority',
    'status',
    'due_at',
    'owner_user_id',
    'owner_name',
    'pipeline_stage',
    'notes',
    'related_call_id',
    'lead_id',
  ]

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (body.status === 'Done') update.completed_at = new Date().toISOString()
  if (body.status && body.status !== 'Done') update.completed_at = null

  const { data, error } = await admin.supabase
    .from('crm_tasks')
    .update(update)
    .eq('id', id)
    .select('*, crm_leads(id, first_name, last_name, business_name, stage, lead_temperature)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data.lead_id && body.status === 'Done') {
    await admin.supabase
      .from('crm_activities')
      .insert({
        lead_id: data.lead_id,
        type: 'note',
        body: `Task completed: ${data.title}`,
        metadata: {
          task_id: data.id,
          priority: data.priority,
          task_type: data.task_type,
        },
        created_by: admin.userName,
      })
  }

  return NextResponse.json({ task: data })
}
