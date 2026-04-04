'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Plus, Loader2, Edit2, Trash2, CheckCircle, X,
  FileText, Save, BookOpen
} from 'lucide-react'

interface Resource {
  id: string
  title: string
  slug: string
  content: string
  category: string
  status: 'published' | 'draft'
  sort_order: number
  created_at: string
}

const CATEGORIES = ['getting_started', 'marketing', 'commission', 'faq', 'legal', 'tools', 'other']
const CATEGORY_LABELS: Record<string, string> = {
  getting_started: 'Getting Started',
  marketing: 'Marketing',
  commission: 'Commission',
  faq: 'FAQ',
  legal: 'Legal',
  tools: 'Tools',
  other: 'Other',
}

const CATEGORY_COLORS: Record<string, string> = {
  getting_started: 'bg-blue-100 text-blue-700',
  marketing: 'bg-purple-100 text-purple-700',
  commission: 'bg-green-100 text-green-700',
  faq: 'bg-amber-100 text-amber-700',
  legal: 'bg-gray-100 text-gray-700',
  tools: 'bg-indigo-100 text-indigo-700',
  other: 'bg-gray-100 text-gray-500',
}

const SUB_NAV = [
  { label: 'Partners', href: '/admin/affiliates' },
  { label: 'Commissions', href: '/admin/affiliates/commissions' },
  { label: 'Settings', href: '/admin/affiliates/settings' },
  { label: 'Resources', href: '/admin/affiliates/resources', active: true },
  { label: 'Flags', href: '/admin/affiliates/flags' },
]

const EMPTY_FORM = { title: '', slug: '', content: '', category: 'getting_started', status: 'published' as 'published' | 'draft', sort_order: 0 }

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Resource | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSaved, setFormSaved] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Resource | null>(null)

  const fetchResources = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/affiliates/resources')
      const data = await res.json()
      setResources(data.resources ?? [])
    } catch { /* no-op */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchResources() }, [fetchResources])

  function openAdd() {
    setEditTarget(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setFormSaved(false)
    setShowModal(true)
  }

  function openEdit(r: Resource) {
    setEditTarget(r)
    setForm({
      title: r.title,
      slug: r.slug,
      content: r.content,
      category: r.category,
      status: r.status,
      sort_order: r.sort_order,
    })
    setFormError('')
    setFormSaved(false)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditTarget(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setFormSaved(false)
  }

  function autoSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleSave() {
    if (!form.title.trim()) { setFormError('Title is required.'); return }
    if (!form.slug.trim()) { setFormError('Slug is required.'); return }
    setFormLoading(true)
    setFormError('')
    try {
      if (editTarget) {
        const res = await fetch('/api/admin/affiliates/resources', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editTarget.id, ...form }),
        })
        const data = await res.json()
        if (!res.ok) { setFormError(data.error || 'Save failed'); setFormLoading(false); return }
      } else {
        const res = await fetch('/api/admin/affiliates/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) { setFormError(data.error || 'Create failed'); setFormLoading(false); return }
      }
      await fetchResources()
      setFormSaved(true)
      setTimeout(() => closeModal(), 1200)
    } catch {
      setFormError('Network error')
    }
    setFormLoading(false)
  }

  async function handleDelete(resource: Resource) {
    setDeleteLoading(resource.id)
    try {
      await fetch('/api/admin/affiliates/resources', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resource.id }),
      })
      await fetchResources()
    } catch { /* no-op */ }
    setDeleteLoading(null)
    setConfirmDelete(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ChevronLeft size={14} /> Admin
            </Link>
            <span className="text-gray-300">/</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Partner Resource Center — Admin</h1>
              <p className="text-sm text-gray-500 mt-0.5">Create and manage partner resource content</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} /> Add Resource
          </button>
        </div>

        {/* Sub-nav */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {SUB_NAV.map(({ label, href, active }) => (
            <Link key={href} href={href}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${active
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-green-700 hover:bg-green-50'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Resource List */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BookOpen size={15} className="text-indigo-600" /> {resources.length} resource{resources.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-400">
              <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Loading resources…
            </div>
          ) : resources.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <FileText size={28} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium text-gray-600">No resources yet</p>
              <p className="text-sm mt-1">Add your first resource to get started.</p>
              <button onClick={openAdd} className="mt-4 text-indigo-600 text-sm font-medium hover:underline">
                + Add Resource
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {resources.map(r => (
                <div key={r.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm truncate">{r.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        CATEGORY_COLORS[r.category] ?? 'bg-gray-100 text-gray-500'
                      }`}>
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        r.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{r.slug}</code>
                      <span className="ml-2">Sort: {r.sort_order}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(r)}
                      className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(r)}
                      disabled={deleteLoading === r.id}
                      className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      {deleteLoading === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-2xl my-8">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                {editTarget ? <Edit2 size={16} className="text-indigo-600" /> : <Plus size={16} className="text-indigo-600" />}
                {editTarget ? 'Edit Resource' : 'Add Resource'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => {
                      setForm(f => ({
                        ...f,
                        title: e.target.value,
                        slug: editTarget ? f.slug : autoSlug(e.target.value),
                      }))
                    }}
                    placeholder="Getting Started as a Sourcify Partner"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Slug *</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="getting-started"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as 'published' | 'draft' }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Content</label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    rows={8}
                    placeholder="Enter resource content (Markdown supported)…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y font-mono"
                  />
                </div>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{formError}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeModal}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={formLoading}
                  className={`flex-1 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                    formSaved ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
                  } disabled:opacity-60`}
                >
                  {formLoading ? (
                    <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  ) : formSaved ? (
                    <><CheckCircle size={14} /> Saved!</>
                  ) : (
                    <><Save size={14} /> {editTarget ? 'Update Resource' : 'Create Resource'}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm p-6 text-center space-y-4">
            <Trash2 size={28} className="text-red-500 mx-auto" />
            <div>
              <h3 className="font-bold text-gray-900">Delete Resource?</h3>
              <p className="text-sm text-gray-500 mt-1">
                "{confirmDelete.title}" will be permanently removed. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleteLoading === confirmDelete.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {deleteLoading === confirmDelete.id ? <Loader2 size={14} className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
