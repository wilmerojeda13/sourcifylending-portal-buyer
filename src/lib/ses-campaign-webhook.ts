import { X509Certificate, createVerify } from 'node:crypto'

const ALLOWED_SNS_TYPES = new Set(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation'])

export interface SnsWebhookEnvelope {
  Type: string
  Message: string
  MessageId: string
  TopicArn: string
  Timestamp: string
  SignatureVersion: string
  Signature: string
  SigningCertURL: string
  Subject?: string
  Token?: string
  SubscribeURL?: string
  UnsubscribeURL?: string
  [key: string]: unknown
}

export interface HandleSesCampaignWebhookOptions {
  expectedTopicArn: string
  publicKeyPem?: string
  fetchCertPem?: (url: string) => Promise<string>
  confirmSubscription?: (url: string) => Promise<void>
  onNotification?: (payload: unknown) => Promise<unknown>
}

export interface HandleSesCampaignWebhookResult {
  status: number
  body: Record<string, unknown>
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseSnsWebhookEnvelope(rawBody: string): SnsWebhookEnvelope | null {
  try {
    const parsed = JSON.parse(rawBody)
    const record = toRecord(parsed)
    if (!record) return null

    const type = asTrimmedString(record.Type)
    const message = asTrimmedString(record.Message)
    const messageId = asTrimmedString(record.MessageId)
    const topicArn = asTrimmedString(record.TopicArn)
    const timestamp = asTrimmedString(record.Timestamp)
    const signatureVersion = asTrimmedString(record.SignatureVersion)
    const signature = asTrimmedString(record.Signature)
    const signingCertUrl = asTrimmedString(record.SigningCertURL)
    const subscribeUrl = asTrimmedString(record.SubscribeURL)
    const unsubscribeUrl = asTrimmedString(record.UnsubscribeURL)
    const token = asTrimmedString(record.Token)

    if (!type || !message || !messageId || !topicArn || !timestamp || !signatureVersion || !signature || !signingCertUrl) {
      return null
    }

    if (!ALLOWED_SNS_TYPES.has(type)) {
      return null
    }

    if (type === 'SubscriptionConfirmation' && (!subscribeUrl || !token)) {
      return null
    }

    if (type === 'UnsubscribeConfirmation' && (!unsubscribeUrl || !token)) {
      return null
    }

    const envelope: SnsWebhookEnvelope = {
      ...record,
      Type: type,
      Message: message,
      MessageId: messageId,
      TopicArn: topicArn,
      Timestamp: timestamp,
      SignatureVersion: signatureVersion,
      Signature: signature,
      SigningCertURL: signingCertUrl,
      ...(subscribeUrl ? { SubscribeURL: subscribeUrl } : {}),
      ...(unsubscribeUrl ? { UnsubscribeURL: unsubscribeUrl } : {}),
      ...(token ? { Token: token } : {}),
    }

    return envelope
  } catch {
    return null
  }
}

export function isAllowedSnsCertUrl(urlString: string) {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return false
  }

  const hostname = url.hostname.toLowerCase()
  const isHttps = url.protocol === 'https:'
  const isSnsHost =
    (hostname.startsWith('sns.') && hostname.endsWith('.amazonaws.com')) ||
    (hostname.startsWith('sns.') && hostname.endsWith('.amazonaws.com.cn'))

  return isHttps && isSnsHost
}

export function isAllowedSnsActionUrl(urlString: string) {
  return isAllowedSnsCertUrl(urlString)
}

export function buildSnsStringToSign(envelope: SnsWebhookEnvelope) {
  const lines: string[] = []
  const push = (key: string, value: string | undefined) => {
    if (value !== undefined) {
      lines.push(key, value)
    }
  }

  if (envelope.Type === 'Notification') {
    push('Message', envelope.Message)
    push('MessageId', envelope.MessageId)
    if (envelope.Subject !== undefined) {
      push('Subject', String(envelope.Subject))
    }
    push('Timestamp', envelope.Timestamp)
    push('TopicArn', envelope.TopicArn)
    push('Type', envelope.Type)
    return lines.join('\n')
  }

  push('Message', envelope.Message)
  push('MessageId', envelope.MessageId)
  push('SubscribeURL', String(envelope.SubscribeURL ?? ''))
  push('Timestamp', envelope.Timestamp)
  push('Token', String(envelope.Token ?? ''))
  push('TopicArn', envelope.TopicArn)
  push('Type', envelope.Type)
  return lines.join('\n')
}

export function verifySnsSignature(envelope: SnsWebhookEnvelope, publicKeyPem: string | Buffer | object) {
  const signatureVersion = String(envelope.SignatureVersion)
  const algorithm = signatureVersion === '1' ? 'RSA-SHA1' : signatureVersion === '2' ? 'RSA-SHA256' : null
  if (!algorithm) return false

  const verifier = createVerify(algorithm)
  verifier.update(buildSnsStringToSign(envelope), 'utf8')
  verifier.end()
  return verifier.verify(publicKeyPem as any, envelope.Signature, 'base64')
}

function parseNotificationMessage(envelope: SnsWebhookEnvelope) {
  const parsed = JSON.parse(envelope.Message)
  return parsed
}

async function defaultFetchCertPem(url: string) {
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`cert_fetch_failed_${res.status}`)
  }
  return await res.text()
}

