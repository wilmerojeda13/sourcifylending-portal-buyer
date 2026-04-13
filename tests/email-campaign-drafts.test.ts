import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attachRecipientsToCampaign,
  createEmailCampaignDraft,
  getEmailCampaignDraft,
  updateEmailCampaignDraft,
} from '@/lib/email-campaign-drafts'

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

test('createEmailCampaignDraft creates a draft campaign row', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'campaign-1',
        name: 'Spring Campaign',
        subject: 'Launch',
        html_body: '<p>Hello</p>',
        text_body: 'Hello',
        from_email: 'campaign@sourcifylending.com',
        from_name: 'Sourcify Lending',
        status: 'draft',
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
  ])

  const result = await createEmailCampaignDraft(
    {
      name: 'Spring Campaign',
      subject: 'Launch',
      html_body: '<p>Hello</p>',
      text_body: 'Hello',
      from_email: 'Campaign@SourcifyLending.com',
      from_name: 'Sourcify Lending',
      created_by: 'user-1',
    },
    { db },
  )

  assert.equal(result.success, true)
  assert.equal(result.campaign?.from_email, 'campaign@sourcifylending.com')
  assert.equal(result.campaign?.currentRecipientCount, 0)
  assert.deepEqual(db.calls[0], {
    table: 'email_campaigns',
    method: 'insert',
    payload: {
      name: 'Spring Campaign',
      subject: 'Launch',
      html_body: '<p>Hello</p>',
      text_body: 'Hello',
      from_email: 'campaign@sourcifylending.com',
      from_name: 'Sourcify Lending',
      created_by: 'user-1',
      status: 'draft',
    },
  })
})

test('updateEmailCampaignDraft updates editable draft campaigns only', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'campaign-1',
        status: 'draft',
        recipient_count: 2,
      },
      error: null,
    },
    {
      data: {
        id: 'campaign-1',
        name: 'Updated Name',
        subject: 'Updated Subject',
        html_body: null,
        text_body: 'Updated text',
        from_email: 'updated@sourcifylending.com',
        from_name: null,
        status: 'draft',
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

  const result = await updateEmailCampaignDraft(
    {
      id: 'campaign-1',
      name: 'Updated Name',
      subject: 'Updated Subject',
      text_body: 'Updated text',
      from_email: 'Updated@SourcifyLending.com',
    },
    { db },
  )

  assert.equal(result.success, true)
  assert.equal(result.campaign?.from_email, 'updated@sourcifylending.com')
  assert.equal(result.campaign?.currentRecipientCount, 2)
  assert.deepEqual(db.calls[1], {
    table: 'email_campaigns',
    method: 'update',
    payload: {
      name: 'Updated Name',
      subject: 'Updated Subject',
      text_body: 'Updated text',
      from_email: 'updated@sourcifylending.com',
    },
  })
})

test('updateEmailCampaignDraft blocks non-editable campaigns', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'campaign-1',
        status: 'sent',
        recipient_count: 4,
      },
      error: null,
    },
  ])

  const result = await updateEmailCampaignDraft(
    {
      id: 'campaign-1',
      subject: 'Nope',
    },
    { db },
  )

  assert.equal(result.success, false)
  assert.equal(result.errorMessage, 'campaign_not_editable')
})

test('getEmailCampaignDraft returns the campaign row with current recipient count', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'campaign-1',
        name: 'Draft',
        subject: 'Subject',
        html_body: '<p>Hello</p>',
        text_body: 'Hello',
        from_email: 'campaign@sourcifylending.com',
        from_name: 'Sourcify Lending',
        status: 'draft',
        recipient_count: 7,
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
  ])

  const result = await getEmailCampaignDraft({ id: 'campaign-1' }, { db })

  assert.equal(result.success, true)
  assert.equal(result.campaign?.recipient_count, 7)
  assert.equal(result.campaign?.currentRecipientCount, 7)
})

test('attachRecipientsToCampaign normalizes, deduplicates, skips invalid recipients, and updates recipient_count', async () => {
  const db = createMockDb([
    {
      data: {
        id: 'campaign-1',
        status: 'draft',
        recipient_count: 1,
      },
      error: null,
    },
    {
      data: [
        { email: 'existing@example.com' },
        { email: 'old@example.com' },
      ],
      error: null,
    },
    {
      data: null,
      error: null,
    },
    {
      count: 4,
      error: null,
    },
    {
      data: {
        id: 'campaign-1',
        status: 'draft',
        recipient_count: 4,
      },
      error: null,
    },
  ])

  const result = await attachRecipientsToCampaign(
    {
      campaign_id: 'campaign-1',
      recipients: [
        { email: 'New@Example.com', first_name: 'New', last_name: 'User' },
        { email: 'bad-email', first_name: 'Bad' },
        { email: 'existing@example.com', first_name: 'Existing' },
        { email: 'new@example.com', first_name: 'Dup' },
        { email: 'second@example.com', contact_id: 'lead-2' },
      ],
    },
    { db },
  )

  assert.equal(result.success, true)
  assert.equal(result.attempted, 5)
  assert.equal(result.inserted, 2)
  assert.equal(result.skipped_invalid, 1)
  assert.equal(result.skipped_duplicates, 2)
  assert.equal(result.recipient_count, 4)

  assert.deepEqual(db.calls[2], {
    table: 'email_campaign_recipients',
    method: 'insert',
    payload: [
      {
        campaign_id: 'campaign-1',
        contact_id: null,
        email: 'new@example.com',
        first_name: 'New',
        last_name: 'User',
        send_status: 'pending',
      },
      {
        campaign_id: 'campaign-1',
        contact_id: 'lead-2',
        email: 'second@example.com',
        first_name: null,
        last_name: null,
        send_status: 'pending',
      },
    ],
  })

  assert.deepEqual(db.calls[3], {
    table: 'email_campaign_recipients',
    method: 'select',
    payload: ['id', { count: 'exact', head: true }],
  })

  assert.deepEqual(db.calls[4], {
    table: 'email_campaigns',
    method: 'update',
    payload: { recipient_count: 4 },
  })
})
