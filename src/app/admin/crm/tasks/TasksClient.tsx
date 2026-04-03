'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import CRMWorkspaceNav from '@/components/crm/CRMWorkspaceNav'
import { CRM_TASK_PRIORITIES, CRM_TASK_STATUSES, CRM_TASK_TYPES } from '@/lib/crm'
import toast from 'react-hot-toast'

interface TaskRecord {
  id: string
  lead_id: string | null
  title: string
  description: string | null
  task_type: string
  priority: string
  status: string
  due_at: string | null
  owner_name: string | null
  pipeline_stage: string | null
  crm_leads?: { id: string; first_name: string; last_name: string; business_name: string | null; stage: string }
}

const BUCKETS = [
  { value: 'today', label: 'Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'priority', label: 'Priority' },
  { value: 'completed', label: 'Completed' },
]

const EMPTY_FORM = {
  title: '',
  description: '',
  task_type: 'General',
  priority: 'Medium',
  status: 'To Do',
  due_at: '',
  notes: '',
}

export default function TasksClient() {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [bucket, setBucket] = useState('today')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function load(selectedBucket = bucket) {
    setLoading(true)
    const res = await fetch(`/api/admin/crm/tasks?bucket=${selectedBucket}&owner=me`, { cache: 'no-store' })
    const json = await res.json()
    setTasks(json.tasks ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load(bucket)
  }, [bucket])

  const grouped = useMemo(() => {
    return tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
      const key = task.crm_leads
        ? [task.crm_leads.first_name, task.crm_leads.last_name].filter(Boolean).join(' ')
        : 'Unlinked'
      if (!acc[key]) acc[key] = []
      acc[key].push(task)
      return acc
    }, {})
  }, [tasks])

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Task title is required')
      return
    }
    setSaving(true)
    const res = await fetch('/api/admin/crm/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        due_at: form.due_at || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      toast.error(json.error || 'Failed to create task')
      return
    }
    setForm(EMPTY_FORM)
    toast.success('Task created')
    load(bucket)
  }

  async function completeTask(id: string) {
    const res = await fetch(`/api/admin/crm/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Done' }),
    })
    if (!res.ok) {
      toast.error('Unable to complete task')
      return
    }
    toast.success('Task completed')
    load(bucket)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 dark:bg-gray-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <CRMWorkspaceNav />
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">Tasks</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">Follow-up manager</h1>
              <p className="mt-1 text-sm text-gray-500">Stay on callbacks, docs, emails, and closes without leaving the CRM.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {BUCKETS.map(item => (
                <button
                  key={item.value}
                  onClick={() => setBucket(item.value)}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                    bucket === item.value
                      ? 'bg-green-600 text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-green-700 dark:hover:text-green-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">My Tasks</p>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{tasks.length}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><CalendarClock size={14} /> Due today</p>
                <p className="mt-2 text-2xl font-bold text-blue-600">{tasks.filter(task => task.due_at && new Date(task.due_at).toDateString() === new Date().toDateString() && task.status !== 'Done').length}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><AlertTriangle size={14} /> High priority</p>
                <p className="mt-2 text-2xl font-bold text-red-600">{tasks.filter(task => ['High', 'Urgent'].includes(task.priority) && task.status !== 'Done').length}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              {loading && (
                <div className="flex items-center justify-center px-5 py-20">
                  <Loader2 size={22} className="animate-spin text-gray-400" />
                </div>
              )}
              {!loading && tasks.length === 0 && (
                <div className="px-5 py-20 text-center text-sm text-gray-500">No tasks in this view yet.</div>
              )}
              {!loading && tasks.map(task => (
                <div key={task.id} className="border-b border-gray-100 px-5 py-4 last:border-b-0 dark:border-gray-800">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white">{task.title}</p>
                      {task.description && <p className="mt-1 text-sm text-gray-500">{task.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{task.task_type}</span>
                        <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-300">{task.priority}</span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">{task.status}</span>
                        {task.pipeline_stage && <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">{task.pipeline_stage}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 text-sm text-gray-500 lg:items-end">
                      <span>{task.due_at ? new Date(task.due_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No due date'}</span>
                      {task.crm_leads && (
                        <Link href={`/admin/crm/${task.crm_leads.id}`} className="font-medium text-green-600 hover:text-green-700">
                          {[task.crm_leads.first_name, task.crm_leads.last_name].filter(Boolean).join(' ')}
                        </Link>
                      )}
                      {task.status !== 'Done' && (
                        <button onClick={() => completeTask(task.id)} className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">
                          <CheckCircle2 size={14} /> Mark complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tasks by lead</h2>
              <div className="mt-4 space-y-4">
                {Object.entries(grouped).map(([leadName, items]) => (
                  <div key={leadName} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-gray-900 dark:text-white">{leadName}</p>
                      <span className="text-sm text-gray-500">{items.length} task{items.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {items.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-gray-700 dark:text-gray-300">{item.title}</span>
                          <span className="text-gray-500">{item.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-green-600" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quick add task</h2>
            </div>
            <form onSubmit={createTask} className="mt-4 space-y-3">
              <input className="input-field" placeholder="Task title" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} />
              <textarea className="input-field min-h-[110px]" placeholder="Description" value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <select className="input-field" value={form.task_type} onChange={e => setForm(prev => ({ ...prev, task_type: e.target.value }))}>
                  {CRM_TASK_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="input-field" value={form.priority} onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}>
                  {CRM_TASK_PRIORITIES.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <select className="input-field" value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}>
                  {CRM_TASK_STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <input className="input-field" type="datetime-local" value={form.due_at} onChange={e => setForm(prev => ({ ...prev, due_at: e.target.value }))} />
              </div>
              <textarea className="input-field min-h-[90px]" placeholder="Internal notes" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} />
              <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create task
              </button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  )
}
