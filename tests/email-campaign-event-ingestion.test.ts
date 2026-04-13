import test from 'node:test'
import assert from 'node:assert/strict'
import { processCampaignSesEvent } from '@/lib/email-campaign-event-ingestion'

function createMockDb(responses: Array<{ data?: any; error?: { message: string } | null; count?: number }>) {
  const calls: Array<{ table: string; method: string; payload?: unknown }> = []
  let index = 0

  function nextResponse(table: string) {
    if (index >= responses.length) {
      throw new Error(`No mock response left for ${table}`)
    }
    const response = responses[index]
    index += 1
    return response
  }

  class MockQuery {
    table: string

    constructor(table: string) {
      this.table = table
    }

    select(...args: unknown[]) {
      calls.push({ table: this.table, method: 'select', payload: args })
      return this
    }

    insert(payload: unknown) {
      calls.push({ table: this.table, method: 'insert', payload })
      return this
    }

    update(payload: unknown) {
      calls.push({ table: this.table, method: 'update', payload })
      return this
    }

    eq() { return this }
    ilike() { return this }
    neq() { return this }
    gte() { return this }
    lt() { return this }

    maybeSingle() {
      return Promise.resolve(nextResponse(this.table))
    }

    then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
      return Promise.resolve(nextResponse(this.table)).then(resolve, reject)
    }
  }

  return {
    calls,
    from(table: string) {
      return new MockQuery(table)
    },
  }
}

test('processCampaignSesEvent writes delivery events and increments campaign counters', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'recipient-1',
        campaign_id: 'campaign-1',
        email: 'recipient@example.com',
        send_status: 'sent',
        provider_message_id: 'msg-1',
      },
      error: null,
    },
    { count: 0, error: null },
    { data: {}, error: null },
    { data: {}, error: null },
    { count: 1, error: null },
    { count: 0, error: null },
    { count: 0, error: null },
    { count: 0, error: null },
    { count: 0, error: null },
    { data: {}, error: null },
  ])

  const result = await processCampaignSesEvent(
    {
      payload: {
        eventType: 'Delivery',
        mail: {
          messageId: 'msg-1',
          destination: ['Recipient@Example.com'],
        },
        delivery: {
          timestamp: '2026-04-11T10:00:00.000Z',
          recipients: ['Recipient@Example.com'],
        },
      },
    },
    { db },
  )

  assert.equal(result.success, true)
  assert.equal(result.eventType, 'delivered')
  assert.equal(result.normalizedEmail, 'recipient@example.com')
  assert.equal(result.campaignId, 'campaign-1')
  assert.equal(result.recipientId, 'recipient-1')
  assert.equal(result.duplicateEvent, false)
  assert.ok(db.calls.some((call) => call.table === 'email_events' && call.method === 'insert'))
  assert.ok(db.calls.some((call) => call.table === 'email_campaign_recipients' && call.method === 'update'))
  assert.ok(db.calls.some((call) => call.table === 'email_campaigns' && call.method === 'update'))
})

test('processCampaignSesEvent hard-bounces recipients and writes suppressions', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'recipient-2',
        campaign_id: 'campaign-2',
        email: 'bounce@example.com',
        send_status: 'sent',
        provider_message_id: null,
      },
      error: null,
    },
    { count: 0, error: null },
    { data: {}, error: null },
    { data: {}, error: null },
    { data: {}, error: null },
    { count: 0, error: null },
    { count: 0, error: null },
    { count: 0, error: null },
    { count: 1, error: null },
    { count: 0, error: null },
    { data: {}, error: null },
  ])

  const result = await processCampaignSesEvent(
    {
      payload: {
        eventType: 'Bounce',
        mail: {
          destination: ['Bounce@Example.com'],
        },
        bounce: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          bouncedRecipients: [{ emailAddress: 'Bounce@Example.com' }],
        },
      },
    },
    { db },
  )

  assert.equal(result.success, true)
  assert.equal(result.eventType, 'bounced')
  assert.equal(result.normalizedEmail, 'bounce@example.com')
  assert.equal(result.campaignId, 'campaign-2')
  assert.ok(db.calls.some((call) => call.table === 'email_suppressions' && call.method === 'insert'))
})

test('processCampaignSesEvent skips counter inflation for duplicate events', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'recipient-3',
        campaign_id: 'campaign-3',
        email: 'duplicate@example.com',
        send_status: 'delivered',
        provider_message_id: 'msg-3',
      },
      error: null,
    },
    { count: 1, error: null },
    { data: {}, error: null },
    { count: 0, error: null },
    { count: 1, error: null },
    { count: 0, error: null },
    { count: 0, error: null },
    { count: 0, error: null },
    { data: {}, error: null },
  ])

  const result = await processCampaignSesEvent(
    {
      payload: {
        eventType: 'Open',
        mail: {
          messageId: 'msg-3',
          destination: ['Duplicate@Example.com'],
        },
        open: {
          timestamp: '2026-04-11T10:05:00.000Z',
          recipients: ['Duplicate@Example.com'],
        },
      },
    },
    { db },
  )

  assert.equal(result.success, true)
  assert.equal(result.eventType, 'opened')
  assert.equal(result.duplicateEvent, true)
  assert.equal(db.calls.some((call) => call.table === 'email_campaigns' && call.method === 'update'), true)
})
