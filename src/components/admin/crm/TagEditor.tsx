'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import TagBadge, { type CRMTagBadge } from '@/components/admin/crm/TagBadge'
import { cn } from '@/lib/utils'

const TAG_COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink']

export default function TagEditor({
  leadId,
  tags,
  onChange,
  compact = false,
}: {
  leadId: string
  tags: CRMTagBadge[]
  onChange: (tags: CRMTagBadge[]) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [availableTags, setAvailableTags] = useState<CRMTagBadge[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('slate')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState('slate')
  const [savingTagId, setSavingTagId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    fetch('/api/admin/crm/tags', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (!active) return
        setAvailableTags(json.tags ?? [])
      })
      .catch(() => {
        toast.error('Failed to load tags')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

  async function applyTagChange(nextTagIds: string[], nextTags: CRMTagBadge[]) {
    const previousTagIds = new Set(tags.map((tag) => tag.id))
    const nextTagIdSet = new Set(nextTagIds)
    const addedTagIds = nextTagIds.filter((tagId) => !previousTagIds.has(tagId))
    const removedTagIds = tags.filter((tag) => !nextTagIdSet.has(tag.id)).map((tag) => tag.id)

    try {
      if (addedTagIds.length > 0) {
        const response = await fetch('/api/admin/crm/tag-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'lead',
            entity_ids: [leadId],
            tag_ids: addedTagIds,
          }),
        })
        if (!response.ok) throw new Error('Failed to add tags')
      }

      if (removedTagIds.length > 0) {
        const response = await fetch('/api/admin/crm/tag-links', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'lead',
            entity_ids: [leadId],
            tag_ids: removedTagIds,
          }),
        })
        if (!response.ok) throw new Error('Failed to remove tags')
      }

      onChange(nextTags)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update tags')
    }
  }

  async function createTag() {
    if (!newTagName.trim()) {
      toast.error('Tag name is required')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/admin/crm/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTagName,
          color: newTagColor,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to create tag')

      const tag = json.tag as CRMTagBadge
      setAvailableTags((current) => [...current, tag].sort((left, right) => left.name.localeCompare(right.name)))
      setNewTagName('')
      await applyTagChange([...tags.map((current) => current.id), tag.id], [...tags, tag])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create tag')
    } finally {
      setCreating(false)
    }
  }

  function toggleTag(tag: CRMTagBadge) {
    const hasTag = tags.some((current) => current.id === tag.id)
    const nextTags = hasTag
      ? tags.filter((current) => current.id !== tag.id)
      : [...tags, tag].sort((left, right) => left.name.localeCompare(right.name))
    const nextTagIds = nextTags.map((current) => current.id)
    void applyTagChange(nextTagIds, nextTags)
  }

  function beginEdit(tag: CRMTagBadge) {
    setEditingTagId(tag.id)
    setEditTagName(tag.name)
    setEditTagColor(tag.color)
  }

  function cancelEdit() {
    setEditingTagId(null)
    setEditTagName('')
    setEditTagColor('slate')
  }

  async function saveTag(tagId: string) {
    if (!editTagName.trim()) {
      toast.error('Tag name is required')
      return
    }

    setSavingTagId(tagId)
    try {
      const response = await fetch(`/api/admin/crm/tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editTagName,
          color: editTagColor,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to update tag')

      const nextTag = json.tag as CRMTagBadge
      setAvailableTags((current) => current
        .map((tag) => (tag.id === tagId ? nextTag : tag))
        .sort((left, right) => left.name.localeCompare(right.name)))
      onChange(tags.map((tag) => (tag.id === tagId ? nextTag : tag)).sort((left, right) => left.name.localeCompare(right.name)))
      cancelEdit()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update tag')
    } finally {
      setSavingTagId(null)
    }
  }

  async function deleteTag(tag: CRMTagBadge) {
    const confirmed = window.confirm(`Delete "${tag.name}"? This removes it from all contacts.`)
    if (!confirmed) return

    setSavingTagId(tag.id)
    try {
      const response = await fetch(`/api/admin/crm/tags/${tag.id}`, {
        method: 'DELETE',
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || 'Failed to delete tag')

      setAvailableTags((current) => current.filter((item) => item.id !== tag.id))
      if (tags.some((item) => item.id === tag.id)) {
        onChange(tags.filter((item) => item.id !== tag.id))
      }
      if (editingTagId === tag.id) {
        cancelEdit()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete tag')
    } finally {
      setSavingTagId(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {tags.length === 0 && <span className="text-xs text-gray-400">No tags</span>}
        {tags.map((tag) => (
          <TagBadge
            key={tag.id}
            tag={tag}
            removable
            onRemove={() => toggleTag(tag)}
          />
        ))}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-500 hover:border-green-400 hover:text-green-600',
            compact ? 'px-2 py-0.5' : '',
          )}
        >
          <Plus size={12} />
          Tag
        </button>
      </div>

      {open && (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" />
              Loading tags…
            </div>
          ) : (
            <div className="space-y-2">
              {availableTags.map((tag) => {
                const active = tags.some((current) => current.id === tag.id)
                return (
                  <div key={tag.id} className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                          active
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700',
                        )}
                      >
                        {tag.name}
                      </button>
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">{tag.color}</span>
                      <button
                        type="button"
                        onClick={() => beginEdit(tag)}
                        className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-600"
                        aria-label={`Edit ${tag.name}`}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteTag(tag)}
                        disabled={savingTagId === tag.id}
                        className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-red-600 disabled:opacity-60"
                        aria-label={`Delete ${tag.name}`}
                      >
                        {savingTagId === tag.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>

                    {editingTagId === tag.id && (
                      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                        <input
                          value={editTagName}
                          onChange={(event) => setEditTagName(event.target.value)}
                          className="input-field text-sm"
                        />
                        <select
                          value={editTagColor}
                          onChange={(event) => setEditTagColor(event.target.value)}
                          className="input-field text-sm"
                        >
                          {TAG_COLORS.map((color) => (
                            <option key={color} value={color}>{color}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void saveTag(tag.id)}
                          disabled={savingTagId === tag.id}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          {savingTagId === tag.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-white"
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              placeholder="Create tag"
              className="input-field text-sm"
            />
            <select
              value={newTagColor}
              onChange={(event) => setNewTagColor(event.target.value)}
              className="input-field text-sm"
            >
              {TAG_COLORS.map((color) => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={createTag}
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
