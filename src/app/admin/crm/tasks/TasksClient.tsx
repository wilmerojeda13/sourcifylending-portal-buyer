'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, CheckSquare, Square, CheckCircle2, MinusSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import CRMWorkspaceNav from '@/components/crm/CRMWorkspaceNav'
import { CRM_TASK_PRIORITIES, CRM_TASK_STATUSES, CRM_TASK_TYPES } from '@/lib/crm'
import toast from 'react-hot-toast'
import BulkSelectionBar from '@/components/admin/crm/BulkSelectionBar'
import { useBulkSelection } from '@/hooks/useBulkSelection'

interface OwnerOption {
  id: string
  name: string
}

interface TaskRecord {
  id: string
  lead_id: string | null
  title: string
  description: string | null
  task_type: string
  priority: string
  status: string
  due_at: string | null
  owner_user_id?: string | null
  owner_name: string | null
  pipeline_stage: string | null
  created_source?: string
  created_source_label?: string | null
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
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [bulkDueAt, setBulkDueAt] = useState('')
  const [bulkOwnerId, setBulkOwnerId] = useState('')

  async function load(selectedBucket = bucket) {
    setLoading(true)
    const params = new URLSearchParams({ bucket: selectedBucket, owner: 'me' })
    const res = await fetch(`/api/admin/crm/tasks?${params.toString()}`, { cache: 'no-store' })
    const json = await res.json()
    setTasks(json.tasks ?? [])
    setCounts(json.counts ?? {})
    setLoading(false)
  }

  useEffect(() => {
    load(bucket)
  }, [bucket])