async function defaultConfirmSubscription(url: string) {
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`subscription_confirm_failed_${res.status}`)
  }
}

export async function handleSesCampaignWebhook(
  rawBody: string,
  options: HandleSesCampaignWebhookOptions,
): Promise<HandleSesCampaignWebhookResult> {
  const envelope = parseSnsWebhookEnvelope(rawBody)
  if (!envelope) {
    return { status: 400, body: { error: 'invalid_sns_payload' } }
  }

  if (!options.expectedTopicArn?.trim()) {
    return { status: 500, body: { error: 'topic_arn_missing' } }
  }

  if (envelope.TopicArn !== options.expectedTopicArn.trim()) {
    return { status: 403, body: { error: 'unexpected_topic_arn' } }
  }

  if (!isAllowedSnsCertUrl(envelope.SigningCertURL)) {
    return { status: 400, body: { error: 'invalid_signing_cert_url' } }
  }

  let verifyKey: string | Buffer | object
  if (options.publicKeyPem) {
    verifyKey = options.publicKeyPem
  } else {
    const fetchCertPem = options.fetchCertPem ?? defaultFetchCertPem
    const certPem = await fetchCertPem(envelope.SigningCertURL)
    const cert = new X509Certificate(certPem)
    const now = new Date()
    if (new Date(cert.validFrom) > now || new Date(cert.validTo) < now) {
      return { status: 400, body: { error: 'signing_cert_expired' } }
    }
    verifyKey = cert.publicKey
  }

  if (!verifySnsSignature(envelope, verifyKey)) {
    return { status: 400, body: { error: 'invalid_sns_signature' } }
  }

  if (envelope.Type === 'SubscriptionConfirmation') {
    const subscribeUrl = asTrimmedString(envelope.SubscribeURL)
    if (!subscribeUrl || !isAllowedSnsActionUrl(subscribeUrl)) {
      return { status: 400, body: { error: 'invalid_subscribe_url' } }
    }

    const confirmSubscription = options.confirmSubscription ?? defaultConfirmSubscription
    await confirmSubscription(subscribeUrl)
    return { status: 200, body: { ok: true, confirmed: true } }
  }

  if (envelope.Type === 'UnsubscribeConfirmation') {
    return { status: 200, body: { ok: true, skipped: true, type: 'UnsubscribeConfirmation' } }
  }

  const onNotification = options.onNotification
  if (!onNotification) {
    return { status: 500, body: { error: 'notification_handler_missing' } }
  }

  let payload: unknown
  try {
    payload = parseNotificationMessage(envelope)
  } catch {
    return { status: 400, body: { error: 'invalid_notification_message' } }
  }

  const result = await onNotification(payload)
  if (result && typeof result === 'object') {
    return { status: 200, body: result as Record<string, unknown> }
  }

  return { status: 200, body: { ok: true } }
}
