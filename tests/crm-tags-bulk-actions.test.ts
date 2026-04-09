import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  assignCrmTags,
  matchesCrmTagFilters,
  normalizeCrmTagSlug,
  unassignCrmTags,
} from '@/lib/crm-tags'
import {
  bulkAssignTasks,
  bulkCompleteTasks,
  bulkDeleteTasks,
} from '@/lib/crm-bulk-actions'

type Row = Record<string, any>
type Tables = Record<string, Row[]>

class MockQuery {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload: Row[] | Row | null = null
  private filters: Array<(row: Row) => boolean> = []
  private selectClause: string | null = null

  constructor(private tables: Tables, private tableName: string) {}

  select(columns?: string) {
    this.selectClause = columns ?? null
    return this
  }

  insert(payload: Row | Row[]) {
    this.action = 'insert'
    this.payload = Array.isArray(payload) ? payload : [payload]
    return this
  }

  upsert(payload: Row | Row[]) {
    this.action = 'upsert'
    this.payload = Array.isArray(payload) ? payload : [payload]
    return this
  }

  update(payload: Row) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  eq(field: string, value: any) {
    if (field.startsWith('crm_tags.')) {
      return this
    }
    this.filters.push((row) => row[field] === value)
    return this
  }

  in(field: string, values: any[]) {
    this.filters.push((row) => values.includes(row[field]))
    return this
  }

  is(field: string, value: any) {
    if (field.startsWith('crm_tags.')) {
      return this
    }
    this.filters.push((row) => row[field] === value)
    return this
  }

  order() {
    return this
  }

  single() {
    return this.execute(true)
  }

  maybeSingle() {
    return this.execute(true)
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return this.execute(false).then(resolve, reject)
  }

  private async execute(single: boolean) {
    const rows = this.tables[this.tableName] ?? []

    if (this.action === 'insert') {
      const inserted = (this.payload as Row[]).map((entry) => ({
        id: entry.id ?? randomUUID(),
        created_at: entry.created_at ?? new Date().toISOString(),
        updated_at: entry.updated_at ?? new Date().toISOString(),
        ...entry,
      }))
      rows.push(...inserted)
      this.tables[this.tableName] = rows
      return { data: single ? inserted[0] ?? null : inserted, error: null }
    }

    if (this.action === 'upsert') {
      const entries = this.payload as Row[]
      if (this.tableName === 'crm_tag_links') {
        for (const entry of entries) {
          const existing = rows.find((row) =>
            row.tag_id === entry.tag_id &&
            row.entity_type === entry.entity_type &&
            row.entity_id === entry.entity_id,
          )
          if (!existing) {
            rows.push({
              id: entry.id ?? randomUUID(),
              created_at: entry.created_at ?? new Date().toISOString(),
              ...entry,
            })
          }
        }
      } else {
        for (const entry of entries) {
          const existingIndex = rows.findIndex((row) => row.id === entry.id)
          if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...entry }
          else rows.push({ id: entry.id ?? randomUUID(), ...entry })
        }
      }
      this.tables[this.tableName] = rows
      return { data: single ? rows[0] ?? null : rows, error: null }
    }

    if (this.action === 'update') {
      const updated = rows.filter((row) => this.filters.every((filter) => filter(row)))
      for (const row of updated) {
        Object.assign(row, this.payload)
      }
      return { data: single ? updated[0] ?? null : updated, error: null }
    }

    if (this.action === 'delete') {
      const kept = rows.filter((row) => !this.filters.every((filter) => filter(row)))
      const deleted = rows.filter((row) => this.filters.every((filter) => filter(row)))
      this.tables[this.tableName] = kept
      return { data: single ? deleted[0] ?? null : deleted, error: null }
    }

    const filtered = rows.filter((row) => this.filters.every((filter) => filter(row)))
    if (this.tableName === 'crm_tag_links' && this.selectClause?.includes('crm_tags!inner')) {
      const result = filtered
        .map((row) => ({
          entity_id: row.entity_id,
          crm_tags: (this.tables.crm_tags ?? []).find((tag) => tag.id === row.tag_id) ?? null,
        }))
        .filter((row) => row.crm_tags)
      return { data: single ? result[0] ?? null : result, error: null }
    }
    return { data: single ? filtered[0] ?? null : filtered, error: null }
  }
}

function createMockSupabase(initial?: Partial<Tables>) {
  const tables: Tables = {
    crm_leads: [],
    crm_tasks: [],
    crm_activities: [],
    crm_audit_logs: [],
    crm_tags: [],
    crm_tag_links: [],
    ...initial,
  }

  return {
    tables,
    from(tableName: string) {
      return new MockQuery(tables, tableName)
    },
  }
}

