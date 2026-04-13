import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import {
  sendCampaignEmail,
  sendTestEmail,
  validateCampaignSesEnv,
} from '@/lib/campaign-email-ses'

test('validateCampaignSesEnv reports missing SES configuration cleanly', () => {
  const result = validateCampaignSesEnv({
    AWS_REGION: '',
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
  } as unknown as NodeJS.ProcessEnv)

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.errorMessage, /AWS_REGION/)
    assert.match(result.errorMessage, /AWS_ACCESS_KEY_ID/)
    assert.match(result.errorMessage, /AWS_SECRET_ACCESS_KEY/)
  }
})

test('sendCampaignEmail builds a raw campaign email and returns the SES message id', async () => {
  let capturedCommand: any = null

  const result = await sendCampaignEmail(
    {
      recipientEmail: 'recipient@example.com',
      subject: 'Campaign Subject',
      htmlBody: '<p>Hello</p>',
      textBody: 'Hello',
      fromEmail: 'campaign@sourcifylending.com',
      fromName: 'Sourcify Lending Campaigns',
      replyToEmail: 'reply@example.com',
      configurationSetName: 'campaign-tracking',
    },
    {
      env: {
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'secret',
      } as unknown as NodeJS.ProcessEnv,
      client: {
        async send(command: any) {
          capturedCommand = command
          return { MessageId: 'ses-message-123' }
        },
      },
    },
  )

  assert.equal(result.success, true)
  assert.equal(result.providerMessageId, 'ses-message-123')
  assert.equal(result.errorMessage, null)
  assert.ok(capturedCommand)
  assert.equal(capturedCommand.input.FromEmailAddress, 'campaign@sourcifylending.com')
  assert.deepEqual(capturedCommand.input.ReplyToAddresses, ['reply@example.com'])
  assert.equal(capturedCommand.input.ConfigurationSetName, 'campaign-tracking')

  const rawMessage = Buffer.from(capturedCommand.input.Content.Raw.Data).toString('utf8')
  assert.match(rawMessage, /From: Sourcify Lending Campaigns <campaign@sourcifylending\.com>/)
  assert.match(rawMessage, /To: recipient@example.com/)
  assert.match(rawMessage, /Subject: Campaign Subject/)
  assert.match(rawMessage, /Content-Type: multipart\/alternative/)
  assert.match(rawMessage, /Hello/)
})

test('sendTestEmail falls back to env defaults and still returns the SES message id', async () => {
  const result = await sendTestEmail(
    {
      recipientEmail: 'test@example.com',
      subject: 'Test Campaign',
      textBody: 'Testing',
    },
    {
      env: {
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_SES_FROM_EMAIL: 'no-reply@sourcifylending.com',
        AWS_SES_FROM_NAME: 'Sourcify Lending',
      } as unknown as NodeJS.ProcessEnv,
      client: {
        async send() {
          return { MessageId: 'ses-message-456' }
        },
      },
    },
  )

  assert.equal(result.success, true)
  assert.equal(result.providerMessageId, 'ses-message-456')
  assert.equal(result.errorMessage, null)
})
