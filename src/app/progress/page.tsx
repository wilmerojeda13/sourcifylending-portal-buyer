'use client'

import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/Badge'
import { getProgramShortLabel, formatDate } from '@/lib/utils'
import {
  CheckCircle,
  Clock,
  Lock,
  AlertTriangle,
  FileText,
  List,
  LayoutGrid,
  Sparkles,
  Bot,
  X,
} from 'lucide-react'
import type { Task, UserProfile } from '@/types'
import toast from 'react-hot-toast'
import { useBusinessContext } from '@/lib/use-business-context'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'

type ViewMode = 'list' | 'board'

export default function ProgressPageWrapper() {
  return (
    <Suspense
      fallback={
        <PortalLayout>
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        </PortalLayout>
      }
    >
      <ProgressPage />
    </Suspense>
  )
}

function ProgressPage() {
  const { activeBusinessId } = useBusinessContext()
  const { locale } = useLanguage()
  const text = useCallback((key: string, fallback: string) => t(locale, key, fallback), [locale])
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
        toast.error(data.error || text('progress.failedLoad', 'Failed to load progress'))
        setLoading(false)
        return
      }

      const p = data.profile as UserProfile | null
      const nextTasks = (data.tasks ?? []) as Task[]
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
      setTasks(nextTasks)
      setIsActive(Boolean(data.is_active))
      setActivePrograms(data.active_programs ?? [])
      setLoading(false)
    }

    init()
  }, [activeBusinessId, router, text])

  const generateRoadmap = async () => {
    setGenerating(true)
    setGenerateError('')
    try {
      const res = await fetch('/api/tasks/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setGenerateError(data.error || text('progress.genericError', 'Something went wrong. Please try again.'))
      } else if (data.tasks) {
        setTasks(data.tasks)
        setShowWelcomeBanner(true)
      }
    } catch {
      setGenerateError(text('progress.genericError', 'Something went wrong. Please try again.'))
    }
    setGenerating(false)
  }

  const markComplete = async (taskId: string) => {
    if (!isActive) {
      toast.error(text('progress.reactivateTasks', 'Reactivate subscription to complete tasks'))
      return
    }

    const task = tasks.find((entry) => entry.task_id === taskId)
    const res = await fetch('/api/portal/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    })
    const data = await res.json()

    if (!res.ok) {
      toast.error(data.error || text('progress.failedUpdateTask', 'Failed to update task'))
      return
    }

    const updatedTasks = data.tasks || []
    setTasks(updatedTasks)
    toast.success(text('progress.taskCompleted', 'Task marked complete!'))

    const completedCount = updatedTasks.filter((entry: Task) => entry.status === 'completed').length
    const totalCount = updatedTasks.length
    const completedStage = task?.stage
    const stageTasksDone = completedStage
      ? updatedTasks.filter((entry: Task) => entry.stage === completedStage && entry.status === 'completed').length
      : 0
    const stageTasksTotal = completedStage
      ? updatedTasks.filter((entry: Task) => entry.stage === completedStage).length
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

  const completed = tasks.filter((task) => task.status === 'completed').length
  const total = tasks.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const stages = Array.from(new Set(tasks.map((task) => task.stage)))

  if (loading) {
    return (
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      </PortalLayout>
    )
  }

  const nextPendingTask = tasks.find((task) => task.status === 'pending')?.title || tasks[0]?.title

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
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="page-title">{text('progress.title', 'Progress & Tasks')}</h1>
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'list'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <List size={15} /> {text('progress.list', 'List')}
            </button>
            <button
              onClick={() => setView('board')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'board'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <LayoutGrid size={15} /> {text('progress.board', 'Board')}
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {profile?.assigned_program
            ? getProgramShortLabel(profile.assigned_program)
            : text('progress.noProgramAssigned', 'No program assigned')}
          {profile?.current_stage && ` · ${text('progress.stageLabel', 'Stage')}: ${profile.current_stage}`}
        </p>
      </div>

      <div className="card mb-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900 dark:text-white">
              {text('progress.overallCompletion', 'Overall Completion')}
            </p>
            <p className="text-sm text-gray-400">
              {completed} of {total} {text('progress.tasksDone', 'tasks done')}
            </p>
          </div>
          <span className="text-3xl font-bold text-green-600">{progress}%</span>
        </div>
        <ProgressBar value={progress} size="lg" color="green" />

        <div className="mt-4 flex flex-wrap gap-2">
          {stages.map((stage) => {
            const stageTasks = tasks.filter((task) => task.stage === stage)
            const stageCompleted = stageTasks.filter((task) => task.status === 'completed').length
            const allDone = stageCompleted === stageTasks.length
            return (
              <div
                key={stage}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  allDone
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {allDone && <CheckCircle size={12} />}
                {stage} ({stageCompleted}/{stageTasks.length})
              </div>
            )
          })}
        </div>
      </div>

      {showWelcomeBanner && tasks.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-4 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-600">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="mb-0.5 text-sm font-bold text-green-900 dark:text-green-300">
              {text('progress.yourRoadmapReady', 'Your roadmap is ready!')}
            </p>
            <p className="text-xs leading-relaxed text-green-700 dark:text-green-400">
              {text('progress.startWithTask', 'Start with Task 1 and work through each item in order.')} {' '}
              <strong>
                {text('progress.task', 'Task')} 1: {nextPendingTask}
              </strong>
              . <strong>{text('progress.askAi', 'Ask AI')}</strong>.
            </p>
          </div>
          <button onClick={() => setShowWelcomeBanner(false)} className="shrink-0 text-green-400 hover:text-green-600">
            <X size={16} />
          </button>
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-3">
          {stages.map((stage) => (
            <div key={stage}>
              <h3 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{stage}</h3>
              <div className="space-y-2">
                {tasks
                  .filter((task) => task.stage === stage)
                  .map((task) => (
                    <TaskRow
                      key={task.task_id}
                      task={task}
                      onComplete={markComplete}
                      isActive={isActive}
                      highlighted={highlightedTaskId === task.task_id}
                      setRef={(el) => {
                        taskRefs.current[task.task_id] = el
                      }}
                      onAskAI={(title) => {
                        const prompt = text(
                          'progress.aiTaskPrompt',
                          'Walk me through this task step by step: "{{title}}"'
                        ).replace('{{title}}', title)
                        router.push(`/agent?prompt=${encodeURIComponent(prompt)}`)
                      }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <div key={stage} className="min-w-[260px] max-w-[280px] rounded-2xl bg-gray-100 p-3 dark:bg-gray-800">
              <h3 className="mb-3 px-1 text-sm font-bold text-gray-700 dark:text-gray-200">{stage}</h3>
              <div className="space-y-2">
                {tasks
                  .filter((task) => task.stage === stage)
                  .map((task) => (
                    <TaskCard key={task.task_id} task={task} onComplete={markComplete} isActive={isActive} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {total === 0 && (
        <div className="card py-12 text-center">
          {isActive ? (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <Sparkles size={22} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">
                {text('progress.readyToBuild', 'Ready to build your roadmap?')}
              </p>
              <p className="mx-auto mb-4 max-w-sm text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                {text('progress.aiAdvisor', 'Our AI advisor will generate a personalized path for your current business stage.')}
              </p>
              {generateError && (
                <p className="mx-auto mb-3 max-w-xs rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  {generateError}
                </p>
              )}
              <button
                onClick={generateRoadmap}
                disabled={generating}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs"
              >
                {generating ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {text('progress.generating', 'Generating your roadmap...')}
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    {text('progress.generateRoadmap', 'Generate My Roadmap')}
                  </>
                )}
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-400">
              {text('progress.noTasks', 'No tasks assigned yet.')} {text('progress.subscribeBegin', 'Subscribe to begin your program.')}
            </p>
          )}
        </div>
      )}
    </PortalLayout>
  )
}

function TaskRow({
  task,
  onComplete,
  isActive,
  highlighted = false,
  setRef,
  onAskAI,
}: {
  task: Task
  onComplete: (id: string) => void
  isActive: boolean
  highlighted?: boolean
  setRef?: (el: HTMLDivElement | null) => void
  onAskAI?: (title: string) => void
}) {
  const { locale } = useLanguage()
  const text = (key: string, fallback: string) => t(locale, key, fallback)
  const statusIcon = {
    completed: <CheckCircle size={18} className="text-green-500" />,
    pending: <Clock size={18} className="text-green-500" />,
    locked: <Lock size={18} className="text-gray-300" />,
    overdue: <AlertTriangle size={18} className="text-red-500" />,
  }[task.status]

  return (
    <div
      ref={setRef}
      className={`card flex items-start gap-3 transition-all duration-700 ${
        task.status === 'locked' ? 'opacity-60' : ''
      } ${
        highlighted ? 'bg-green-50 shadow-lg ring-2 ring-green-500 ring-offset-1 dark:bg-green-900/20' : ''
      }`}
    >
      <div className="mt-0.5">{statusIcon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-2">
          <p
            className={`text-sm font-semibold ${
              task.status === 'completed'
                ? 'line-through text-gray-400 dark:text-gray-500'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {task.title}
          </p>
          <StatusBadge status={task.status} />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{task.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {task.due_date && (
            <span className="text-xs text-gray-400">
              {text('progress.due', 'Due')}: {formatDate(task.due_date)}
            </span>
          )}
          {task.requires_document && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <FileText size={11} /> {text('progress.docRequired', 'Doc required')}
            </span>
          )}
          {task.completed_at && (
            <span className="text-xs text-green-600">
              {text('progress.completedOn', 'Completed')} {formatDate(task.completed_at)}
            </span>
          )}
        </div>
      </div>
      {task.status === 'pending' && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            onClick={() => onComplete(task.task_id)}
            disabled={!isActive}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {text('progress.complete', 'Complete')}
          </button>
          <button
            onClick={() => onAskAI?.(task.title)}
            className="flex items-center justify-center gap-1 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 dark:border-green-700 dark:bg-gray-700 dark:text-green-400 dark:hover:bg-green-900/30"
          >
            <Bot size={11} /> {text('progress.askAi', 'Ask AI')}
          </button>
        </div>
      )}
    </div>
  )
}

function TaskCard({ task, onComplete, isActive }: { task: Task; onComplete: (id: string) => void; isActive: boolean }) {
  const { locale } = useLanguage()
  const text = (key: string, fallback: string) => t(locale, key, fallback)

  return (
    <div
      className={`rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${
        task.status === 'locked' ? 'opacity-50' : ''
      }`}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p
          className={`text-xs font-semibold leading-snug ${
            task.status === 'completed'
              ? 'line-through text-gray-400 dark:text-gray-500'
              : 'text-gray-900 dark:text-white'
          }`}
        >
          {task.title}
        </p>
        <StatusBadge status={task.status} />
      </div>
      <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-gray-400 dark:text-gray-500">{task.description}</p>
      {task.requires_document && (
        <span className="mb-2 flex items-center gap-1 text-xs text-amber-600">
          <FileText size={11} /> {text('progress.docRequired', 'Doc required')}
        </span>
      )}
      {task.status === 'pending' && (
        <button
          onClick={() => onComplete(task.task_id)}
          disabled={!isActive}
          className="w-full rounded-lg bg-green-600 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-40"
        >
          {text('progress.markComplete', 'Mark Complete')}
        </button>
      )}
    </div>
  )
}