test('contact tags can be assigned and removed in bulk while syncing crm_leads.tags', async () => {
  const mock = createMockSupabase({
    crm_leads: [
      { id: 'lead-1', tags: [] },
      { id: 'lead-2', tags: [] },
    ],
    crm_tags: [
      { id: 'tag-hot', name: 'Hot Lead', slug: 'hot-lead', color: 'red', deleted_at: null },
      { id: 'tag-dnc', name: 'DNC', slug: 'dnc', color: 'slate', deleted_at: null },
    ],
  })

  await assignCrmTags(mock as any, {
    entityType: 'lead',
    entityIds: ['lead-1', 'lead-2'],
    tagIds: ['tag-hot', 'tag-dnc'],
    createdByName: 'Admin',
  })

  assert.equal(mock.tables.crm_tag_links.length, 4)
  assert.deepEqual(mock.tables.crm_leads.find((row) => row.id === 'lead-1')?.tags, ['DNC', 'Hot Lead'])

  await unassignCrmTags(mock as any, {
    entityType: 'lead',
    entityIds: ['lead-1'],
    tagIds: ['tag-dnc'],
  })

  assert.deepEqual(mock.tables.crm_leads.find((row) => row.id === 'lead-1')?.tags, ['Hot Lead'])
  assert.deepEqual(mock.tables.crm_leads.find((row) => row.id === 'lead-2')?.tags, ['DNC', 'Hot Lead'])
})

test('task bulk actions complete, delete, and reassign tasks without tag logic', async () => {
  const mock = createMockSupabase({
    crm_tasks: [
      { id: 'task-1', lead_id: 'lead-1', title: 'Call back', status: 'To Do' },
      { id: 'task-2', lead_id: 'lead-1', title: 'Collect docs', status: 'To Do' },
      { id: 'task-3', lead_id: null, title: 'Unlinked task', status: 'To Do' },
    ],
  })

  const assignResult = await bulkAssignTasks(mock as any, {
    ids: ['task-1', 'task-2'],
    ownerUserId: 'rep-1',
    ownerName: 'Rep One',
    actorName: 'Admin User',
  })
  assert.deepEqual(assignResult.processedIds, ['task-1', 'task-2'])
  assert.equal(mock.tables.crm_tasks[0].owner_name, 'Rep One')

  const completeResult = await bulkCompleteTasks(mock as any, {
    ids: ['task-1', 'task-3'],
    actorName: 'Admin User',
  })
  assert.deepEqual(completeResult.processedIds, ['task-1', 'task-3'])
  assert.equal(mock.tables.crm_tasks[0].status, 'Done')
  assert.equal(mock.tables.crm_tasks[2].status, 'Done')
  assert.equal(mock.tables.crm_activities.length, 1)

  const deleteResult = await bulkDeleteTasks(mock as any, {
    ids: ['task-2'],
    actorName: 'Admin User',
  })
  assert.deepEqual(deleteResult.processedIds, ['task-2'])
  assert.equal(mock.tables.crm_tasks.some((row) => row.id === 'task-2'), false)
})

test('contact tag filtering supports any, all, and exclude for pipeline and dialer views', () => {
  assert.equal(normalizeCrmTagSlug(' Follow Up This Week '), 'follow-up-this-week')
  assert.equal(matchesCrmTagFilters(['hot', 'reactivated'], { includeTagIds: ['hot'] }), true)
  assert.equal(matchesCrmTagFilters(['hot', 'reactivated'], { includeTagIds: ['hot', 'reactivated'], mode: 'all' }), true)
  assert.equal(matchesCrmTagFilters(['hot', 'reactivated'], { includeTagIds: ['hot', 'dnc'], mode: 'all' }), false)
  assert.equal(matchesCrmTagFilters(['hot', 'reactivated'], { includeTagIds: ['reactivated'], excludeTagIds: ['dnc'] }), true)
  assert.equal(matchesCrmTagFilters(['hot', 'dnc'], { includeTagIds: ['hot'], excludeTagIds: ['dnc'] }), false)
})

test('task surfaces no longer include task tag UI or task tag query logic', () => {
  const repoRoot = process.cwd()
  const tasksClient = fs.readFileSync(path.join(repoRoot, 'src/app/admin/crm/tasks/TasksClient.tsx'), 'utf8')
  const tasksRoute = fs.readFileSync(path.join(repoRoot, 'src/app/api/admin/crm/tasks/route.ts'), 'utf8')
  const bulkRoute = fs.readFileSync(path.join(repoRoot, 'src/app/api/admin/crm/bulk/route.ts'), 'utf8')
  const leadDetailPage = fs.readFileSync(path.join(repoRoot, 'src/app/admin/crm/[id]/page.tsx'), 'utf8')

  assert.equal(tasksClient.includes('Add tag'), false)
  assert.equal(tasksClient.includes('Remove tag'), false)
  assert.equal(tasksClient.includes('tag_id'), false)
  assert.equal(tasksRoute.includes("getTagsForEntities(admin.supabase, 'task'"), false)
  assert.equal(tasksRoute.includes('getTagsForEntities'), false)
  assert.equal(bulkRoute.includes("entityType: 'task'"), false)
  assert.equal(leadDetailPage.includes("getTagsForEntities(supabase, 'task'"), false)
})
