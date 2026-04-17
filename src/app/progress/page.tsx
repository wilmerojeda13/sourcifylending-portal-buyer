'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/Badge'
import { getProgramShortLabel, formatDate } from '@/lib/utils'
import { CheckCircle, Clock, Lock, AlertTriangle, FileText, List, LayoutGrid, Sparkles, Bot, X } from 'lucide-react'
import type { Task, UserProfile } from '@/types'
import toast from 'react-hot-toast'
import { useBusinessContext } from '@/lib/use-business-context'

type ViewMode = 'list' | 'board'

// ─── Suspense wrapper — required because useSearchParams causes CSR bailout ───
export default function ProgressPageWrapper() {
  return (
    <Suspense fallback={
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-2xl" />)}
        </div>
      </PortalLayout>
    }>
      <ProgressPage />
    </Suspense>
  )
}

function ProgressPage() {
  const { activeBusinessId } = useBusinessContext()
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetTaskId = searchParams.get('taskId')
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('list')
  const [isActive, setIsActive] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false)
  const [activePrograms, setActivePrograms] = useState<string[]>([])

  // Auto-scroll to target task once tasks are loaded
  useEffect(() => {
    if (!targetTaskId || tasks.length === 0) return
    const ref = taskRefs.current[targetTaskId]
    if (ref) {
      setTimeout(() => {
        ref.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedTaskId(targetTaskId)
        setTimeout(() => setHighlightedTaskId(null), 3000)
      }, 300)
    }
  }, [targetTaskId, tasks])

  useEffect(() => {
    const init = async () => {
      if (!activeBusinessId) return
      const res = await fetch('/api/portal/progress', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to load progress')
        setLoading(false)
        return
      }
      const p = data.profile as UserProfile | null
      const t = (data.tasks ?? []) as Task[]
      // ── Underwriting gate — redirect if never reviewed or review expired ────
      const uwNextDue = p?.underwriting_next_due_at
      const needsUW =
        !p?.is_demo &&
        p?.member_status === 'active_member' &&
        (p?.assigned_program === 'program_a' || p?.assigned_program === 'program_b') &&
        (!uwNextDue || new Date(uwNextDue) < new Date())
      if (needsUW) {
        router.replace('/underwriting')
        return
      }

      setProfile(p)
      setTasks(t || [])
      setIsActive(Boolean(data.is_active))
      setActivePrograms(data.active_programs ?? [])
      setLoading(false)
    }
    init()
  }, [activeBusinessId]) // eslint-disable-line react-hooks/exhaustive-deps

  const generateRoadmap = async () => {
    setGenerating(true)
    setGenerateError('')
    try {
      const res = await fetch('/api/tasks/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setGenerateError(data.error || 'Something went wrong. Please try again.')
      } else if (data.tasks) {
        setTasks(data.tasks)
        setShowWelcomeBanner(true)
      }
    } catch {
      setGenerateError('Something went wrong. Please try again.')
    }
    setGenerating(false)
  }

  const markComplete = async (taskId: string) => {
    if (!isActive) { toast.error('Reactivate subscription to complete tasks'); return }
    const task = tasks.find((t) => t.task_id === taskId)
    const res = await fetch('/api/portal/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Failed to update task'); return }

    const updatedTasks = data.tasks || []
    setTasks(updatedTasks)
    toast.success('Task marked complete!')

    // Notify admin (fire-and-forget)
    const completedCount = updatedTasks.filter((t: any) => t.status === 'completed').length
    const totalCount = updatedTasks.length
    const completedStage = task?.stage
    const stageTasksDone = completedStage
      ? updatedTasks.filter((t: any) => t.stage === completedStage && t.status === 'completed').length
      : 0
    const stageTasksTotal = completedStage
      ? updatedTasks.filter((t: any) => t.stage === completedStage).length
      : 0
    const isStageComplete = completedStage && stageTasksDone === stageTasksTotal && stageTasksTotal > 0

    if (isStageComplete) {
      fetch('/api/admin/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'stage_complete', stage: completedStage, completedCount, totalCount }),
      }).catch(() => {})
    } else {
      fetch('/api/admin/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'task_complete', taskTitle: task?.title, taskId, completedCount, totalCount }),
      }).catch(() => {})
    }
  }

  const completed = tasks.filter((t) => t.status === 'completed').length
  const total = tasks.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  const stages = Array.from(new Set(tasks.map((t) => t.stage)))

  if (loading) {
    return (
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          ))}
        </div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program as string | null)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      allPrograms={activePrograms}
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="page-title">Progress & Tasks</h1>
          <div className="flex border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${
                view === 'list' ? 'bg-green-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <List size={15} /> List
            </button>
            <button
              onClick={() => setView('board')}
              className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${
                view === 'board' ? 'bg-green-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <LayoutGrid size={15} /> Board
            </button>
          </div>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          {profile?.assigned_program ? getProgramShortLabel(profile.assigned_program) : 'No program assigned'}
          {profile?.current_stage && ` · Stage: ${profile.current_stage}`}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-bold text-gray-900 dark:text-white">Overall Completion</p>
            <p className="text-sm text-gray-400">{completed} of {total} tasks done</p>
          </div>
          <span className="text-3xl font-bold text-green-600">{progress}%</span>
        </div>
        <ProgressBar value={progress} size="lg" color={progress === 100 ? 'green' : 'green'} />

        {/* Stage chips */}
        <div className="flex flex-wrap gap-2 mt-4">
          {stages.map((stage) => {
            const stageTasks = tasks.filter((t) => t.stage === stage)
            const stageCompleted = stageTasks.filter((t) => t.status === 'completed').length
            const allDone = stageCompleted === stageTasks.length
            return (
              <div key={stage} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                allDone ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}>
                {allDone && <CheckCircle size={12} />}
                {stage} ({stageCompleted}/{stageTasks.length})
              </div>
            )
          })}
        </div>
      </div>

      {/* Welcome banner after roadmap generation */}
      {showWelcomeBanner && tasks.length > 0 && (
        <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl px-4 py-4 flex items-start gap-3">
          <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-green-900 dark:text-green-300 mb-0.5">Your roadmap is ready!</p>
            <p className="text-xs text-green-700 dark:text-green-400 leading-relaxed">
              Start with <strong>Task 1: {tasks.find(t => t.status === 'pending')?.title || tasks[0]?.title}</strong>. Tap <strong>Ask AI</strong> on any task and your advisor will walk you through it step by step.
            </p>
          </div>
          <button onClick={() => setShowWelcomeBanner(false)} className="text-green-400 hover:text-green-600 shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="space-y-3">
          {stages.map((stage) => (
            <div key={stage}>
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">{stage}</h3>
              <div className="space-y-2">
                {tasks.filter((t) => t.stage === stage).map((task) => (
                  <TaskRow
                    key={task.task_id}
                    task={task}
                    onComplete={markComplete}
                    isActive={isActive}
                    highlighted={highlightedTaskId === task.task_id}
                    setRef={(el) => { taskRefs.current[task.task_id] = el }}
                    onAskAI={(title) => router.push(`/agent?prompt=${encodeURIComponent(`Walk me through this task step by step: "${title}"`)}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Board View */}
      {view === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <div key={stage} className="min-w-[260px] max-w-[280px] bg-gray-100 dark:bg-gray-800 rounded-2xl p-3">
              <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3 px-1">{stage}</h3>
              <div className="space-y-2">
                {tasks.filter((t) => t.stage === stage).map((task) => (
                  <TaskCard key={task.task_id} task={task} onComplete={markComplete} isActive={isActive} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {total === 0 && (
        <div className="card text-center py-12">
          {isActive ? (
            <>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                <Sparkles size={22} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-gray-800 dark:text-gray-200 font-semibold text-sm mb-1">Ready to build your roadmap?</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs leading-relaxed max-w-sm mx-auto mb-4">
                Our AI advisor will generate a personalized task list based on your profile and program.
              </p>
              {generateError && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2 mb-3 max-w-xs mx-auto">{generateError}</p>
              )}
              <button
                onClick={generateRoadmap}
                disabled={generating}
                className="btn-primary text-xs px-5 py-2.5 inline-flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating your roadmap…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Generate My Roadmap
                  </>
                )}
              </button>
            </>
          ) : (
            <p className="text-gray-400 text-sm">No tasks assigned yet. Subscribe to begin your program.</p>
          )}
        </div>
      )}
    </PortalLayout>
  )
}

function TaskRow({
  task, onComplete, isActive, highlighted = false, setRef, onAskAI
}: {
  task: Task
  onComplete: (id: string) => void
  isActive: boolean
  highlighted?: boolean
  setRef?: (el: HTMLDivElement | null) => void
  onAskAI?: (title: string) => void
}) {
  const statusIcon = {
    completed: <CheckCircle size={18} className="text-green-500" />,
    pending: <Clock size={18} className="text-green-500" />,
    locked: <Lock size={18} className="text-gray-300" />,
    overdue: <AlertTriangle size={18} className="text-red-500" />,
  }[task.status]

  return (
    <div
      ref={setRef}
      className={`card flex items-start gap-3 transition-all duration-700 ${task.status === 'locked' ? 'opacity-60' : ''} ${highlighted ? 'ring-2 ring-green-500 ring-offset-1 shadow-lg bg-green-50 dark:bg-green-900/20' : ''}`}
    >
      <div className="mt-0.5">{statusIcon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className={`text-sm font-semibold ${task.status === 'completed' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </p>
          <StatusBadge status={task.status} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{task.description}</p>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {task.due_date && (
            <span className="text-xs text-gray-400">Due: {formatDate(task.due_date)}</span>
          )}
          {task.requires_document && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <FileText size={11} /> Doc required
            </span>
          )}
          {task.completed_at && (
            <span className="text-xs text-green-600">Completed {formatDate(task.completed_at)}</span>
          )}
        </div>
      </div>
      {task.status === 'pending' && (
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => onComplete(task.task_id)}
            disabled={!isActive}
            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Complete
          </button>
          <button
            onClick={() => onAskAI?.(task.title)}
            className="text-xs bg-white dark:bg-gray-700 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors font-medium flex items-center gap-1 justify-center"
          >
            <Bot size={11} /> Ask AI
          </button>
        </div>
      )}
    </div>
  )
}

function TaskCard({ task, onComplete, isActive }: { task: Task; onComplete: (id: string) => void; isActive: boolean }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 ${task.status === 'locked' ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className={`text-xs font-semibold leading-snug ${task.status === 'completed' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
          {task.title}
        </p>
        <StatusBadge status={task.status} />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed mb-2 line-clamp-2">{task.description}</p>
      {task.requires_document && (
        <span className="flex items-center gap-1 text-xs text-amber-600 mb-2">
          <FileText size={11} /> Doc required
        </span>
      )}
      {task.status === 'pending' && (
        <button
          onClick={() => onComplete(task.task_id)}
          disabled={!isActive}
          className="w-full text-xs bg-green-600 text-white py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors font-medium"
        >
          Mark Complete
        </button>
      )}
    </div>
  )
}
