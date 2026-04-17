import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateTasksForUser } from '@/lib/task-templates'
import { getBusinessContext } from '@/lib/business-context'
import type { ProgramId } from '@/types'

export async function POST() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()

    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('assigned_program, member_status')
      .eq('id', context.activeBusinessId)
      .single()

    if (!profile?.assigned_program) {
      return NextResponse.json({ error: 'No program assigned' }, { status: 400 })
    }

    const assignedProgram = profile.assigned_program as ProgramId

    // Check if tasks exist AND match the assigned program
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('task_id, program')
      .eq('user_id', context.activeBusinessId)
      .limit(1)

    if (existingTasks && existingTasks.length > 0) {
      const existingProgram = existingTasks[0].program
      if (existingProgram === assignedProgram) {
        // Tasks already exist and match — nothing to do
        return NextResponse.json({ message: 'Tasks already exist', generated: false })
      }
      // Mismatch: delete all stale tasks so correct ones can be generated
      await supabase.from('tasks').delete().eq('user_id', context.activeBusinessId)
    }

    // Generate tasks from static program templates (guaranteed program-correct)
    const taskRows = generateTasksForUser(context.activeBusinessId, assignedProgram)

    const { data: insertedTasks, error: insertError } = await supabase
      .from('tasks')
      .insert(taskRows)
      .select()

    if (insertError) {
      console.error('[TaskGen] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save tasks' }, { status: 500 })
    }

    return NextResponse.json({ generated: true, tasks: insertedTasks })
  } catch (err) {
    console.error('[TaskGen] Error:', err)
    return NextResponse.json({ error: 'Failed to generate tasks' }, { status: 500 })
  }
}
