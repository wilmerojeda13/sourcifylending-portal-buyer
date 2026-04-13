import test from 'node:test'
import assert from 'node:assert/strict'
import { createSign, generateKeyPairSync } from 'node:crypto'
import {
  buildSnsStringToSign,
  handleSesCampaignWebhook,
  isAllowedSnsCertUrl,
  parseSnsWebhookEnvelope,
  verifySnsSignature,
} from '@/lib/ses-campaign-webhook'

function makeKeyPair() {
  return generateKeyPairSync('rsa', { modulusLength: 2048 })
}

function signEnvelope(envelope: Record<string, unknown>, privateKeyPem: string) {
  const sign = createSign('RSA-SHA256')
  sign.update(buildSnsStringToSign(envelope as any), 'utf8')
  sign.end()
  return sign.sign(privateKeyPem, 'base64')
}

test('parseSnsWebhookEnvelope rejects raw SES bodies without SNS metadata', () => {
  const envelope = parseSnsWebhookEnvelope(JSON.stringify({
    eventType: 'Delivery',
    mail: { messageId: 'msg-1' },
  }))

  assert.equal(envelope, null)
})

test('verifySnsSignature accepts a valid SNS notification signature', () => {
  const { privateKey, publicKey } = makeKeyPair()
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  const envelope = {
    Type: 'Notification',
    Message: '{"eventType":"Delivery"}',
    MessageId: 'msg-1',
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:campaign-topic',
    Timestamp: '2026-04-11T00:00:00.000Z',
    SignatureVersion: '2',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService.pem',
  }

  const signature = signEnvelope(envelope, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  const verified = verifySnsSignature({ ...envelope, Signature: signature }, publicKeyPem)

  assert.equal(verified, true)
})

test('handleSesCampaignWebhook rejects unexpected topics and invalid signatures', async () => {
  const { privateKey, publicKey } = makeKeyPair()
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  const envelope = {
    Type: 'Notification',
    Message: '{"eventType":"Delivery"}',
    MessageId: 'msg-1',
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:wrong-topic',
    Timestamp: '2026-04-11T00:00:00.000Z',
    SignatureVersion: '2',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService.pem',
  }

  const signature = signEnvelope(envelope, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  const body = JSON.stringify({ ...envelope, Signature: signature })

  const wrongTopic = await handleSesCampaignWebhook(body, {
    expectedTopicArn: 'arn:aws:sns:us-east-1:123456789012:expected-topic',
    publicKeyPem,
    onNotification: async () => ({ ok: true }),
  })

  assert.equal(wrongTopic.status, 403)
  assert.equal(wrongTopic.body.error, 'unexpected_topic_arn')

  const invalidSignature = await handleSesCampaignWebhook(JSON.stringify({ ...envelope, TopicArn: 'arn:aws:sns:us-east-1:123456789012:expected-topic', Signature: 'tampered' }), {
    expectedTopicArn: 'arn:aws:sns:us-east-1:123456789012:expected-topic',
    publicKeyPem,
    onNotification: async () => ({ ok: true }),
  })

  assert.equal(invalidSignature.status, 400)
  assert.equal(invalidSignature.body.error, 'invalid_sns_signature')
})

test('handleSesCampaignWebhook confirms subscriptions and forwards verified notifications', async () => {
  const { privateKey, publicKey } = makeKeyPair()
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  const notificationEnvelope = {
    Type: 'Notification',
    Message: JSON.stringify({
      eventType: 'Delivery',
      mail: {
        messageId: 'msg-2',
        destination: ['Recipient@Example.com'],
      },
      delivery: {
        timestamp: '2026-04-11T10:00:00.000Z',
        recipients: ['Recipient@Example.com'],
      },
    }),
    MessageId: 'msg-2',
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:campaign-topic',
    Timestamp: '2026-04-11T00:00:00.000Z',
    SignatureVersion: '2',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService.pem',
  }
  const notificationSignature = signEnvelope(notificationEnvelope, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  const seenPayloads: unknown[] = []

  const notificationResult = await handleSesCampaignWebhook(JSON.stringify({ ...notificationEnvelope, Signature: notificationSignature }), {
    expectedTopicArn: 'arn:aws:sns:us-east-1:123456789012:campaign-topic',
    publicKeyPem,
    onNotification: async (payload) => {
      seenPayloads.push(payload)
      return { ok: true }
    },
  })

  assert.equal(notificationResult.status, 200)
  assert.deepEqual(seenPayloads[0], {
    eventType: 'Delivery',
    mail: {
      messageId: 'msg-2',
      destination: ['Recipient@Example.com'],
    },
    delivery: {
      timestamp: '2026-04-11T10:00:00.000Z',
      recipients: ['Recipient@Example.com'],
    },
  })

  const subscribeEnvelope = {
    Type: 'SubscriptionConfirmation',
    Message: 'Please confirm',
    MessageId: 'msg-3',
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:campaign-topic',
    Timestamp: '2026-04-11T00:00:00.000Z',
    SignatureVersion: '2',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService.pem',
    Token: 'token-1',
    SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription',
  }
  const subscribeSignature = signEnvelope(subscribeEnvelope, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  let confirmedUrl: string | null = null

  const subscribeResult = await handleSesCampaignWebhook(JSON.stringify({ ...subscribeEnvelope, Signature: subscribeSignature }), {
    expectedTopicArn: 'arn:aws:sns:us-east-1:123456789012:campaign-topic',
    publicKeyPem,
    confirmSubscription: async (url) => {
      confirmedUrl = url
    },
    onNotification: async () => ({ ok: true }),
  })

  assert.equal(subscribeResult.status, 200)
  assert.equal(subscribeResult.body.confirmed, true)
  assert.equal(confirmedUrl, 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription')
})

test('isAllowedSnsCertUrl only permits HTTPS SNS certificate URLs', () => {
  assert.equal(isAllowedSnsCertUrl('https://sns.us-east-1.amazonaws.com/SimpleNotificationService.pem'), true)
  assert.equal(isAllowedSnsCertUrl('http://sns.us-east-1.amazonaws.com/SimpleNotificationService.pem'), false)
  assert.equal(isAllowedSnsCertUrl('https://example.com/cert.pem'), false)
})
