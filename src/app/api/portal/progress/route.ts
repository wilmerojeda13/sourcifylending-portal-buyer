import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'

export const dynamic = 'force-dynamic'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const [{ data: profile }, { data: tasks }, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', context.activeBusinessId).single(),
    supabase.from('tasks').select('*').eq('user_id', context.activeBusinessId).order('sort_order'),
    supabase.from('memberships').select('program_code').eq('user_id', context.activeBusinessId).eq('status', 'active'),
  ])

  const membershipPrograms = (membershipsResult?.data ?? []).map((membership: { program_code: string }) => membership.program_code).filter(Boolean)
  const activePrograms = membershipPrograms.length > 0 ? membershipPrograms : (profile?.assigned_program ? [profile.assigned_program] : [])
  const isActive = profile?.billing_status === 'active' || profile?.billing_status === 'trialing'

  return NextResponse.json({
    profile,
    tasks: tasks ?? [],
    active_programs: activePrograms,
    is_active: isActive,
  })
}

export async function PATCH(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { task_id } = await req.json()
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const { data: tasksBefore } = await supabase
    .from('tasks')
    .select('task_id,status,sort_order')
    .eq('user_id', context.activeBusinessId)
    .order('sort_order')

  await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: now })
    .eq('task_id', task_id)
    .eq('user_id', context.activeBusinessId)

  const taskIndex = (tasksBefore ?? []).findIndex((task) => task.task_id === task_id)
  if (taskIndex >= 0 && taskIndex < (tasksBefore?.length ?? 0) - 1) {
    const nextTask = tasksBefore?.[taskIndex + 1]
    if (nextTask?.status === 'locked') {
      await supabase
        .from('tasks')
        .update({ status: 'pending' })
        .eq('task_id', nextTask.task_id)
        .eq('user_id', context.activeBusinessId)
    }
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', context.activeBusinessId)
    .order('sort_order')

  return NextResponse.json({ tasks: tasks ?? [] })
}