  useEffect(() => {
    let active = true
    fetch('/api/admin/crm/owners', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (active) setOwners(json.owners ?? [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

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

  const visibleTaskIds = tasks.map((task) => task.id)
  const {
    selectedIds,
    selectedCount,
    allVisibleSelected,
    toggleOne,
    toggleVisible,
    clearSelection,
    selectAllFiltered,
    removeIds,
  } = useBulkSelection(visibleTaskIds, visibleTaskIds)

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
        created_source: 'manual',
        created_source_label: 'Manual task',
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

  async function runBulkAction(action: string, extra: Record<string, unknown> = {}) {
    if (selectedCount === 0) return
    const ids = Array.from(selectedIds)
    const res = await fetch('/api/admin/crm/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: 'tasks',
        action,
        ids,
        ...extra,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error || 'Bulk action failed')
      return false
    }
    if (action === 'complete') {
      setTasks((current) => current.map((task) => ids.includes(task.id) ? { ...task, status: 'Done' } : task))
    }
    if (action === 'delete') {
      setTasks((current) => current.filter((task) => !ids.includes(task.id)))
    }
    if (action === 'change_due_date') {
      setTasks((current) => current.map((task) => ids.includes(task.id) ? { ...task, due_at: bulkDueAt || null } : task))
    }
    if (action === 'assign_owner') {
      const nextOwner = owners.find((owner) => owner.id === bulkOwnerId) ?? null
      setTasks((current) => current.map((task) => ids.includes(task.id)
        ? { ...task, owner_user_id: nextOwner?.id ?? null, owner_name: nextOwner?.name ?? null }
        : task))
    }
    toast.success(json.message || 'Bulk action complete')
    removeIds(ids)
    return true
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 dark:bg-gray-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6">
        <CRMWorkspaceNav />
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <section className="space-y-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-green-600">Tasks</p>
              <h1 className="mt-0.5 text-xl font-bold text-gray-900 dark:text-white">CRM task queue</h1>
              <p className="mt-0.5 text-sm text-gray-500">Callbacks, demos, follow-ups, and priorities all in one place.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {BUCKETS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setBucket(item.value)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                    bucket === item.value
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:text-green-300'
                  )}
                >
                  {item.label}
                  {counts[item.value] != null && counts[item.value]! > 0 && (
                    <span className={cn(
                      'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                      bucket === item.value ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    )}>{counts[item.value]}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {BUCKETS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setBucket(item.value)}
                  className={cn(
                    'rounded-xl border p-3 text-center shadow-sm transition-colors',
                    bucket === item.value
                      ? 'border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950/20'
                      : 'border-gray-200 bg-white hover:border-green-200 dark:border-gray-800 dark:bg-gray-900'
                  )}
                >
                  <p className={cn(
                    'text-xl font-bold',
                    bucket === item.value ? 'text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-white'
                  )}>{counts[item.value] ?? 0}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-gray-500">{item.label}</p>
                </button>
              ))}
            </div>

            <BulkSelectionBar selectedCount={selectedCount} onSelectAll={selectAllFiltered} onClear={clearSelection}>
              <select value={bulkOwnerId} onChange={(event) => setBulkOwnerId(event.target.value)} className="input-field">
                <option value="">Select owner</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>{owner.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => void runBulkAction('complete')} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Complete
              </button>
              <button
                type="button"
                onClick={() => bulkOwnerId ? void runBulkAction('assign_owner', {
                  owner_user_id: bulkOwnerId,
                  owner_name: owners.find((owner) => owner.id === bulkOwnerId)?.name ?? null,
                }) : toast.error('Select an owner first')}
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Reassign
              </button>
              <input
                type="datetime-local"
                value={bulkDueAt}
                onChange={(event) => setBulkDueAt(event.target.value)}
                className="input-field"
              />
              <button
                type="button"
                onClick={() => bulkDueAt ? void runBulkAction('change_due_date', { due_at: bulkDueAt }) : toast.error('Select a due date first')}
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Change due
              </button>
              <button type="button" onClick={() => void runBulkAction('delete')} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">
                Delete
              </button>
            </BulkSelectionBar>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              {/* Table header */}
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
                <button
                  type="button"
                  onClick={toggleVisible}
                  className="flex-shrink-0 text-gray-300 hover:text-green-600 transition-colors"
                  title={allVisibleSelected ? 'Deselect all' : 'Select all'}
                >
                  {allVisibleSelected
                    ? <CheckSquare size={15} className="text-green-600" />
                    : selectedCount > 0
                      ? <MinusSquare size={15} className="text-green-400" />
                      : <Square size={15} />}
                </button>
                <span className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {selectedCount > 0 ? `${selectedCount} selected` : 'Task'}
                </span>
                <span className="hidden sm:block w-20 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Owner</span>
                <span className="w-20 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Due</span>
                <span className="w-[18px]"/>
              </div>
              {loading && (
                <div className="flex items-center justify-center px-5 py-16">
                  <Loader2 size={22} className="animate-spin text-gray-400" />
                </div>
              )}
              {!loading && tasks.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-gray-500">
                  No tasks in this bucket.
                </div>
              )}
              {!loading && tasks.map((task) => {
                const isOverdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== 'Done'
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800 hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors"
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleOne(task.id)}
                      className="flex-shrink-0 text-gray-300 hover:text-green-600 transition-colors"
                    >
                      {selectedIds.has(task.id)
                        ? <CheckSquare size={15} className="text-green-600" />
                        : <Square size={15} />}
                    </button>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          'text-sm font-semibold text-gray-900 dark:text-white',
                          task.status === 'Done' && 'line-through text-gray-400 dark:text-gray-600'
                        )}>
                          {task.title}
                        </span>
                        <span className={cn(
                          'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          task.priority === 'Urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          task.priority === 'High'   ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        )}>{task.priority}</span>
                        <span className="flex-shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                          {task.task_type}
                        </span>
                      </div>
                      {task.crm_leads && (
                        <Link
                          href={`/admin/crm/${task.crm_leads.id}`}
                          className="mt-0.5 flex items-center gap-1 text-xs text-green-600 hover:underline"
                        >
                          {[task.crm_leads.first_name, task.crm_leads.last_name].filter(Boolean).join(' ')}
                          <span className="text-gray-400">· {task.crm_leads.stage}</span>
                        </Link>
                      )}
                    </div>

                    {/* Owner */}
                    <span className="hidden sm:block flex-shrink-0 w-20 truncate text-right text-xs text-gray-400">
                      {task.owner_name?.split(' ')[0] ?? '—'}
                    </span>

                    {/* Due date */}
                    <div className="flex-shrink-0 w-20 text-right">
                      <span className={cn(
                        'text-xs whitespace-nowrap',
                        isOverdue ? 'font-semibold text-red-500' : 'text-gray-400'
                      )}>
                        {task.due_at
                          ? new Date(task.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                      </span>
                    </div>

                    {/* Complete toggle */}
                    {task.status !== 'Done' ? (
                      <button
                        onClick={() => completeTask(task.id)}
                        title="Mark complete"
                        className="flex-shrink-0 text-gray-200 hover:text-green-600 transition-colors"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                    ) : (
                      <CheckCircle2 size={18} className="flex-shrink-0 text-green-400" />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Quick add task</h2>
              <div className="mt-3 space-y-2.5">
                <form onSubmit={createTask}>
                  <input className="input-field" placeholder="Task title" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
                  <textarea className="input-field min-h-[80px] resize-y text-sm" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Optional description..." />
                  <div className="grid gap-2.5 md:grid-cols-2">
                    <select className="input-field" value={form.task_type} onChange={(e) => setForm((prev) => ({ ...prev, task_type: e.target.value }))}>
                      {CRM_TASK_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select className="input-field" value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}>
                      {CRM_TASK_PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2.5 md:grid-cols-2">
                    <select className="input-field" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                      {CRM_TASK_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <input className="input-field" type="datetime-local" value={form.due_at} onChange={(e) => setForm((prev) => ({ ...prev, due_at: e.target.value }))} />
                  </div>
                  <textarea className="input-field min-h-[80px] resize-y text-sm" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional notes..." />
                  <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    Create task
                  </button>
                </form>
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-green-600" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Tasks by lead</h2>
            </div>
            <div className="mt-3 space-y-2.5">
              {Object.entries(grouped).map(([leadName, items]) => (
                <div key={leadName} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{leadName}</p>
                    <span className="text-sm text-gray-500">{items.length} task{items.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-1.5 dark:border-gray-800">
                        <span className="text-gray-700 dark:text-gray-300">{item.title}</span>
                        <span className="text-gray-500">{item.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
