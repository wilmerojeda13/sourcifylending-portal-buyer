import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { applyCrmDisposition, getDispositionKeyForOutcome } from '@/lib/crm-dispositions'
import { normalizeCrmTagSlug } from '@/lib/crm-tags'

type Row = Record<string, any>
type Tables = Record<string, Row[]>

class MockQuery {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: any = null
  private filters: Array<(row: Row) => boolean> = []

  constructor(private tables: Tables, private tableName: string) {}

  select() {
    return this
  }

  insert(payload: any) {
    this.action = 'insert'
    this.payload = Array.isArray(payload) ? payload : [payload]
    return this
  }

  update(payload: any) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  eq(field: string, value: any) {
    this.filters.push((row) => row[field] === value)
    return this
  }

  in(field: string, values: any[]) {
    this.filters.push((row) => values.includes(row[field]))
    return this
  }

  is(field: string, value: any) {
    this.filters.push((row) => row[field] === value)
    return this
  }

  maybeSingle() {
    return this.execute(true)
  }

  single() {
    return this.execute(true)
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return this.execute(false).then(resolve, reject)
  }

  private async execute(single: boolean) {
    const rows = this.tables[this.tableName] ?? []

    if (this.action === 'insert') {
      const inserted = this.payload.map((entry: Row) => ({
        id: entry.id ?? randomUUID(),
        created_at: entry.created_at ?? new Date().toISOString(),
        updated_at: entry.updated_at ?? new Date().toISOString(),
        ...entry,
      }))
      rows.push(...inserted)
      this.tables[this.tableName] = rows
      return { data: single ? inserted[0] ?? null : inserted, error: null }
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

    const data = rows.filter((row) => this.filters.every((filter) => filter(row)))
    return { data: single ? data[0] ?? null : data, error: null }
  }
}

function createMockSupabase(initial?: Partial<Tables>) {
  const tables: Tables = {
    crm_leads: [],
    crm_calls: [],
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

function createRelationMissingSupabase(
  missingTables: string[],
  initial?: Partial<Tables>,
) {
  const base = createMockSupabase(initial)
  const missing = new Set(missingTables)

  return {
    tables: base.tables,
    from(tableName: string) {
      if (!missing.has(tableName)) {
        return base.from(tableName)
      }

      const missingError = {
        code: '42P01',
        message: `relation "${tableName}" does not exist`,
        details: null,
      }

      return {
        select() { return this },
        insert() { return this },
        update() { return this },
        delete() { return this },
        eq() { return this },
        in() { return this },
        is() { return this },
        single: async () => ({ data: null, error: missingError }),
        maybeSingle: async () => ({ data: null, error: missingError }),
        then(resolve: (value: any) => any, reject?: (reason: any) => any) {
          return Promise.resolve({ data: null, error: missingError }).then(resolve, reject)
        },
      }
    },
  }
}

test('applyCrmDisposition updates lead and call, creates follow-up task, activity, and audit log', async () => {
  const mock = createMockSupabase({
    crm_leads: [
      {
        id: 'lead-1',
        first_name: 'Jane',
        last_name: 'Prospect',
        business_name: 'Acme LLC',
        lead_temperature: 'warm',
        assigned_to_user_id: 'rep-1',
        assigned_to_name: 'Rep One',
        stage: 'new',
      },
    ],
    crm_calls: [
      {
        id: 'call-1',
        lead_id: 'lead-1',
        call_status: 'in_progress',
      },
    ],
  })

  const result = await applyCrmDisposition(mock as any, {
    leadId: 'lead-1',
    callId: 'call-1',
    dispositionKey: 'follow_up',
    note: 'Needs updated bank statements.',
    followUpAt: '2026-04-09T15:30:00.000Z',
    actorUserId: 'admin-1',
    actorName: 'Admin User',
  })

  assert.equal(result.disposition.key, 'follow_up')
  assert.equal(mock.tables.crm_leads[0].stage, 'follow_up')
  assert.equal(mock.tables.crm_leads[0].last_call_outcome, 'Follow Up')
  assert.equal(mock.tables.crm_leads[0].latest_call_note, 'Needs updated bank statements.')
  assert.equal(mock.tables.crm_leads[0].follow_up_at, '2026-04-09T15:30:00.000Z')
  assert.equal(mock.tables.crm_calls[0].call_outcome, 'Follow Up')
  assert.equal(mock.tables.crm_calls[0].call_status, 'completed')
  assert.equal(mock.tables.crm_tasks.length, 1)
  assert.equal(mock.tables.crm_tasks[0].created_source, 'disposition')
  assert.equal(mock.tables.crm_tasks[0].created_source_label, 'Disposition: Follow Up')
  assert.equal(mock.tables.crm_tasks[0].due_at, '2026-04-09T15:30:00.000Z')
  assert.equal(mock.tables.crm_activities.length, 1)
  assert.equal(mock.tables.crm_activities[0].type, 'disposition')
  assert.equal(mock.tables.crm_activities[0].metadata.follow_up_at, '2026-04-09T15:30:00.000Z')
  assert.equal(mock.tables.crm_audit_logs.length, 1)
  assert.equal(mock.tables.crm_audit_logs[0].action_type, 'disposition_changed')
})

test('applyCrmDisposition rejects missing follow-up time when disposition requires it', async () => {
  const mock = createMockSupabase({
    crm_leads: [
      {
        id: 'lead-2',
        first_name: 'John',
        last_name: 'Callback',
        business_name: null,
        lead_temperature: 'cold',
        assigned_to_user_id: null,
        assigned_to_name: null,
      },
    ],
  })

  await assert.rejects(
    applyCrmDisposition(mock as any, {
      leadId: 'lead-2',
      dispositionKey: 'call_back',
      actorName: 'Admin User',
    }),
    /requires a follow-up date and time/i,
  )
})

test('shared workflow helpers normalize tag slugs and map outcomes back to disposition keys', () => {
  assert.equal(normalizeCrmTagSlug('  Hot Lead  '), 'hot-lead')
  assert.equal(normalizeCrmTagSlug('Docs Missing / Urgent'), 'docs-missing-urgent')
  assert.equal(getDispositionKeyForOutcome('Do Not Call'), 'dnc')
  assert.equal(getDispositionKeyForOutcome('Follow Up'), 'follow_up')
  assert.equal(getDispositionKeyForOutcome('Unknown Outcome'), null)
})

test('applyCrmDisposition degrades when workflow tracking tables are unavailable', async () => {
  const mock = createRelationMissingSupabase(['crm_activities', 'crm_audit_logs'], {
    crm_leads: [
      {
        id: 'lead-3',
        first_name: 'Mia',
        last_name: 'Pipeline',
        business_name: 'Northwind',
        lead_temperature: 'cold',
        assigned_to_user_id: null,
        assigned_to_name: null,
        stage: 'new',
      },
    ],
    crm_calls: [
      {
        id: 'call-3',
        lead_id: 'lead-3',
        call_status: 'in_progress',
      },
    ],
  })

  const result = await applyCrmDisposition(mock as any, {
    leadId: 'lead-3',
    callId: 'call-3',
    dispositionKey: 'interested',
    actorName: 'Admin User',
  })

  assert.equal(mock.tables.crm_leads[0].last_call_outcome, 'Interested')
  assert.equal(mock.tables.crm_calls[0].call_outcome, 'Interested')
  assert.deepEqual(result.warnings.sort(), ['crm_activities_unavailable', 'crm_audit_logs_unavailable'])
})
