import { createServiceClient } from '@/lib/supabase/server'
import { getAccountContext, logAgentAction } from '@/lib/agent-context'
import { generateTasksForUser } from '@/lib/task-templates'
import type { ProgramId } from '@/types'

// ─── Roadmap Agent ────────────────────────────────────────────────────────────
// Runs when: underwriting completed, tasks updated, stage changes
// Responsibilities:
//   - generate or refresh the roadmap
//   - unlock tasks based on completions
//   - advance stage when milestone is hit
//   - explain what changed and why

export async function runRoadmapAgent(userId: string): Promise<{ actionsCount: number }> {
  const supabase = await createServiceClient()
  const ctx = await getAccountContext(userId)
  if (!ctx || ctx.isDemo) return { actionsCount: 0 }
  if (!ctx.assignedProgram || ctx.accountState !== 'active_member') return { actionsCount: 0 }

  let actionsCount = 0

  // 1. Generate roadmap if it doesn't exist yet
  if (!ctx.hasGeneratedRoadmap) {
    const taskRows = generateTasksForUser(userId, ctx.assignedProgram as ProgramId)
    const { error } = await supabase.from('tasks').insert(taskRows)

    if (!error) {
      await logAgentAction({
        userId,
        agentName:   'roadmap',
        actionType:  'roadmap_refreshed',
        title:       'Your personalized roadmap has been created',
        description: `${taskRows.length} tasks generated for ${programLabel(ctx.assignedProgram)}. Start with Task 1 and your AI advisor will guide you through each step.`,
        status:      'completed',
        autoFixed:   true,
        visibleToUser: true,
        metadata:    { task_count: taskRows.length, program: ctx.assignedProgram },
      })
      actionsCount++
    }
    return { actionsCount }
  }

  // 2. Check for stage advancement (Program B)
  if (ctx.assignedProgram === 'program_b') {
    const stageOrder = ['Foundation', 'Vendor Accounts', 'Store Credit', 'Fleet Credit', 'Cash Credit Readiness']
    const currentStageIdx = stageOrder.indexOf(ctx.currentStage ?? 'Foundation')

    if (currentStageIdx >= 0 && currentStageIdx < stageOrder.length - 1) {
      const currentStageTasks = ctx.tasks.filter(t => t.stage === ctx.currentStage)
      const allCompleted = currentStageTasks.length > 0 && currentStageTasks.every(t => t.status === 'completed')

      if (allCompleted) {
        const nextStage = stageOrder[currentStageIdx + 1]
        await supabase.from('profiles').update({ current_stage: nextStage }).eq('id', userId)

        await logAgentAction({
          userId,
          agentName:   'roadmap',
          actionType:  'stage_advanced',
          title:       `Stage unlocked: ${nextStage}`,
          description: `You completed all tasks in the ${ctx.currentStage} stage. Your roadmap has been updated — new tasks are now available in ${nextStage}.`,
          status:      'completed',
          autoFixed:   true,
          visibleToUser: true,
          metadata:    { previous_stage: ctx.currentStage, new_stage: nextStage },
        })
        actionsCount++
      }
    }
  }

  // 3. Check for stage advancement (Program A)
  if (ctx.assignedProgram === 'program_a') {
    const stageOrder = ['Credit Readiness', 'Application Strategy', 'Card Acquisition', 'Optimization']
    const currentStageIdx = stageOrder.indexOf(ctx.currentStage ?? 'Credit Readiness')

    if (currentStageIdx >= 0 && currentStageIdx < stageOrder.length - 1) {
      const currentStageTasks = ctx.tasks.filter(t => t.stage === ctx.currentStage)
      const allCompleted = currentStageTasks.length > 0 && currentStageTasks.every(t => t.status === 'completed')

      if (allCompleted) {
        const nextStage = stageOrder[currentStageIdx + 1]
        await supabase.from('profiles').update({ current_stage: nextStage }).eq('id', userId)

        await logAgentAction({
          userId,
          agentName:   'roadmap',
          actionType:  'stage_advanced',
          title:       `Stage unlocked: ${nextStage}`,
          description: `You completed all tasks in ${ctx.currentStage}. Your roadmap has advanced to ${nextStage}.`,
          status:      'completed',
          autoFixed:   true,
          visibleToUser: true,
          metadata:    { previous_stage: ctx.currentStage, new_stage: nextStage },
        })
        actionsCount++
      }
    }
  }

  // 4. Check for overall completion
  if (ctx.tasks.length > 0 && ctx.completedTaskCount === ctx.tasks.length) {
    const alreadyLogged = ctx.recentAgentActions.some(a =>
      a.agentName === 'roadmap' && a.title.includes('completed your full roadmap')
    )
    if (!alreadyLogged) {
      await logAgentAction({
        userId,
        agentName:   'roadmap',
        actionType:  'info',
        title:       `You completed your full roadmap`,
        description: `All ${ctx.tasks.length} tasks are done. Your AI advisor is reviewing next steps for your account.`,
        status:      'completed',
        visibleToUser: true,
        metadata:    { total_tasks: ctx.tasks.length },
      })
      actionsCount++
    }
  }

  // 5. Proactive tip when roadmap stalls (> 14 days, no completed task)
  if (ctx.hasGeneratedRoadmap && ctx.pendingTaskCount > 0) {
    const pendingTask = ctx.tasks.find(t => t.status === 'pending')
    const recentCompletion = ctx.tasks
      .filter(t => t.status === 'completed' && t.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0]

    const daysSinceActivity = recentCompletion
      ? (Date.now() - new Date(recentCompletion.completedAt!).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity

    if (daysSinceActivity > 14 && pendingTask) {
      const alreadyNudged = ctx.recentAgentActions.some(a =>
        a.agentName === 'roadmap' && a.title.includes('ready for your next task')
      )
      if (!alreadyNudged) {
        await logAgentAction({
          userId,
          agentName:   'roadmap',
          actionType:  'info',
          title:       `Your roadmap is ready for your next task`,
          description: `Pick up where you left off: "${pendingTask.title}". Tap Ask AI on the task for step-by-step guidance.`,
          status:      'completed',
          visibleToUser: true,
          metadata:    { pending_task: pendingTask.title, days_since_activity: Math.round(daysSinceActivity) },
        })
        actionsCount++
      }
    }
  }

  return { actionsCount }
}

function programLabel(program: string | null) {
  if (program === 'program_a') return 'Program A — 0% Intro APR Strategy'
  if (program === 'program_b') return 'Program B — Business Credit Builder'
  if (program === 'program_c') return 'Program C — Capital Monitoring'
  return 'your program'
}
