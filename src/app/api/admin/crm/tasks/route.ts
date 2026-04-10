import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CRM_TASK_PRIORITIES, CRM_TASK_STATUSES, CRM_TASK_TYPES } from '@/lib/crm'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

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
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')
  const type = searchParams.get('type')
  const leadId = searchParams.get('lead_id')
  const owner = searchParams.get('owner')
  const bucket = searchParams.get('bucket')

  let query = admin.supabase
    .from('crm_tasks')
    .select('*, crm_leads(id, first_name, last_name, business_name, stage, lead_temperature)')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (type) query = query.eq('task_type', type)
  if (leadId) query = query.eq('lead_id', leadId)
  if (owner === 'me') query = query.eq('owner_user_id', admin.userId)
  else if (owner) query = query.eq('owner_user_id', owner)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS })

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(startOfToday)
  endOfToday.setDate(endOfToday.getDate() + 1)

  const allTasks = data ?? []

  const counts = {
    today:     allTasks.filter(t => t.due_at && new Date(t.due_at) >= startOfToday && new Date(t.due_at) < endOfToday && t.status !== 'Done').length,
    overdue:   allTasks.filter(t => t.due_at && new Date(t.due_at) < startOfToday && t.status !== 'Done').length,
    upcoming:  allTasks.filter(t => t.due_at && new Date(t.due_at) >= endOfToday && t.status !== 'Done').length,
    priority:  allTasks.filter(t => ['High', 'Urgent'].includes(t.priority) && t.status !== 'Done').length,
    completed: allTasks.filter(t => t.status === 'Done').length,
  }

  let tasks = allTasks

  if (bucket === 'today') {
    tasks = tasks.filter(task => task.due_at && new Date(task.due_at) >= startOfToday && new Date(task.due_at) < endOfToday && task.status !== 'Done')
  } else if (bucket === 'overdue') {
    tasks = tasks.filter(task => task.due_at && new Date(task.due_at) < startOfToday && task.status !== 'Done')
  } else if (bucket === 'upcoming') {
    tasks = tasks.filter(task => task.due_at && new Date(task.due_at) >= endOfToday && task.status !== 'Done')
  } else if (bucket === 'priority') {
    tasks = tasks.filter(task => ['High', 'Urgent'].includes(task.priority) && task.status !== 'Done')
  } else if (bucket === 'completed') {
    tasks = tasks.filter(task => task.status === 'Done')
  }

  return NextResponse.json({ tasks, counts }, { headers: NO_STORE_HEADERS })
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
  }
  if (body.priority && !CRM_TASK_PRIORITIES.includes(body.priority)) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
  }
  if (body.status && !CRM_TASK_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (body.task_type && !CRM_TASK_TYPES.includes(body.task_type)) {
    return NextResponse.json({ error: 'Invalid task type' }, { status: 400 })
  }

  const { data, error } = await admin.supabase
    .from('crm_tasks')
    .insert({
      lead_id: body.lead_id || null,
      related_call_id: body.related_call_id || null,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      task_type: body.task_type || 'General',
      priority: body.priority || 'Medium',
      status: body.status || 'To Do',
      due_at: body.due_at || null,
      owner_user_id: body.owner_user_id || admin.userId,
      owner_name: body.owner_name || admin.userName,
      pipeline_stage: body.pipeline_stage || null,
      notes: body.notes?.trim() || null,
      created_by_user_id: admin.userId,
      completed_at: body.status === 'Done' ? new Date().toISOString() : null,
      created_source: body.created_source || 'manual',
      created_source_label: body.created_source_label || null,
      source_metadata: body.source_metadata || {},
    })
    .select('*, crm_leads(id, first_name, last_name, business_name, stage, lead_temperature)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.lead_id) {
    await admin.supabase
      .from('crm_activities')
      .insert({
        lead_id: body.lead_id,
        type: 'follow_up_set',
        body: `Task created: ${body.title.trim()}`,
        metadata: {
          task_id: data.id,
          due_at: body.due_at || null,
          priority: body.priority || 'Medium',
          task_type: body.task_type || 'General',
        },
        created_by: admin.userName,
      })
  }

  return NextResponse.json({ task: data }, { status: 201 })
}
