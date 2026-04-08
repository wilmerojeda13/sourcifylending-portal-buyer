import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  syncAnalyzerLeadLifecycle,
  syncSignupLeadLifecycle,
} from '@/lib/crm-lead-lifecycle'
import {
  createTrackedAnalyzerSession,
  recordAnalyzerSessionEvent,
} from '@/lib/crm-analyzer-sessions'

type Row = Record<string, any>
type Tables = Record<string, Row[]>

class MockQuery {
  private action: 'select' | 'insert' | 'update' = 'select'
  private payload: any = null
  private filters: Array<(row: Row) => boolean> = []
  private orders: Array<{ field: string; ascending: boolean }> = []
  private maxRows: number | null = null

  constructor(private tables: Tables, private tableName: string) {}

  select() {
    this.action = this.action === 'insert' || this.action === 'update' ? this.action : 'select'
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

  neq(field: string, value: any) {
    this.filters.push((row) => row[field] !== value)
    return this
  }

  in(field: string, values: any[]) {
    this.filters.push((row) => values.includes(row[field]))
    return this
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending ?? true })
    return this
  }

  limit(count: number) {
    this.maxRows = count
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
    return this.execute(true, true)
  }

  single() {
    return this.execute(true, false)
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return this.execute(false, false).then(resolve, reject)
  }

  private async execute(single: boolean, allowNull: boolean) {
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
      return { data: single ? inserted[0] : inserted, error: null }
    }

    if (this.action === 'update') {
      const updated = rows.filter((row) => this.filters.every((filter) => filter(row)))
      for (const row of updated) {
        Object.assign(row, this.payload)
      }
      return { data: single ? updated[0] ?? null : updated, error: null }
    }

    let data = rows.filter((row) => this.filters.every((filter) => filter(row)))
    for (const order of this.orders) {
      data = [...data].sort((a, b) => {
        const left = a[order.field]
        const right = b[order.field]
        if (left === right) return 0
        if (left == null) return 1
        if (right == null) return -1
        const cmp = String(left).localeCompare(String(right))
        return order.ascending ? cmp : -cmp
      })
    }
    if (this.maxRows != null) {
      data = data.slice(0, this.maxRows)
    }

    if (single) {
      return { data: data[0] ?? (allowNull ? null : null), error: null }
    }

    return { data, error: null }
  }
}

function createMockSupabase(initial?: Partial<Tables>) {
  const tables: Tables = {
    crm_leads: [],
    crm_tasks: [],
    crm_activities: [],
    crm_analyzer_sessions: [],
    crm_analyzer_events: [],
    profiles: [],
    leads: [],
    portal_events: [],
    ...initial,
  }

  return {
    tables,
    from(tableName: string) {
      return new MockQuery(tables, tableName)
    },
  }
}

const analyzerInput = {
  business_name: 'Acme Lending LLC',
  business_age: '2-5 years',
  entity_type: 'LLC',
  industry: 'Consulting',
  monthly_revenue_range: '$25,000 - $50,000',
  monthly_deposit_range: '$25,000 - $50,000',
  nsf_last_90_days: false,
  credit_score_range: '680-699',
  utilization_range: '10-29%',
  inquiry_count_last_90_days: '1-2',
  business_credit_reporting_status: 'some_reporting',
  primary_goal: 'build_ein_credit' as const,
}

const analyzerResult = {
  readiness_status: 'Conditionally Ready' as const,
  readiness_score: 72,
  estimated_funding_range: '$50,000-$75,000',
  assigned_program: 'program_b' as const,
  risk_flags: ['High utilization'],
  top_blockers: ['Thin bureau depth'],
  summary: 'Solid file with one material blocker.',
  recommendation: 'Proceed with the business credit builder path.',
  recommended_next_step: 'Open tier-1 vendor accounts.',
  upgrade_cta: 'Create free account',
  disclaimer: 'Informational only.',
}

