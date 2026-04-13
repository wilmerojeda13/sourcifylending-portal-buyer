import test from 'node:test'
import assert from 'node:assert/strict'
import {
  processEmailCampaignSendBatch,
  sendEmailCampaignTest,
  startEmailCampaignSend,
} from '@/lib/email-campaign-sends'

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

    eq() {
      return this
    }

    in() {
      return this
    }

    order() {
      return this
    }

    limit() {
      return this
    }

    neq() {
      return this
    }

    ilike() {
      return this
    }

    gte() {
      return this
    }

    lt() {
      return this
    }

    maybeSingle() {
      return Promise.resolve(nextResponse(this.table))
    }

    single() {
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

test('sendEmailCampaignTest sends to the provided recipient without modifying campaign recipients', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'campaign-1',
        name: 'Draft',
        subject: 'Subject',
        html_body: '<p>Hello <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
        text_body: 'Hello',
        from_email: 'campaign@sourcifylending.com',
        from_name: 'Sourcify Lending',
        status: 'paused',
        recipient_count: 0,
        sent_count: 0,
        delivered_count: 0,
        opened_count: 0,
        clicked_count: 0,
        bounced_count: 0,
        complained_count: 0,
        unsubscribed_count: 0,
        created_by: 'user-1',
        created_at: '2026-04-11T00:00:00.000Z',
        updated_at: '2026-04-11T00:00:00.000Z',
        sent_at: null,
      },
      error: null,
    },
    {
      data: {
        id: 'campaign-1',
        name: 'Draft',
        subject: 'Subject',
        html_body: '<p>Hello <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
        text_body: 'Hello',
        from_email: 'campaign@sourcifylending.com',
        from_name: 'Sourcify Lending',
        status: 'paused',
        recipient_count: 0,
        sent_count: 0,
        delivered_count: 0,
        opened_count: 0,
        clicked_count: 0,
        bounced_count: 0,
        complained_count: 0,
        unsubscribed_count: 0,
        created_by: 'user-1',
        created_at: '2026-04-11T00:00:00.000Z',
        updated_at: '2026-04-11T00:00:00.000Z',
        sent_at: null,
      },
      error: null,
    },
    {
      data: {
        sending_enabled: true,
        daily_send_cap: 100,
        per_campaign_send_cap: 100,
      },
      error: null,
    },
    { data: null, error: null },
    { data: null, error: null },
    { data: null, error: null },
    { count: 0, error: null },
  ])

  const result = await sendEmailCampaignTest(
    {
      campaignId: 'campaign-1',
      recipientEmail: 'Recipient@Example.com',
    },
    {
      db,
      env: {
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'secret',
      } as unknown as NodeJS.ProcessEnv,
      sesClient: {
        async send() {
          return { MessageId: 'ses-test-1' }
        },
      },
    },
  )

  assert.equal(result.success, true)
  assert.equal(result.providerMessageId, 'ses-test-1')
  assert.deepEqual(db.calls.filter((call) => call.table === 'email_campaign_recipients' && call.method === 'update'), [])
})

test('startEmailCampaignSend flips a scheduled campaign into sending', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'campaign-2',
        name: 'Scheduled',
        subject: 'Subject',
        html_body: '<p>Hello</p>',
        text_body: 'Hello',
        from_email: 'campaign@sourcifylending.com',
        from_name: null,
        status: 'scheduled',
        recipient_count: 2,
        sent_count: 0,
        delivered_count: 0,
        opened_count: 0,
        clicked_count: 0,
        bounced_count: 0,
        complained_count: 0,
        unsubscribed_count: 0,
        created_by: 'user-1',
        created_at: '2026-04-11T00:00:00.000Z',
        updated_at: '2026-04-11T00:00:00.000Z',
        sent_at: null,
      },
      error: null,
    },
    {
      data: {
        id: 'campaign-2',
        name: 'Scheduled',
        subject: 'Subject',
        html_body: '<p>Hello</p>',
        text_body: 'Hello',
        from_email: 'campaign@sourcifylending.com',
        from_name: null,
        status: 'sending',
        recipient_count: 2,
        sent_count: 0,
        delivered_count: 0,
        opened_count: 0,
        clicked_count: 0,
        bounced_count: 0,
        complained_count: 0,
        unsubscribed_count: 0,
        created_by: 'user-1',
        created_at: '2026-04-11T00:00:00.000Z',
        updated_at: '2026-04-11T00:00:01.000Z',
        sent_at: null,
      },
      error: null,
    },
  ])

  const result = await startEmailCampaignSend({ campaignId: 'campaign-2' }, { db })

  assert.equal(result.success, true)
  assert.equal(result.campaign?.status, 'sending')
  assert.ok(db.calls.some((call) => call.table === 'email_campaigns' && call.method === 'update'))
})

