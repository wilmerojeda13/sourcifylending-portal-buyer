import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCampaignSendAttempt } from '@/lib/campaign-send-gate'

function createSequenceDb(responses: any[]) {
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

    select() {
      return this
    }

    eq() {
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

    neq() {
      return this
    }

    maybeSingle() {
      return Promise.resolve(nextResponse(this.table))
    }

    then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
      return Promise.resolve(nextResponse(this.table)).then(resolve, reject)
    }
  }

  return {
    from(table: string) {
      return new MockQuery(table)
    },
  }
}

function buildBaseResponses({
  campaignStatus = 'scheduled',
  sentCount = 0,
  sendingEnabled = true,
  dailySendCap = 10,
  perCampaignSendCap = 5,
  unsubscribe = false,
  suppression = false,
  duplicateStatus = null,
  dailyCount = 0,
}: {
  campaignStatus?: string
  sentCount?: number
  sendingEnabled?: boolean
  dailySendCap?: number
  perCampaignSendCap?: number
  unsubscribe?: boolean
  suppression?: boolean
  duplicateStatus?: string | null
  dailyCount?: number
}) {
  return [
    { data: { status: campaignStatus, sent_count: sentCount }, error: null },
    {
      data: {
        sending_enabled: sendingEnabled,
        daily_send_cap: dailySendCap,
        per_campaign_send_cap: perCampaignSendCap,
      },
      error: null,
    },
    { data: unsubscribe ? { id: 'unsubscribe-1' } : null, error: null },
    { data: suppression ? { id: 'suppression-1' } : null, error: null },
    { data: duplicateStatus ? { id: 'recipient-1', send_status: duplicateStatus } : null, error: null },
    { count: dailyCount, error: null },
  ]
}

test('validateCampaignSendAttempt allows a scheduled campaign send when all checks pass', async () => {
  const result = await validateCampaignSendAttempt(
    {
      campaignId: 'campaign-1',
      recipientEmail: 'Recipient@Example.com',
      fromEmail: 'Campaign@SourcifyLending.com',
      subject: 'Campaign Subject',
      htmlBody: '<p>Hello <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
      textBody: 'Hello',
      sendMode: 'campaign',
    },
    { db: createSequenceDb(buildBaseResponses({})) },
  )

  assert.equal(result.allowed, true)
  assert.equal(result.normalizedEmail, 'recipient@example.com')
  assert.deepEqual(result.reasons, [])
})

test('validateCampaignSendAttempt allows a draft test send', async () => {
  const result = await validateCampaignSendAttempt(
    {
      campaignId: 'campaign-1',
      recipientEmail: 'Test@Example.com',
      fromEmail: 'Campaign@SourcifyLending.com',
      subject: 'Test Subject',
      htmlBody: '<p>Test <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
      textBody: 'Test',
      sendMode: 'test',
    },
    { db: createSequenceDb(buildBaseResponses({ campaignStatus: 'draft' })) },
  )

  assert.equal(result.allowed, true)
  assert.deepEqual(result.reasons, [])
})

test('validateCampaignSendAttempt blocks campaign sends from draft campaigns', async () => {
  const result = await validateCampaignSendAttempt(
    {
      campaignId: 'campaign-1',
      recipientEmail: 'Blocked@Example.com',
      fromEmail: 'Campaign@SourcifyLending.com',
      subject: 'Campaign Subject',
      htmlBody: '<p>Hello <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
      textBody: 'Hello',
      sendMode: 'campaign',
    },
    { db: createSequenceDb(buildBaseResponses({ campaignStatus: 'draft' })) },
  )

  assert.equal(result.allowed, false)
  assert.ok(result.reasons.includes('campaign_status_not_eligible'))
})

test('validateCampaignSendAttempt blocks missing unsubscribe links and invalid recipient emails', async () => {
  const result = await validateCampaignSendAttempt(
    {
      campaignId: 'campaign-1',
      recipientEmail: 'not-an-email',
      fromEmail: 'Campaign@SourcifyLending.com',
      subject: 'Campaign Subject',
      htmlBody: '<p>Hello</p>',
      textBody: 'Hello',
      sendMode: 'campaign',
    },
    { db: createSequenceDb(buildBaseResponses({})) },
  )

  assert.equal(result.allowed, false)
  assert.ok(result.reasons.includes('recipient_email_invalid'))
  assert.ok(result.reasons.includes('unsubscribe_link_missing'))
})

test('validateCampaignSendAttempt blocks unsubscribed recipients', async () => {
  const result = await validateCampaignSendAttempt(
    {
      campaignId: 'campaign-1',
      recipientEmail: 'Unsubscribed@Example.com',
      fromEmail: 'Campaign@SourcifyLending.com',
      subject: 'Campaign Subject',
      htmlBody: '<p>Hello <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
      textBody: 'Hello',
      sendMode: 'campaign',
    },
    {
      db: createSequenceDb(
        buildBaseResponses({
          unsubscribe: true,
        }),
      ),
    },
  )

  assert.equal(result.allowed, false)
  assert.ok(result.reasons.includes('recipient_unsubscribed'))
})

test('validateCampaignSendAttempt blocks suppressed recipients and duplicate sends', async () => {
  const result = await validateCampaignSendAttempt(
    {
      campaignId: 'campaign-1',
      recipientEmail: 'Suppressed@Example.com',
      fromEmail: 'Campaign@SourcifyLending.com',
      subject: 'Campaign Subject',
      htmlBody: '<p>Hello <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
      textBody: 'Hello',
      sendMode: 'campaign',
    },
    {
      db: createSequenceDb(
        buildBaseResponses({
          suppression: true,
          duplicateStatus: 'sent',
        }),
      ),
    },
  )

  assert.equal(result.allowed, false)
  assert.ok(result.reasons.includes('recipient_suppressed'))
  assert.ok(result.reasons.includes('duplicate_campaign_recipient'))
})

test('validateCampaignSendAttempt blocks when sending is disabled or caps are exceeded', async () => {
  const result = await validateCampaignSendAttempt(
    {
      campaignId: 'campaign-1',
      recipientEmail: 'Cap@Example.com',
      fromEmail: 'Campaign@SourcifyLending.com',
      subject: 'Campaign Subject',
      htmlBody: '<p>Hello <a href="https://example.com/unsubscribe">unsubscribe</a></p>',
      textBody: 'Hello',
      sendMode: 'campaign',
    },
    {
      db: createSequenceDb(
        buildBaseResponses({
          sentCount: 5,
          sendingEnabled: false,
          dailySendCap: 1,
          perCampaignSendCap: 5,
          dailyCount: 1,
        }),
      ),
    },
  )

  assert.equal(result.allowed, false)
  assert.ok(result.reasons.includes('sending_disabled'))
  assert.ok(result.reasons.includes('daily_send_cap_exceeded'))
  assert.ok(result.reasons.includes('per_campaign_send_cap_exceeded'))
})