test('analyzer submission creates a CRM lead, stores analyzer fields, creates a task, and signup merges into the same lead', async () => {
  const mock = createMockSupabase({
    profiles: [
      { id: 'admin-1', is_admin: true, email: 'admin@sourcify.test', full_name: 'Admin User' },
    ],
    leads: [
      {
        id: 'lead-public-1',
        source: 'free_analyzer',
        email: 'prospect@example.com',
        phone: '+15554443333',
        business_name: 'Acme Lending LLC',
        full_name: 'Jane Prospect',
        assigned_program: analyzerResult.assigned_program,
        readiness_status: analyzerResult.readiness_status,
        readiness_score: analyzerResult.readiness_score,
        estimated_funding_range: analyzerResult.estimated_funding_range,
        risk_flags: analyzerResult.risk_flags,
        analyzer_answers: analyzerInput,
        summary: analyzerResult.summary,
        score_breakdown: { top_blockers: analyzerResult.top_blockers },
        raw_result_payload: analyzerResult,
        submitted_at: '2026-04-08T10:00:00.000Z',
      },
    ],
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => '' })) as unknown as typeof fetch
  process.env.RESEND_API_KEY = 'test-key'

  try {
    const analyzerSync = await syncAnalyzerLeadLifecycle({
      supabase: mock as any,
      fullName: 'Jane Prospect',
      email: 'prospect@example.com',
      phone: '+1 (555) 444-3333',
      businessName: 'Acme Lending LLC',
      input: analyzerInput,
      result: analyzerResult,
    })

    assert.equal(analyzerSync.action, 'created')
    assert.equal(analyzerSync.taskCreated, true)
    assert.equal(analyzerSync.notificationSent, true)
    assert.equal(mock.tables.crm_leads.length, 1)
    assert.equal(mock.tables.crm_tasks.length, 1)
    assert.equal(mock.tables.crm_leads[0].readiness_score, 72)
    assert.equal(mock.tables.crm_leads[0].analyzer_submitted, true)
    assert.deepEqual(mock.tables.crm_leads[0].analyzer_answers, analyzerInput)

    const signupSync = await syncSignupLeadLifecycle({
      supabase: mock as any,
      userId: 'user-1',
      fullName: 'Jane Prospect',
      email: 'prospect@example.com',
      businessName: 'Acme Lending LLC',
      source: 'create_prospect',
      suspicious: false,
      analyzerResult,
    })

    assert.equal(signupSync.action, 'updated')
    assert.equal(signupSync.mergedWithAnalyzer, true)
    assert.equal(signupSync.notificationSent, true)
    assert.equal(mock.tables.crm_leads.length, 1)
    assert.equal(mock.tables.crm_leads[0].account_created, true)
    assert.equal(mock.tables.crm_leads[0].id, analyzerSync.leadId)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('signup falls back to normalized phone matching when email does not match and flags duplicate risk when multiple contacts collide', async () => {
  const mock = createMockSupabase({
    profiles: [
      { id: 'admin-1', is_admin: true, email: 'admin@sourcify.test', full_name: 'Admin User' },
    ],
    crm_leads: [
      {
        id: 'crm-1',
        first_name: 'Jane',
        last_name: 'Prospect',
        email: 'old@example.com',
        phone: '+15554443333',
        phone_e164: '+15554443333',
        business_name: 'Acme Lending LLC',
        source: 'free_business_analyzer',
        analyzer_submitted: true,
        analyzer_submitted_at: '2026-04-08T10:00:00.000Z',
      },
      {
        id: 'crm-2',
        first_name: 'Jane',
        last_name: 'Duplicate',
        email: 'other@example.com',
        phone: '+15554443333',
        phone_e164: '+15554443333',
        business_name: 'Acme Lending LLC',
        source: 'manual',
      },
    ],
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => '' })) as unknown as typeof fetch
  process.env.RESEND_API_KEY = 'test-key'

  try {
    const signupSync = await syncSignupLeadLifecycle({
      supabase: mock as any,
      userId: 'user-2',
      fullName: 'Jane Prospect',
      email: 'new@example.com',
      phone: '(555) 444-3333',
      businessName: 'Acme Lending LLC',
      source: 'email_password',
      suspicious: false,
    })

    assert.equal(signupSync.action, 'updated')
    assert.equal(signupSync.duplicateRisk, true)
    assert.equal(signupSync.mergedWithAnalyzer, true)
    assert.equal(mock.tables.crm_leads.length, 2)
    assert.equal(mock.tables.crm_leads[0].account_created, true)
    assert.equal(mock.tables.crm_leads[0].duplicate_review_required, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('live analyzer sessions persist sent/opened/submitted/account-created events for realtime CRM views', async () => {
  const mock = createMockSupabase({
    crm_leads: [
      {
        id: 'crm-live-1',
        first_name: 'Call',
        last_name: 'Prospect',
        email: 'call@example.com',
        phone: '+15553334444',
        source: 'free_business_analyzer',
      },
    ],
  })

  const sessionResult = await createTrackedAnalyzerSession({
    supabase: mock as any,
    leadId: 'crm-live-1',
    repUserId: 'rep-1',
    repName: 'Rep One',
    sourceContext: 'dialer',
    origin: 'https://app.sourcifylending.com',
  })

  assert.equal(mock.tables.crm_analyzer_sessions.length, 1)
  assert.equal(mock.tables.crm_analyzer_events.length, 1)
  assert.equal(sessionResult.session.session_status, 'link_sent')
  assert.match(sessionResult.trackedUrl, /crm_analyzer_session=/)

  await recordAnalyzerSessionEvent({
    supabase: mock as any,
    sessionId: sessionResult.session.id,
    eventType: 'link_opened',
    eventAt: '2026-04-08T11:00:00.000Z',
  })
  await recordAnalyzerSessionEvent({
    supabase: mock as any,
    sessionId: sessionResult.session.id,
    eventType: 'analyzer_started',
    eventAt: '2026-04-08T11:01:00.000Z',
  })
  await recordAnalyzerSessionEvent({
    supabase: mock as any,
    sessionId: sessionResult.session.id,
    eventType: 'readiness_score_generated',
    eventAt: '2026-04-08T11:05:00.000Z',
    metadata: {
      readiness_score: 81,
      readiness_status: 'Ready',
      analyzer_summary: 'Rep can close live on the call.',
      score_breakdown: { top_blockers: [] },
    },
  })
  await recordAnalyzerSessionEvent({
    supabase: mock as any,
    sessionId: sessionResult.session.id,
    eventType: 'account_created',
    eventAt: '2026-04-08T11:08:00.000Z',
    metadata: { user_id: 'prospect-user-1' },
  })

  assert.equal(mock.tables.crm_analyzer_events.length, 5)
  assert.equal(mock.tables.crm_analyzer_sessions[0].latest_event_type, 'account_created')
  assert.equal(mock.tables.crm_analyzer_sessions[0].readiness_score, 81)
  assert.equal(mock.tables.crm_analyzer_sessions[0].account_created, true)
  assert.equal(mock.tables.crm_leads[0].latest_analyzer_session_id, sessionResult.session.id)
  assert.equal(mock.tables.crm_leads[0].latest_analyzer_session_status, 'account_created')
  assert.ok(mock.tables.crm_activities.some((row) => row.metadata?.event_type === 'link_sent'))
  assert.ok(mock.tables.crm_activities.some((row) => row.metadata?.event_type === 'account_created'))
})
