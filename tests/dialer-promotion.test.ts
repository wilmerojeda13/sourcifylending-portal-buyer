import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { parsePromotionRpcResult, promoteToCrm } from '@/lib/dialer-promotion'

type Row = Record<string, any>
type Tables = Record<string, Row[]>

class MockQuery {
  private action: 'select' | 'insert' | 'update' = 'select'
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

  eq(field: string, value: any) {
    this.filters.push((row) => row[field] === value)
    return this
  }

  or(expression: string) {
    const clauses = expression.split(',').map((clause) => clause.trim()).filter(Boolean)
    this.filters.push((row) =>
      clauses.some((clause) => {
        const [field, operator, ...raw] = clause.split('.')
        const value = raw.join('.')
        if (operator !== 'eq') return false
        return String(row[field] ?? '') === value
      }),
    )
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

    const data = rows.filter((row) => this.filters.every((filter) => filter(row)))
    return { data: single ? data[0] ?? null : data, error: null }
  }
}

function createMockSupabase(initial?: Partial<Tables>) {
  const tables: Tables = {
    dialer_raw_leads: [],
    crm_leads: [],
    crm_tasks: [],
    dialer_promotion_log: [],
    ...initial,
  }

  return {
    tables,
    from(tableName: string) {
      return new MockQuery(tables, tableName)
    },
    rpc: async (_fn: string, _args: Record<string, unknown>) => ({
      data: null,
      error: { message: 'rpc unavailable' },
    }),
  }
}

test('promotion fallback unarchives merged CRM leads and keeps them visible', async () => {
  const mock = createMockSupabase({
    dialer_raw_leads: [
      {
        id: 'raw-1',
        first_name: 'Jane',
        last_name: 'Prospect',
        phone: '+15551234567',
        phone_e164: '+15551234567',
        email: 'jane@example.com',
        business_name: 'Acme LLC',
        notes: 'Dialer note',
        source: 'manual',
        promoted_to_crm_lead_id: null,
      },
    ],
    crm_leads: [
      {
        id: 'crm-1',
        first_name: 'Jane',
        last_name: 'Old',
        phone: '+15551234567',
        phone_e164: '+15551234567',
        email: null,
        business_name: null,
        notes: 'Existing CRM note',
        source: 'manual',
        stage: 'new',
        is_archived: true,
      },
    ],
  })

  const result = await promoteToCrm(mock as any, {
    rawLeadId: 'raw-1',
    trigger: 'qualified',
    userId: 'admin-1',
    workflowState: {
      crm_stage: 'qualified',
      last_call_outcome: 'qualified',
      last_call_at: '2026-04-15T15:30:00.000Z',
    },
  })

  assert.equal(result.crmLeadId, 'crm-1')
  assert.equal(result.merged, true)
  assert.equal(result.alreadyPromoted, false)
  assert.equal(mock.tables.dialer_raw_leads[0].promoted_to_crm_lead_id, 'crm-1')
  assert.equal(mock.tables.crm_leads[0].is_archived, false)
  assert.equal(mock.tables.crm_leads[0].stage, 'qualified')
  assert.equal(mock.tables.crm_leads[0].last_call_outcome, 'qualified')
})

test('promotion RPC result parser accepts Supabase row objects and tuples', () => {
  assert.deepEqual(
    parsePromotionRpcResult([{ crm_lead_id: 'crm-123', merged: true, already_promoted: false }]),
    {
      crmLeadId: 'crm-123',
      merged: true,
      alreadyPromoted: false,
    },
  )

  assert.deepEqual(
    parsePromotionRpcResult(['crm-456', false, true]),
    {
      crmLeadId: 'crm-456',
      merged: false,
      alreadyPromoted: true,
    },
  )
})