test('processEmailCampaignSendBatch sends allowed recipients, blocks unsubscribed ones, and finalizes the campaign', async () => {
  const sendingCampaign = {
    id: 'campaign-3',
    name: 'Sending',
    subject: 'Subject',
    html_body: '<p>Hello <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
    text_body: 'Hello',
    from_email: 'campaign@sourcifylending.com',
    from_name: 'Sourcify Lending',
    status: 'sending',
    recipient_count: 2,
    sent_count: 0,
    delivered_count: 0,
    opened_count: 0,
    clicked_count: 0,
    bounced_count: 0,
    complained_count: 0,
    unsubscribed_count: 0,
    created_by: 'user-1',
    created_at: '2026-04-11T00:00:00.000Z',
    updated_at: '2026-04-11T00:00:00.000Z',
    sent_at: null,
  }

  const sendingCampaignWithSentAt = {
    ...sendingCampaign,
    updated_at: '2026-04-11T00:00:01.000Z',
    sent_at: '2026-04-11T00:00:01.000Z',
  }

  const finalCampaign = {
    ...sendingCampaignWithSentAt,
    status: 'sent',
    sent_count: 1,
    updated_at: '2026-04-11T00:00:02.000Z',
  }

  const recipients = [
    {
      id: 'recipient-1',
      campaign_id: 'campaign-3',
      contact_id: null,
      email: 'first@example.com',
      first_name: 'First',
      last_name: 'User',
      send_status: 'pending',
      provider_message_id: null,
      last_event_at: null,
      created_at: '2026-04-11T00:00:00.000Z',
      updated_at: '2026-04-11T00:00:00.000Z',
    },
    {
      id: 'recipient-2',
      campaign_id: 'campaign-3',
      contact_id: null,
      email: 'blocked@example.com',
      first_name: 'Blocked',
      last_name: 'User',
      send_status: 'queued',
      provider_message_id: null,
      last_event_at: null,
      created_at: '2026-04-11T00:00:00.000Z',
      updated_at: '2026-04-11T00:00:00.000Z',
    },
  ]

  const db = createMockDb([
    { data: sendingCampaign, error: null },
    { data: recipients, error: null },
    { data: recipients.map((recipient) => ({ ...recipient, send_status: 'sending' })), error: null },
    { data: sendingCampaignWithSentAt, error: null },
    { data: sendingCampaignWithSentAt, error: null },
    {
      data: {
        sending_enabled: true,
        daily_send_cap: 100,
        per_campaign_send_cap: 100,
      },
      error: null,
    },
    { data: null, error: null },
    { data: null, error: null },
    { data: null, error: null },
    { count: 0, error: null },
    { error: null },
    { data: sendingCampaignWithSentAt, error: null },
    {
      data: {
        sending_enabled: true,
        daily_send_cap: 100,
        per_campaign_send_cap: 100,
      },
      error: null,
    },
    { data: { id: 'unsubscribe-1' }, error: null },
    { data: null, error: null },
    { data: null, error: null },
    { count: 0, error: null },
    { error: null },
    { count: 2, error: null },
    { count: 1, error: null },
    { count: 0, error: null },
    { data: finalCampaign, error: null },
  ])

  const result = await processEmailCampaignSendBatch(
    {
      campaignId: 'campaign-3',
      limit: 10,
    },
    {
      db,
      env: {
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'secret',
      } as unknown as NodeJS.ProcessEnv,
      sesClient: {
        async send() {
          return { MessageId: 'ses-send-1' }
        },
      },
    },
  )

  assert.equal(result.success, true)
  assert.equal(result.sent, 1)
  assert.equal(result.blocked, 1)
  assert.equal(result.remaining, 0)
  assert.equal(result.campaign?.status, 'sent')
  assert.equal(result.campaign?.sent_count, 1)

  const recipientUpdates = db.calls.filter((call) => call.table === 'email_campaign_recipients' && call.method === 'update')
  assert.equal(recipientUpdates.length, 3)
  assert.equal((recipientUpdates[0].payload as any).send_status, 'sending')
  assert.equal((recipientUpdates[1].payload as any).send_status, 'sent')
  assert.equal((recipientUpdates[1].payload as any).provider_message_id, 'ses-send-1')
  assert.equal(typeof (recipientUpdates[1].payload as any).last_event_at, 'string')
  assert.equal((recipientUpdates[2].payload as any).send_status, 'blocked_unsubscribed')
  assert.equal(typeof (recipientUpdates[2].payload as any).last_event_at, 'string')
})
