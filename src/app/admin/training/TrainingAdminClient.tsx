'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Eye, EyeOff, Save, X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TrainingVideo {
  id: string
  title: string
  description: string
  duration: string
  category: string
  program: 'all' | 'program_a' | 'program_b'
  embed_url: string
  is_published: boolean
  sort_order: number
}

const CATEGORIES = [
  'Getting Started',
  'Program A — Credit Optimization',
  'Program B — Business Credit',
  'Progress & Documents',
  'Billing & Support',
]

const PROGRAMS = [
  { value: 'all', label: 'All Programs' },
  { value: 'program_a', label: 'Program A only' },
  { value: 'program_b', label: 'Program B only' },
]

const BLANK: Omit<TrainingVideo, 'id'> = {
  title: '',
  description: '',
  duration: '',
  category: 'Getting Started',
  program: 'all',
  embed_url: '',
  is_published: false,
  sort_order: 0,
}

export default function TrainingAdminClient({ initialVideos }: { initialVideos: TrainingVideo[] }) {
  const [videos, setVideos] = useState<TrainingVideo[]>(initialVideos)
  const [editing, setEditing] = useState<Partial<TrainingVideo> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const openNew = () => {
    setIsNew(true)
    setEditing({ ...BLANK })
    setError('')
  }

  const openEdit = (v: TrainingVideo) => {
    setIsNew(false)
    setEditing({ ...v })
    setError('')
  }

  const cancelEdit = () => {
    setEditing(null)
    setError('')
  }

  const save = async () => {
    if (!editing) return
    if (!editing.title?.trim()) { setError('Title is required'); return }
    if (!editing.category?.trim()) { setError('Category is required'); return }

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/training', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      if (isNew) {
        setVideos(prev => [...prev, data.video])
      } else {
        setVideos(prev => prev.map(v => v.id === data.video.id ? data.video : v))
      }
      setEditing(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async (video: TrainingVideo) => {
    try {
      const res = await fetch('/api/admin/training', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: video.id, is_published: !video.is_published }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setVideos(prev => prev.map(v => v.id === data.video.id ? data.video : v))
    } catch {}
  }

  const deleteVideo = async (id: string) => {
    if (!confirm('Delete this video?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/training?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setVideos(prev => prev.filter(v => v.id !== id))
    } catch {}
    setDeleting(null)
  }

  const filtered = filter === 'all' ? videos : videos.filter(v => v.category === filter)
  const categories = CATEGORIES.filter(c => filter === 'all' || c === filter)

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50')}
          >
            All ({videos.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = videos.filter(v => v.category === cat).length
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filter === cat ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50')}
              >
                {cat.split('—')[0].trim()} ({count})
              </button>
            )
          })}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Video
        </button>
      </div>

      {/* Add/Edit form */}
      {editing && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">{isNew ? 'Add New Video' : 'Edit Video'}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
              <input
                value={editing.title ?? ''}
                onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Welcome to the Sourcify Portal"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={editing.description ?? ''}
                onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description shown on the video card"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Embed URL</label>
              <input
                value={editing.embed_url ?? ''}
                onChange={e => setEditing(p => ({ ...p, embed_url: e.target.value }))}
                placeholder="https://www.youtube.com/embed/... or Loom/Guidde embed URL"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">YouTube: use /embed/VIDEO_ID · Loom: use /embed/ID · Guidde: use their share embed link</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={editing.category ?? 'Getting Started'}
                onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Visible To</label>
              <select
                value={editing.program ?? 'all'}
                onChange={e => setEditing(p => ({ ...p, program: e.target.value as TrainingVideo['program'] }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PROGRAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Duration (optional)</label>
              <input
                value={editing.duration ?? ''}
                onChange={e => setEditing(p => ({ ...p, duration: e.target.value }))}
                placeholder="e.g. 3:45"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sort Order</label>
              <input
                type="number"
                value={editing.sort_order ?? 0}
                onChange={e => setEditing(p => ({ ...p, sort_order: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_published"
                checked={editing.is_published ?? false}
                onChange={e => setEditing(p => ({ ...p, is_published: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="is_published" className="text-sm font-medium text-gray-700">
                Published (visible to clients)
              </label>
            </div>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Video'}
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Video list grouped by category */}
      {categories.map(cat => {
        const catVideos = filtered.filter(v => v.category === cat)
        if (!catVideos.length) return null
        return (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{cat}</h3>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {catVideos.map(video => (
                <div key={video.id} className="flex items-center gap-3 px-4 py-3">
                  <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{video.title}</p>
                      {video.is_published ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Live</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Draft</span>
                      )}
                      {video.program !== 'all' && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                          {video.program === 'program_a' ? 'Prog A' : 'Prog B'}
                        </span>
                      )}
                    </div>
                    {video.embed_url ? (
                      <p className="text-xs text-gray-400 truncate font-mono mt-0.5">{video.embed_url}</p>
                    ) : (
                      <p className="text-xs text-amber-500 mt-0.5">No embed URL — shows as Coming Soon</p>
                    )}
                  </div>

                  {video.duration && (
                    <span className="text-xs text-gray-400 flex-shrink-0">{video.duration}</span>
                  )}

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => togglePublish(video)}
                      title={video.is_published ? 'Unpublish' : 'Publish'}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {video.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEdit(video)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteVideo(video.id)}
                      disabled={deleting === video.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && !editing && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No videos yet. Click <strong>Add Video</strong> to get started.</p>
        </div>
      )}
    </div>
  )
}
