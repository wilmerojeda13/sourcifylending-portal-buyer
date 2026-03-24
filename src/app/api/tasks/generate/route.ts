import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateTasksForUser } from '@/lib/task-templates'
import type { ProgramId } from '@/types'

export async function POST() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()

    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('assigned_program, account_state')
      .eq('id', user.id)
      .single()

    if (!profile?.assigned_program) {
      return NextResponse.json({ error: 'No program assigned' }, { status: 400 })
    }

    // Check if tasks already exist — don't regenerate if they do
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('task_id')
      .eq('user_id', user.id)
      .limit(1)

    if (existingTasks && existingTasks.length > 0) {
      return NextResponse.json({ message: 'Tasks already exist', generated: false })
    }

    // Generate tasks from static program templates (guaranteed program-correct)
    const taskRows = generateTasksForUser(user.id, profile.assigned_program as ProgramId)

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
